const Hotel = require('../models/hotelModel');
const AppError = require('../util/appError');
const catchAsync = require('../util/catchAsync');
const handeler = require('./handler');

exports.getAllHotels = handeler.getAll(Hotel);

exports.getHotel = handeler.getOne(Hotel, null, 'slug');

exports.getMyHotel = catchAsync(async (req, res, next) => {
  const doc = await Hotel.findOne({ user: req.user.id });

  if (!doc) {
    return next(new AppError('No hotel found for this staff member', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { data: doc }
  });
});

exports.getHotelByDistance = catchAsync(async (req, res, next) => {
  const distance = Number(req.query.distance) || 5;

  // Accept location in either "location=lat,lng" or "currentLocation=lat,lng"
  // and keep compatibility with "lat" + "lng" query params.
  const rawLocation = req.query.location || req.query.currentLocation;
  const [parsedLat, parsedLng] = rawLocation
    ? String(rawLocation)
        .split(',')
        .map((value) => Number(value.trim()))
    : [NaN, NaN];

  const lat = Number.isFinite(parsedLat) ? parsedLat : Number(req.query.lat);
  const lng = Number.isFinite(parsedLng) ? parsedLng : Number(req.query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return next(
      new AppError(
        'Please provide your current location as "location=lat,lng" (or "currentLocation=lat,lng").',
        400
      )
    );
  }

  if (!Number.isFinite(distance) || distance <= 0) {
    return next(
      new AppError('Distance must be a positive number in kilometers.', 400)
    );
  }

  const maxDistanceInMeters = distance * 1000;

  const hotels = await Hotel.aggregate([
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        distanceField: 'distance',
        maxDistance: maxDistanceInMeters,
        spherical: true,
        distanceMultiplier: 0.001
      }
    },
    {
      $match: {
        roomsAvailable: { $gt: 0 }
      }
    }
  ]);

  res.status(200).json({
    status: 'success',
    results: hotels.length,
    data: {
      hotels
    }
  });
});

exports.createHotel = handeler.createOne(Hotel);

exports.setStaffId = (req, res, next) => {
  if (req.user.role === 'staff') {
    req.params.id = req.user.id;
  }
  next();
};

exports.updateHotel = catchAsync(async (req, res, next) => {
  const hotel = await Hotel.findOneAndUpdate(
    { user: req.params.id },
    req.body,
    {
      new: true,
      runValidators: true
    }
  );

  if (!hotel) {
    return next(new AppError('No hotel found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      hotel
    }
  });
});

exports.deleteHotel = catchAsync(async (req, res, next) => {
  const hotel = await Hotel.findOneAndDelete({ user: req.params.id });

  if (!hotel) {
    return next(new AppError('No hotel found with that ID', 404));
  }

  res.status(200).json({
    status: 'success'
  });
});

exports.updateHotlelAmenities = catchAsync(async (req, res, next) => {
  const hotel = await Hotel.findOne({ user: req.params.id });

  if (!hotel) {
    return next(new AppError('No hotel found with that ID', 404));
  }

  const { amenities, action = 'update' } = req.body;

  if (!Array.isArray(amenities)) {
    return next(new AppError('Amenities must be an array of strings', 400));
  }

  const sanitizedAmenities = amenities
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (sanitizedAmenities.length !== amenities.length) {
    return next(
      new AppError(
        'Each amenity must be a non-empty string with valid text.',
        400
      )
    );
  }

  const uniqueAmenities = [...new Set(sanitizedAmenities)];
  const existingAmenities = Array.isArray(hotel.amenities)
    ? hotel.amenities
    : [];

  if (action === 'update') {
    hotel.amenities = uniqueAmenities;
  } else if (action === 'add') {
    hotel.amenities = [...new Set([...existingAmenities, ...uniqueAmenities])];
  } else if (action === 'remove') {
    const amenitiesToRemove = new Set(uniqueAmenities);
    hotel.amenities = existingAmenities.filter(
      (item) => !amenitiesToRemove.has(item)
    );
  } else {
    return next(
      new AppError('Invalid action. Use one of: update, add, remove.', 400)
    );
  }

  await hotel.save();

  res.status(200).json({
    status: 'success',
    data: {
      hotel
    }
  });
});
