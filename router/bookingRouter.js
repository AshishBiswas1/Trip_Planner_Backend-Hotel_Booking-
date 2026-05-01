const express = require('express');
const bookingController = require('../controller/bookingController');
const paymentController = require('../controller/paymentController');
const authController = require('../controller/authController');

const router = express.Router({ mergeParams: true });

// WEBHOOK ROUTES (public)
// Booking webhooks
router.post(
  '/webhook/booking/payment-success',
  bookingController.webhookSuccessBooking
);
router.post(
  '/webhook/booking/payment-failed',
  bookingController.webhookFailedBooking
);
// Single dispatch webhook (preferred): point Razorpay to these two endpoints.
const webhookController = require('../controller/webhookController');
router.post(
  '/webhook/dispatch/payment-success',
  webhookController.dispatchSuccess
);
router.post(
  '/webhook/dispatch/payment-failed',
  webhookController.dispatchFailure
);

// Travel webhooks
router.post(
  '/webhook/travel/payment-success',
  paymentController.webhookSuccessTravelPayment
);
router.post(
  '/webhook/travel/payment-failed',
  paymentController.webhookFailedTravelPayment
);

// Backward-compatible aliases for older Razorpay webhook settings
router.post(
  '/webhook/payment-success',
  bookingController.webhookSuccessBooking
);
router.post('/webhook/payment-failed', bookingController.webhookFailedBooking);

// GET the BOOKED ROOMS
router.route('/:tripId/success').get(bookingController.getSuccessfullBookings);
router.route('/:tripId/failed').get(bookingController.getFailedBookings);

router.use(authController.protect);

// GET today's bookings for a specific hotel
router.route('/').get(bookingController.getAllHotelBookings);

// CREATE a TRAVEL PAYMENT LINK
router.route('/book-travel').post(paymentController.createPayment);

// CREATE the ROOM BOOKING
router
  .route('/book/:hotelId')
  .post(bookingController.createBooking, paymentController.createPayment);

module.exports = router;
