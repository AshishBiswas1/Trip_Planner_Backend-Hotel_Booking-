const axios = require('axios');
const catchAsync = require('../util/catchAsync');
const AppError = require('../util/appError');

const DEFAULT_RAPIDAPI_HOST = 'irctc1.p.rapidapi.com';

const SOURCE_KEYS = [
  'source',
  'source_station_name',
  'source_stn_name',
  'source_stn_code',
  'from',
  'from_station_name',
  'from_station_code',
  'from_std',
  'from_sta',
  'origin',
  'origin_station',
  'origin_station_name',
  'train_src',
  'train_source'
];

const DESTINATION_KEYS = [
  'destination',
  'destination_station_name',
  'destination_stn_name',
  'destination_stn_code',
  'to',
  'to_station_name',
  'to_station_code',
  'to_std',
  'to_sta',
  'dest',
  'dest_station',
  'dest_station_name',
  'train_dst',
  'train_destination'
];

const TRAIN_NO_KEYS = [
  'train_no',
  'trainNo',
  'number',
  'train_number',
  'trainNum',
  'train_code'
];

const DATE_KEYS = [
  'train_date',
  'journey_date',
  'date',
  'travel_date',
  'run_date',
  'dep_date',
  'departure_date'
];

const normalize = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const getFirstStringValue = (record, keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }

    if (value && typeof value === 'object') {
      const nestedValue =
        value.name ||
        value.station_name ||
        value.stationName ||
        value.code ||
        value.station_code ||
        value.stationCode ||
        value.title;

      if (typeof nestedValue === 'string' && nestedValue.trim()) {
        return nestedValue;
      }
    }
  }

  return '';
};

const extractTrainsList = (payload) => {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.trains)) return payload.data.trains;
  if (Array.isArray(payload?.data?.result)) return payload.data.result;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.trains)) return payload.trains;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
};

const extractTrainNo = (train) => {
  const trainNo = getFirstStringValue(train, TRAIN_NO_KEYS);
  if (trainNo) return trainNo;

  const numericCandidates = TRAIN_NO_KEYS.map((key) => train?.[key]).find(
    (value) => typeof value === 'number' || typeof value === 'bigint'
  );

  return numericCandidates ? String(numericCandidates) : '';
};

const toIsoDateString = (value) => {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString().split('T')[0];
};

const trainMatchesTravelDate = (train, isoTravelDate) => {
  if (!isoTravelDate) return true;

  const trainDateValue = getFirstStringValue(train, DATE_KEYS);
  if (!trainDateValue) return true;

  const isoTrainDate = toIsoDateString(trainDateValue);
  if (!isoTrainDate) return true;

  return isoTrainDate === isoTravelDate;
};

const trainMatchesRoute = (train, from, to) => {
  const source = normalize(getFirstStringValue(train, SOURCE_KEYS));
  const destination = normalize(getFirstStringValue(train, DESTINATION_KEYS));

  if (!source || !destination) {
    return true;
  }

  return (
    source.includes(normalize(from)) && destination.includes(normalize(to))
  );
};

const searchTrainsByRouteAndDate = async ({
  rapidApiKey,
  rapidApiHost,
  from,
  to,
  isoTravelDate,
  query
}) => {
  const response = await axios.get(
    `https://${rapidApiHost}/api/v1/searchTrain`,
    {
      params: {
        query: query || from,
        from,
        to,
        date: isoTravelDate
      },
      headers: buildRapidApiHeaders(rapidApiKey, rapidApiHost),
      timeout: 10000
    }
  );

  const trains = extractTrainsList(response.data);

  return trains.filter(
    (train) =>
      trainMatchesRoute(train, from, to) &&
      trainMatchesTravelDate(train, isoTravelDate)
  );
};

const fetchTrainScheduleByNo = async ({
  rapidApiKey,
  rapidApiHost,
  trainNo
}) => {
  const response = await axios.get(
    `https://${rapidApiHost}/api/v1/getTrainSchedule`,
    {
      params: {
        trainNo
      },
      headers: buildRapidApiHeaders(rapidApiKey, rapidApiHost),
      timeout: 10000
    }
  );

  return response.data;
};

const getRapidApiClientConfig = () => {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const rapidApiHost = process.env.RAPIDAPI_HOST || DEFAULT_RAPIDAPI_HOST;

  if (!rapidApiKey) {
    throw new AppError('RapidAPI key is not configured on the server.', 500);
  }

  return { rapidApiKey, rapidApiHost };
};

const buildRapidApiHeaders = (rapidApiKey, rapidApiHost) => ({
  'X-RapidAPI-Key': rapidApiKey,
  'X-RapidAPI-Host': rapidApiHost,
  'Content-Type': 'application/json'
});

exports.searchTrainsByRoute = catchAsync(async (req, res, next) => {
  const { from, to, query, travelDate } = req.query;

  if (!from || !to || !travelDate) {
    return next(
      new AppError('Please provide from, to, and travelDate query params.', 400)
    );
  }

  const isoTravelDate = toIsoDateString(travelDate);

  if (!isoTravelDate) {
    return next(
      new AppError('Please provide travelDate in a valid date format.', 400)
    );
  }

  const { rapidApiKey, rapidApiHost } = getRapidApiClientConfig();
  const filteredTrains = await searchTrainsByRouteAndDate({
    rapidApiKey,
    rapidApiHost,
    from,
    to,
    isoTravelDate,
    query
  });

  res.status(200).json({
    status: 'success',
    route: {
      from,
      to,
      travelDate: isoTravelDate,
      queryUsed: query || from
    },
    results: filteredTrains.length,
    data: {
      trains: filteredTrains
    }
  });
});

exports.getTrainSchedule = catchAsync(async (req, res, next) => {
  const trainNo = String(req.query.trainNo || '').trim();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const travelDate = req.query.travelDate;
  const query = String(req.query.query || '').trim();

  const { rapidApiKey, rapidApiHost } = getRapidApiClientConfig();

  if (trainNo) {
    const schedule = await fetchTrainScheduleByNo({
      rapidApiKey,
      rapidApiHost,
      trainNo
    });

    return res.status(200).json({
      status: 'success',
      mode: 'trainNo',
      trainNo,
      data: schedule
    });
  }

  if (!from || !to || !travelDate) {
    return next(
      new AppError(
        'Please provide either trainNo or from, to, and travelDate query params.',
        400
      )
    );
  }

  const isoTravelDate = toIsoDateString(travelDate);

  if (!isoTravelDate) {
    return next(
      new AppError('Please provide travelDate in a valid date format.', 400)
    );
  }

  const matchingTrains = await searchTrainsByRouteAndDate({
    rapidApiKey,
    rapidApiHost,
    from,
    to,
    isoTravelDate,
    query
  });

  res.status(200).json({
    status: 'success',
    mode: 'routeDate',
    route: {
      from,
      to,
      travelDate: isoTravelDate,
      queryUsed: query || from
    },
    results: matchingTrains.length,
    data: {
      trains: matchingTrains
    }
  });
});
