const express = require('express');
const aiController = require('../controller/aiController');
const authController = require('../controller/authController');

const router = express.Router();

// Public ping to check ML service availability
router.get('/ping', aiController.ping);

// Protected route to estimate full trip cost — allow any authenticated user
router.post(
  '/estimate-trip',
  authController.protect,
  aiController.estimateTrip
);

module.exports = router;
