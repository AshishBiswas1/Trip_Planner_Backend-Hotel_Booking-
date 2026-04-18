const express = require('express');
const traverModeController = require('../controller/traverModeController');

const router = express.Router();

// Required query params: from, to, travelDate (optional: query)
router.get('/trains/search', traverModeController.searchTrainsByRoute);
router.get('/getTrainSchedule', traverModeController.getTrainSchedule);

module.exports = router;
