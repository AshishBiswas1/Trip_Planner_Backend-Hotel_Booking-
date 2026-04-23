const Hotel = require('../models/hotelModel');
const AppError = require('../util/appError');
const catchAsync = require('../util/catchAsync');
const handeler = require('./handler');

exports.getAllHotels = handeler.getAll(Hotel);

exports.getHotel = handeler.getOne(Hotel, null, 'slug');

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
