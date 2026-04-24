const Trip = require('../models/tripModel');
const catchAsync = require('../util/catchAsync');
const AppError = require('../util/appError');
const apiFeatures = require('../util/apiFeatures');

exports.createUserTrip = catchAsync(async (req, res, next) => {
  const trip = await Trip.create({
    user: req.user._id,
    details: req.body.details,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    travelMode: req.body.travelMode,
    startLocation: req.body.startLocation,
    endLocation: req.body.endLocation,
    route: req.body.route
  });

  res.locals.trip = trip;

  next();
});

exports.sendCreatedTrip = (req, res) => {
  res.status(201).json({
    status: 'success',
    data: {
      trip: res.locals.trip
    }
  });
};

exports.getUserTrips = catchAsync(async (req, res, next) => {
  let query = Trip.find({ user: req.user._id });

  const trips = await apiFeatures(query, req.query)
    .paginate()
    .sort()
    .limitFields();

  if (trips.length === 0) {
    return next(new AppError('No trips found for this user', 404));
  }

  res.status(200).json({
    status: 'success',
    results: trips.length,
    data: {
      trips
    }
  });
});

exports.getTrip = catchAsync(async (req, res, next) => {
  const trip = await Trip.findById(req.params.id);

  if (!trip) {
    return next(new AppError('Trip not found', 404));
  }

  res.status(200).json({
    status: 'success',
    trip
  });
});
