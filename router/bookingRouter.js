const express = require('express');
const bookingController = require('../controller/bookingController');
const paymentController = require('../controller/paymentController');
const authController = require('../controller/authController');

const router = express.Router({ mergeParams: true });

// WEBHOOK ROUTES (public)
// Replace the .route() blocks with these:
router.post(
  '/webhook/payment-success',
  bookingController.webhookSuccessBooking
);
router.post('/webhook/payment-failed', bookingController.webhookFailedBooking);

// GET the BOOKED ROOMS
router.route('/:tripId/success').get(bookingController.getSuccessfullBookings);
router.route('/:tripId/failed').get(bookingController.getFailedBookings);

router.use(authController.protect);

// CREATE the ROOM BOOKING
router
  .route('/book/:hotelId')
  .post(bookingController.createBooking, paymentController.createPayment);

module.exports = router;
