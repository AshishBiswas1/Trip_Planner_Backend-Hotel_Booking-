const Hotel = require('../models/hotelModel');
const AppError = require('../util/appError');
const catchAsync = require('../util/catchAsync');
const handeler = require('./handler');
const { upload } = require('../util/upload');
const { uploadBufferToCloudinary } = require('../util/cloudinary');

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

exports.uploadHotelImages = upload.array('images', 10);

exports.uploadHotelImagesToCloudinary = catchAsync(async (req, res, next) => {
  if (!req.files || req.files.length === 0) return next();

  const uploads = await Promise.all(
    req.files.map((file, index) =>
      uploadBufferToCloudinary(
        file.buffer,
        {
          public_id: `hotel-${req.user.id}-${Date.now()}-${index}`,
          transformation: [
            { width: 1600, height: 900, crop: 'limit' },
            { quality: 'auto', fetch_format: 'auto' }
          ]
        },
        file.mimetype
      )
    )
  );

  req.uploadedHotelImages = uploads.map((item) => item.secure_url);
  next();
});

const normalizeImages = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

exports.createHotel = catchAsync(async (req, res, next) => {
  if (req.user.role === 'staff') {
    const existingHotel = await Hotel.findOne({ user: req.user.id });

    if (existingHotel) {
      return next(
        new AppError('A hotel is already assigned to this staff account.', 400)
      );
    }

    // Staff cannot assign hotels to any other user.
    req.body.user = req.user.id;
  }

  const bodyImages = normalizeImages(req.body.images);
  const uploadedImages = req.uploadedHotelImages || [];

  if (uploadedImages.length > 0 || bodyImages.length > 0) {
    req.body.images = [...new Set([...bodyImages, ...uploadedImages])];
  }

  const hotel = await Hotel.create(req.body);

  res.status(201).json({
    status: 'success',
    data: {
      data: hotel
    }
  });
});

exports.setStaffId = (req, res, next) => {
  if (req.user.role === 'staff') {
    req.params.id = req.user.id;
  }
  next();
};

exports.updateHotel = catchAsync(async (req, res, next) => {
  const existingHotel = await Hotel.findOne({ user: req.params.id });

  if (!existingHotel) {
    return next(new AppError('No hotel found with that ID', 404));
  }

  const bodyImages = normalizeImages(req.body.images);
  const uploadedImages = req.uploadedHotelImages || [];
  const shouldReplaceImages = req.body.replaceImages === 'true';

  const updatePayload = {
    ...req.body
  };

  delete updatePayload.replaceImages;

  if (uploadedImages.length > 0 || bodyImages.length > 0) {
    const baseImages = shouldReplaceImages
      ? bodyImages
      : [...normalizeImages(existingHotel.images), ...bodyImages];

    updatePayload.images = [...new Set([...baseImages, ...uploadedImages])];
  }

  const hotel = await Hotel.findOneAndUpdate(
    { user: req.params.id },
    updatePayload,
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
