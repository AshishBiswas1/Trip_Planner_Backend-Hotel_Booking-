const express = require('express');
const hotelController = require('../controller/HotelController');

const router = express.Router();

// --- ROUTES ---
// 1. Get all hotels
router.route('/').get(hotelController.getAllHotels);

// 2. Get a single hotel by slug
router.route('/:slug').get(hotelController.getHotel);

module.exports = router;
