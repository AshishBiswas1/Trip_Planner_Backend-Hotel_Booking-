const Hotel = require('../models/hotelModel');
const AppError = require('../util/appError');
const catchAsync = require('../util/catchAsync');
const handeler = require('./handler');

exports.getAllHotels = handeler.getAll(Hotel);

exports.getHotel = handeler.getOne(Hotel, null, 'slug');
