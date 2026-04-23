const express = require('express');
const hotelController = require('../controller/HotelController');
const roomRouter = require('./roomRouter');
const authController = require('../controller/authController');

const router = express.Router();

// --- ROUTES ---
// 1. Get all hotels
router.route('/').get(hotelController.getAllHotels);

// Get hotels by distance from a location
router.route('/nearby').get(hotelController.getHotelByDistance);

// 2. Get a single hotel by slug
router.route('/:slug').get(hotelController.getHotel);

router.use(authController.protect); // Protect all routes below this middleware
// --- Room ROUTES ---
router.use('/:hotelId/rooms', roomRouter);

module.exports = router;
