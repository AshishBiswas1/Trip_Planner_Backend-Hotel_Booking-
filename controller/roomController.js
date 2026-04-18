const Room = require('../models/roomModel');
const catchAsync = require('../util/catchAsync');
const AppError = require('../util/appError');
const apiFeatures = require('../util/apiFeatures');

exports.getAllHotelRooms = catchAsync(async (req, res, next) => {
  if (!req.params.hotelId) {
    return next(new AppError('Hotel ID is required in route params', 400));
  }

  const features = new apiFeatures(
    Room.find({ hotel: req.params.hotelId }),
    req.query
  )
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const rooms = await features.query;

  if (!rooms) {
    return next(new AppError('No rooms found for this hotel', 404));
  }

  res.status(200).json({
    status: 'success',
    results: rooms.length,
    data: {
      rooms
    }
  });
});

exports.getRoom = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.id);

  if (!room) {
    return next(new AppError('No room found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      room
    }
  });
});
