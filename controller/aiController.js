const axios = require('axios');
const catchAsync = require('../util/catchAsync');
const Trip = require('../models/tripModel');

const ML_BASE = process.env.ML_SERVICE_URL || 'http://localhost:5000';

const postPredict = async (path, payload) => {
  const url = `${ML_BASE.replace(/\/+$/g, '')}${path}`;
  const res = await axios.post(url, payload, { timeout: 10000 });
  return res.data || {};
};

exports.estimateTrip = catchAsync(async (req, res, next) => {
  // Expected body shape (flexible): { flight?, flights?: [...], bus?, touring?: [...], hotel?: { data, nights } }
  const { flight, flights, bus, touring, hotel, tripId } = req.body || {};

  const results = {};
  let total = 0;
  const predictionsRequested = {};

  if (flight) {
    const r = await postPredict('/predict/flight', flight);
    const cost = Number(r?.estimated_cost || 0);
    results.flight = { estimated_cost: cost };
    total += cost;
    predictionsRequested.flight = true;
  }

  // Handle multiple flights (new approach - predict for all airlines)
  if (Array.isArray(flights) && flights.length > 0) {
    results.flights = [];
    let flightCostTotal = 0;

    for (const flightReq of flights) {
      const r = await postPredict('/predict/flight', flightReq);
      const cost = Number(r?.estimated_cost || 0);
      results.flights.push({
        airline: flightReq.Airline,
        estimated_cost: cost
      });
      flightCostTotal += cost;
    }

    // Average flight cost across all airlines for total calculation
    const averageFlightCost = flightCostTotal / Math.max(1, flights.length);
    total += averageFlightCost;
    predictionsRequested.flights = true;
  }

  if (bus) {
    const r = await postPredict('/predict/bus', bus);
    const cost = Number(r?.estimated_cost || 0);
    results.bus = { estimated_cost: cost };
    total += cost;
    predictionsRequested.bus = true;
  }

  if (Array.isArray(touring) && touring.length > 0) {
    results.touring = [];
    for (const t of touring) {
      const r = await postPredict('/predict/touring', t);
      const fee = Number(r?.estimated_entry_fee || 0);
      results.touring.push({ request: t, estimated_entry_fee: fee });
      total += fee;
      predictionsRequested.touring = true;
    }
  }
  if (hotel && hotel.data) {
    const r = await postPredict('/predict/hotel', hotel.data);
    const daily = Number(r?.estimated_daily_rate || 0);
    const nights = Number(hotel.nights || 1);
    const cost = daily * Math.max(1, nights);
    results.hotel = {
      estimated_daily_rate: daily,
      nights,
      estimated_cost: cost
    };
    total += Number(cost || 0);
    predictionsRequested.hotel = true;
  }

  // If a tripId is provided and at least one prediction was requested, update the Trip document's costBreakdown and totalCost
  const anyPredictions = Object.keys(predictionsRequested).length > 0;
  if (tripId && anyPredictions) {
    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res
        .status(404)
        .json({ status: 'error', message: 'Trip not found to attach cost' });
    }

    const cb = trip.costBreakdown || {};

    // Assign computed costs (fall back to existing values when missing)
    if (results.hotel)
      cb.hotelCost =
        Number(
          results.hotel.estimated_cost || results.hotel.estimated_cost || 0
        ) ||
        cb.hotelCost ||
        0;
    if (results.flight)
      cb.flightCost =
        Number(results.flight.estimated_cost || 0) || cb.flightCost || 0;
    if (results.flights && results.flights.length > 0) {
      const totalFlightCost = results.flights.reduce(
        (sum, f) => sum + (Number(f.estimated_cost) || 0),
        0
      );
      cb.flightCost =
        totalFlightCost / Math.max(1, results.flights.length) ||
        cb.flightCost ||
        0;
    }
    if (results.bus)
      cb.busCost = Number(results.bus.estimated_cost || 0) || cb.busCost || 0;

    const touringTotal = Array.isArray(results.touring)
      ? results.touring.reduce(
          (s, t) => s + (Number(t.estimated_entry_fee) || 0),
          0
        )
      : 0;
    cb.otherCost = (cb.otherCost || 0) + touringTotal;

    trip.costBreakdown = cb;
    trip.markModified('costBreakdown');
    trip.totalCost = Number(total.toFixed(2));
    await trip.save();

    return res.status(200).json({
      status: 'success',
      total_cost: Number(total.toFixed(2)),
      breakdown: results,
      trip
    });
  }

  res.status(200).json({
    status: 'success',
    total_cost: Number(total.toFixed(2)),
    breakdown: results
  });
});

exports.ping = catchAsync(async (req, res) => {
  const url = `${ML_BASE.replace(/\/+$/g, '')}/`;
  try {
    const r = await axios.get(url, { timeout: 4000 });
    res.status(200).json({ status: 'ok', ml: r.data });
  } catch (err) {
    res.status(502).json({
      status: 'error',
      message: 'ML service unavailable',
      detail: err.message
    });
  }
});
