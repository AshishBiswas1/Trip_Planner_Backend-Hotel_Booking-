const Trip = require('../models/tripModel');
const catchAsync = require('../util/catchAsync');
const AppError = require('../util/appError');
const apiFeatures = require('../util/apiFeatures');

function assertTripOwnership(trip, user) {
  return (
    trip &&
    (String(trip.user?._id || trip.user) === String(user.id) ||
      user.role === 'admin')
  );
}

exports.createUserTrip = catchAsync(async (req, res, next) => {
  const tripData = {
    user: req.user._id,
    details: req.body.details,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    travelMode: req.body.travelMode,
    startLocation: req.body.startLocation,
    endLocation: req.body.endLocation,
    route: req.body.route
  };

  // Capture predicted cost if provided from frontend
  if (req.body.costBreakdown) {
    tripData.costBreakdown = req.body.costBreakdown;
  }
  if (req.body.totalCost !== undefined && req.body.totalCost !== null) {
    tripData.totalCost = req.body.totalCost;
  }

  const trip = await Trip.create(tripData);

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
  const query = Trip.find({ user: req.user._id });
  const features = new apiFeatures(query, req.query)
    .paginate()
    .sort()
    .limitFields();
  const trips = await features.query;
  if (trips.length === 0) {
    return res.status(200).json({
      status: 'success',
      results: 0,
      data: { trips: [] }
    });
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

  if (!assertTripOwnership(trip, req.user)) {
    return next(new AppError('You can only view trips created by you', 403));
  }

  res.status(200).json({
    status: 'success',
    data: {
      trip
    }
  });
});

exports.updateTrip = catchAsync(async (req, res, next) => {
  const trip = await Trip.findById(req.params.id);

  if (!trip) {
    return next(new AppError('Trip not found', 404));
  }

  if (!assertTripOwnership(trip, req.user)) {
    return next(new AppError('You can only update trips created by you', 403));
  }

  const updateData = {};
  const allowedFields = [
    'details',
    'startDate',
    'endDate',
    'travelMode',
    'startLocation',
    'endLocation',
    'route',
    'costBreakdown',
    'isAutoPlanned'
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  });

  Object.assign(trip, updateData);
  await trip.save();
  await trip.populate({ path: 'user', select: 'name email' });

  res.status(200).json({
    status: 'success',
    data: {
      trip
    }
  });
});

exports.deleteTrip = catchAsync(async (req, res, next) => {
  const trip = await Trip.findById(req.params.id);

  if (!trip) {
    return next(new AppError('Trip not found', 404));
  }

  if (!assertTripOwnership(trip, req.user)) {
    return next(new AppError('You can only delete trips created by you', 403));
  }

  await Trip.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null
  });
});
