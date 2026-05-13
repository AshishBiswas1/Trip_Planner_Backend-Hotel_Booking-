const Room = require('../models/roomModel');
const Booking = require('../models/bookingModel');
const Hotel = require('../models/hotelModel');
const catchAsync = require('../util/catchAsync');
const AppError = require('../util/appError');
const apiFeatures = require('../util/apiFeatures');
const { upload } = require('../util/upload');
const { uploadBufferToCloudinary } = require('../util/cloudinary');

const parseDate = (value) => {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseStringList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const buildRoomNumbers = (prefix, count, existingNumbers) => {
  const roomNumbers = [];
  let sequence = 1;

  while (roomNumbers.length < count) {
    const roomNumber = `${prefix}-${sequence}`;
    sequence += 1;

    if (existingNumbers.has(roomNumber)) {
      continue;
    }

    existingNumbers.add(roomNumber);
    roomNumbers.push(roomNumber);
  }

  return roomNumbers;
};

const normalizeImageList = (value) => {
  if (!value) return [];
  if (Array.isArray(value))
    return value.map((entry) => String(entry).trim()).filter(Boolean);

  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

exports.uploadRoomImages = upload.array('images', 10);

exports.uploadRoomImagesToCloudinary = catchAsync(async (req, res, next) => {
  if (!req.files || req.files.length === 0) return next();

  const uploads = await Promise.all(
    req.files.map((file, index) =>
      uploadBufferToCloudinary(
        file.buffer,
        {
          folder: 'trip-planner/rooms',
          public_id: `room-${req.params.hotelId}-${Date.now()}-${index}`,
          transformation: [
            { width: 1600, height: 1000, crop: 'limit' },
            { quality: 'auto', fetch_format: 'auto' }
          ]
        },
        file.mimetype
      )
    )
  );

  req.uploadedRoomImages = uploads.map((item) => item.secure_url);
  next();
});

exports.getAllHotelRooms = catchAsync(async (req, res, next) => {
  if (!req.params.hotelId) {
    return next(new AppError('Hotel ID is required in route params', 400));
  }

  const checkInDate = parseDate(req.query.checkInDate);
  const checkOutDate = parseDate(req.query.checkOutDate);

  if ((checkInDate && !checkOutDate) || (!checkInDate && checkOutDate)) {
    return next(
      new AppError('Please provide both check-in and check-out dates.', 400)
    );
  }

  if (checkInDate && checkOutDate && checkOutDate <= checkInDate) {
    return next(
      new AppError('Check-out date must be after the check-in date.', 400)
    );
  }

  const roomQuery = { ...req.query };
  delete roomQuery.checkInDate;
  delete roomQuery.checkOutDate;

  let unavailableRoomIds = [];
  if (checkInDate && checkOutDate) {
    unavailableRoomIds = await Booking.distinct('room', {
      hotel: req.params.hotelId,
      bookingType: 'hotel',
      status: { $in: ['pending', 'confirmed'] },
      checkInDate: { $lt: checkOutDate },
      checkOutDate: { $gt: checkInDate }
    });
  }

  const features = new apiFeatures(
    Room.find({
      hotel: req.params.hotelId,
      isActive: true,
      _id: { $nin: unavailableRoomIds }
    }),
    roomQuery
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

exports.createHotelRooms = catchAsync(async (req, res, next) => {
  const hotelId = req.params.hotelId;
  const roomCount = Number(req.body.roomCount || req.body.numberOfRooms);
  const roomType = req.body.roomType;
  const price = Number(req.body.price);
  const capacity = Number(req.body.capacity);
  const uploadedImages = req.uploadedRoomImages || [];
  const prefix = String(req.body.roomNumberPrefix || roomType || 'ROOM')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-');

  if (!hotelId) {
    return next(new AppError('Hotel ID is required in route params', 400));
  }

  const hotel = await Hotel.findById(hotelId).select('_id user');

  if (!hotel) {
    return next(new AppError('No hotel found with that ID', 404));
  }

  if (req.user.role === 'staff' && String(hotel.user) !== String(req.user.id)) {
    return next(
      new AppError('You can only create rooms for your own hotel.', 403)
    );
  }

  if (!Number.isInteger(roomCount) || roomCount < 1) {
    return next(new AppError('Please provide a valid room count.', 400));
  }

  if (!roomType) {
    return next(new AppError('Please provide a room type.', 400));
  }

  if (!Number.isFinite(price) || price <= 0) {
    return next(new AppError('Please provide a valid room price.', 400));
  }

  if (!Number.isFinite(capacity) || capacity < 1) {
    return next(new AppError('Please provide a valid room capacity.', 400));
  }

  const existingNumbers = new Set(
    await Room.distinct('roomNumber', { hotel: hotelId })
  );
  const roomNumbers = buildRoomNumbers(prefix, roomCount, existingNumbers);
  const bodyImages = normalizeImageList(req.body.images);
  const roomImages = [...uploadedImages, ...bodyImages];

  const roomsToCreate = roomNumbers.map((roomNumber) => ({
    hotel: hotelId,
    roomNumber,
    roomType,
    price,
    capacity,
    amenities: parseStringList(req.body.amenities),
    images: roomImages,
    isActive: true
  }));

  const createdRooms = await Room.create(roomsToCreate);
  await Room.updateAvailableRooms(hotelId).catch((error) => {
    console.error(
      'Failed to refresh hotel room count after bulk create:',
      error
    );
  });

  res.status(201).json({
    status: 'success',
    results: createdRooms.length,
    data: {
      rooms: createdRooms
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
