const express = require('express');
const tripController = require('../controller/tripController');
const authController = require('../controller/authController');

const router = express.Router();

router.use(authController.protect);
router
  .route('/')
  .post(tripController.createUserTrip, tripController.sendCreatedTrip)
  .get(tripController.getUserTrips);

router
  .route('/:id')
  .get(tripController.getTrip)
  .patch(tripController.updateTrip)
  .delete(tripController.deleteTrip);

module.exports = router;
