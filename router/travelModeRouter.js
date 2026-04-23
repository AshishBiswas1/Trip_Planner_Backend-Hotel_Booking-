const express = require('express');
const travelModeController = require('../controller/travelModeController');

const router = express.Router();

// Train Routes
router.get('/trains/search', travelModeController.searchTrainsByRoute);
router.get('/trains/schedule', travelModeController.getTrainSchedule);

// Flight Routes
router.get('/flights/search', travelModeController.searchFlightsByRoute);
router.get('/flights/schedule', travelModeController.getFlightSchedule);

// Bus Routes
router.get('/buses/stops', travelModeController.getBusStops);
router.get('/buses/search', travelModeController.searchBusesByRoute);

module.exports = router;
