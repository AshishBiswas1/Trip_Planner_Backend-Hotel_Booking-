const fs = require('fs');
const path = require('path');
const catchAsync = require('../util/catchAsync');
const AppError = require('../util/appError');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// In-memory cache for static files
const staticCache = {
  trains: null,
  flights: null,
  buses: null,
  loadedAt: 0
};

const normalize = (v) =>
  String(v || '')
    .trim()
    .toLowerCase();

const getFirstString = (obj, keys) => {
  for (const k of keys) {
    const val = obj?.[k];
    if (typeof val === 'string' && val.trim()) return val.trim();
    if (val && typeof val === 'number') return String(val);
  }
  return '';
};

const extractRouteNames = (route) => {
  if (!Array.isArray(route)) return [];
  return route
    .map((r) => {
      if (typeof r === 'string') return r;
      if (!r || typeof r !== 'object') return '';
      return (
        r.station || r.name || r.city || r.city_name || r.stop || r.title || ''
      );
    })
    .filter(Boolean);
};

const matchesDateDynamic = (targetIso, itemDateRaw) => {
  if (!targetIso) return true;
  // treat missing schedule as recurring (match any date)
  if (!itemDateRaw) return true;

  const target = new Date(targetIso);
  if (Number.isNaN(target.getTime())) return false;

  // normalize raw value to a string
  const raw = Array.isArray(itemDateRaw)
    ? itemDateRaw.join(' ')
    : String(itemDateRaw || '').trim();
  if (!raw) return true;

  // direct ISO/date parse
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const tYMD = target.toISOString().split('T')[0];
    const iYMD = parsed.toISOString().split('T')[0];
    if (tYMD === iYMD) return true;
    return target.getUTCDay() === parsed.getUTCDay();
  }

  const low = raw.toLowerCase();
  if (
    low.includes('daily') ||
    low.includes('everyday') ||
    low.includes('every day')
  )
    return true;
  const dow = target.getUTCDay(); // 0=Sun .. 6=Sat

  if (low.includes('weekend')) return dow === 0 || dow === 6;
  if (
    low.includes('weekday') ||
    low.includes('week days') ||
    /mon[-–]fri|monday[-–]friday/.test(low)
  )
    return dow >= 1 && dow <= 5;

  const dayMap = {
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6
  };

  // range like Mon-Fri or monday-friday
  const rangeMatch = low.match(
    /(sun|mon|tue|tues|wed|thu|thur|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*[-–]\s*(sun|mon|tue|tues|wed|thu|thur|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i
  );
  if (rangeMatch) {
    const a = rangeMatch[1].toLowerCase();
    const b = rangeMatch[2].toLowerCase();
    const start = dayMap[a] ?? dayMap[a.slice(0, 3)];
    const end = dayMap[b] ?? dayMap[b.slice(0, 3)];
    if (start === undefined || end === undefined) return false;
    if (start <= end) return dow >= start && dow <= end;
    return dow >= start || dow <= end; // wrap-around
  }

  // list like Mon,Wed,Fri or monday,tuesday
  const tokens = low
    .split(/[,;\s]+/)
    .map((t) => t.replace(/[^a-z]/g, ''))
    .filter(Boolean);
  for (const tok of tokens) {
    if (dayMap[tok] !== undefined) {
      if (dayMap[tok] === dow) return true;
    }
  }

  // fallback: startsWith ISO
  return raw.startsWith(targetIso);
};

const loadStaticFile = async (name) => {
  try {
    const filePath = path.join(PUBLIC_DIR, name);
    await fs.promises.access(filePath);
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
};

const ensureStaticLoaded = async () => {
  if (staticCache.loadedAt > 0) return;
  const [trains, flights, buses] = await Promise.all([
    loadStaticFile('trains-v3.json'),
    loadStaticFile('flights-v3.json'),
    loadStaticFile('buses-v3.json')
  ]);
  staticCache.trains =
    trains && Array.isArray(trains.trains) ? trains.trains : [];
  staticCache.flights =
    flights && Array.isArray(flights.flights) ? flights.flights : [];
  staticCache.buses = buses && Array.isArray(buses.buses) ? buses.buses : [];
  staticCache.loadedAt = Date.now();
};

const searchFromStatic = async ({ mode, from, to, travelDate }) => {
  await ensureStaticLoaded();

  const isoDate = (() => {
    if (!travelDate) return null;
    const d = new Date(travelDate);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  })();

  const list =
    mode === 'flights'
      ? staticCache.flights
      : mode === 'buses'
        ? staticCache.buses
        : staticCache.trains;
  if (!Array.isArray(list)) return [];

  const fromN = normalize(from);
  const toN = normalize(to);

  return list.filter((item) => {
    const routeArr =
      item.route ||
      item.full_route ||
      item.fullRoute ||
      item.route_info ||
      item.routeDetails;
    if (Array.isArray(routeArr)) {
      const routeList = extractRouteNames(routeArr).map((r) => normalize(r));
      const srcPresent = fromN ? routeList.includes(fromN) : true;
      const dstPresent = toN ? routeList.includes(toN) : true;

      let orderOk = true;
      if (fromN && toN) {
        const iFrom = routeList.indexOf(fromN);
        const iTo = routeList.indexOf(toN);
        orderOk = iFrom >= 0 && iTo >= 0 && iFrom < iTo;
      }

      const dateRaw = getFirstString(item, [
        'departure',
        'date',
        'travel_date',
        'scheduled_date'
      ]);
      const dateMatch =
        mode === 'trains' ? true : matchesDateDynamic(isoDate, dateRaw);

      return srcPresent && dstPresent && orderOk && dateMatch;
    }

    const src =
      getFirstString(item, [
        'source',
        'source_station',
        'from',
        'origin',
        'departure_airport',
        'dep_airport'
      ]) || '';
    const dst =
      getFirstString(item, [
        'destination',
        'destination_station',
        'to',
        'dest',
        'arrival_airport',
        'arr_airport'
      ]) || '';
    const dateVal =
      getFirstString(item, [
        'date',
        'travel_date',
        'run_date',
        'journey_date',
        'departure'
      ]) || '';

    const routeObj =
      item.route ||
      item.full_route ||
      item.fullRoute ||
      item.route_info ||
      item.routeDetails ||
      {};
    const routeSrcText = Array.isArray(routeObj)
      ? extractRouteNames(routeObj).join(' ')
      : [
          routeObj.source,
          routeObj.source_city,
          routeObj.source_state,
          routeObj.from_city,
          routeObj.from_state,
          routeObj.origin,
          routeObj.origin_city
        ]
          .filter(Boolean)
          .join(' ');
    const routeDstText = Array.isArray(routeObj)
      ? extractRouteNames(routeObj).join(' ')
      : [
          routeObj.destination,
          routeObj.destination_city,
          routeObj.destination_state,
          routeObj.to_city,
          routeObj.to_state,
          routeObj.dest
        ]
          .filter(Boolean)
          .join(' ');

    const srcMatch = fromN
      ? normalize(src).includes(fromN) ||
        normalize(routeSrcText).includes(fromN)
      : true;
    const dstMatch = toN
      ? normalize(dst).includes(toN) || normalize(routeDstText).includes(toN)
      : true;
    const dateMatch =
      mode === 'trains' ? true : matchesDateDynamic(isoDate, dateVal);

    return srcMatch && dstMatch && dateMatch;
  });
};

const getScheduleFromStatic = async ({ mode, id }) => {
  await ensureStaticLoaded();
  const list =
    mode === 'flights'
      ? staticCache.flights
      : mode === 'buses'
        ? staticCache.buses
        : staticCache.trains;
  if (!Array.isArray(list)) return null;

  const idN = String(id || '').trim();
  if (!idN) return null;

  return (
    list.find((item) => {
      const trainNo = getFirstString(item, [
        'train_number',
        'train_no',
        'trainNo',
        'number',
        'id'
      ]);
      const flightNo = getFirstString(item, [
        'flight_id',
        'flight_no',
        'flightNumber',
        'callsign',
        'id'
      ]);
      const busNo = getFirstString(item, [
        'bus_id',
        'stop_id',
        'station_code',
        'id'
      ]);

      return [trainNo, flightNo, busNo].some(
        (v) => v && v.toLowerCase() === idN.toLowerCase()
      );
    }) || null
  );
};

// Controllers
exports.searchTrainsByRoute = catchAsync(async (req, res, next) => {
  const { from, to, travelDate } = req.query;
  if (!from || !to)
    return next(new AppError('Please provide from and to', 400));

  const results = await searchFromStatic({
    mode: 'trains',
    from,
    to,
    travelDate
  });

  res.status(200).json({
    status: 'success',
    source: 'static',
    results: results.length,
    data: { trains: results }
  });
});

exports.getTrainSchedule = catchAsync(async (req, res, next) => {
  const trainNo = String(
    req.query.trainNo || req.query.train_number || ''
  ).trim();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const travelDate = req.query.travelDate;

  if (trainNo) {
    const schedule = await getScheduleFromStatic({
      mode: 'trains',
      id: trainNo
    });
    if (!schedule)
      return next(new AppError('Train not found in static data', 404));
    return res
      .status(200)
      .json({ status: 'success', source: 'static', data: { schedule } });
  }

  if (from && to && travelDate) {
    const matches = await searchFromStatic({
      mode: 'trains',
      from,
      to,
      travelDate
    });
    if (!matches || matches.length === 0)
      return next(
        new AppError(
          'No trains found for provided route/date in static data',
          404
        )
      );
    return res.status(200).json({
      status: 'success',
      source: 'static',
      results: matches.length,
      data: { trains: matches }
    });
  }

  return next(
    new AppError(
      'Please provide trainNo or from, to, and travelDate query params.',
      400
    )
  );
});

exports.searchFlightsByRoute = catchAsync(async (req, res, next) => {
  const { from, to, travelDate } = req.query;
  if (!from || !to)
    return next(new AppError('Please provide from and to', 400));

  const results = await searchFromStatic({
    mode: 'flights',
    from,
    to,
    travelDate
  });

  res.status(200).json({
    status: 'success',
    source: 'static',
    results: results.length,
    data: { flights: results }
  });
});

exports.getFlightSchedule = catchAsync(async (req, res, next) => {
  const id = String(req.query.flightNo || req.query.icao24 || '').trim();
  if (!id) return next(new AppError('Please provide flightNo or icao24', 400));

  const schedule = await getScheduleFromStatic({ mode: 'flights', id });
  if (!schedule)
    return next(new AppError('Flight not found in static data', 404));

  res
    .status(200)
    .json({ status: 'success', source: 'static', data: { schedule } });
});

// Buses
exports.getBusStops = catchAsync(async (req, res, next) => {
  const busId = String(req.query.bus_id || req.query.busId || '').trim();
  const travelDate = req.query.travelDate || req.query.date || null;
  if (!busId)
    return next(
      new AppError(
        'Please provide busId or bus_id to get stops for a specific bus',
        400
      )
    );

  await ensureStaticLoaded();
  const buses = staticCache.buses || [];

  const bus = buses.find((b) => {
    const id = getFirstString(b, ['bus_id', 'id']);
    return id && id.toLowerCase() === busId.toLowerCase();
  });

  if (!bus) return next(new AppError('Bus not found in static data', 404));

  if (travelDate) {
    const dateRaw = getFirstString(bus, [
      'departure',
      'date',
      'travel_date',
      'scheduled_date',
      'run_date',
      'journey_date'
    ]);
    if (!matchesDateDynamic(travelDate, dateRaw))
      return next(new AppError('Bus not found on provided date', 404));
  }

  const routeArr =
    bus.route ||
    bus.full_route ||
    bus.fullRoute ||
    bus.route_info ||
    bus.routeDetails ||
    [];

  const stops = Array.isArray(routeArr)
    ? routeArr.map((s) => {
        if (typeof s === 'string') return { station: s };
        return s || {};
      })
    : [];

  res.status(200).json({
    status: 'success',
    source: 'static',
    results: stops.length,
    data: { bus_id: busId, stops }
  });
});

exports.searchBusesByRoute = catchAsync(async (req, res, next) => {
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const travelDate = req.query.travelDate || req.query.date || null;
  if (!from || !to)
    return next(new AppError('Please provide from and to', 400));

  await ensureStaticLoaded();
  const buses = staticCache.buses || [];

  const fromN = normalize(from);
  const toN = normalize(to);

  const matched = buses.filter((s) => {
    const routeArr =
      s.route || s.full_route || s.fullRoute || s.route_info || s.routeDetails;
    if (Array.isArray(routeArr)) {
      const routeList = extractRouteNames(routeArr).map((r) => normalize(r));
      const hasFrom = routeList.includes(fromN);
      const hasTo = routeList.includes(toN);
      if (!(hasFrom && hasTo)) return false;
      const iFrom = routeList.indexOf(fromN);
      const iTo = routeList.indexOf(toN);
      if (!(iFrom >= 0 && iTo >= 0 && iFrom < iTo)) return false;
    } else {
      const src = normalize(
        getFirstString(s, ['source', 'from', 'origin', 'stop'])
      );
      const dst = normalize(
        getFirstString(s, ['destination', 'to', 'dest', 'stop'])
      );
      const routeText = Array.isArray(routeArr)
        ? extractRouteNames(routeArr).join(' ')
        : normalize(
            Object.values(routeArr || s.route || {})
              .filter(Boolean)
              .join(' ')
          );

      const srcMatch =
        src.includes(fromN) || normalize(routeText).includes(fromN);
      const dstMatch = dst.includes(toN) || normalize(routeText).includes(toN);
      if (!(srcMatch && dstMatch)) return false;
    }

    if (travelDate) {
      const dateRaw = getFirstString(s, [
        'departure',
        'date',
        'travel_date',
        'scheduled_date',
        'run_date',
        'journey_date'
      ]);
      if (!matchesDateDynamic(travelDate, dateRaw)) return false;
    }

    return true;
  });

  res.status(200).json({
    status: 'success',
    source: 'static',
    results: matched.length,
    data: { buses: matched }
  });
});

// Export helpers for tests
exports._internal = {
  ensureStaticLoaded,
  searchFromStatic,
  getScheduleFromStatic,
  searchBusesByRoute: exports.searchBusesByRoute
};
