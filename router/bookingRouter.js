const express = require('express');
const bookingController = require('../controller/bookingController');
const paymentController = require('../controller/paymentController');
const authController = require('../controller/authController');

// mergeParams is essential to capture :hotelId from the parent router
const router = express.Router({ mergeParams: true });

// --- PUBLIC WEBHOOK ROUTES ---
// These MUST stay at the top and usually should NOT have authController.protect
// because they are called by Razorpay/Stripe servers, not logged-in users.
router.post(
  '/webhook/booking/payment-success',
  bookingController.webhookSuccessBooking
);
router.post(
  '/webhook/booking/payment-failed',
  bookingController.webhookFailedBooking
);

const webhookController = require('../controller/webhookController');
router.post(
  '/webhook/dispatch/payment-success',
  webhookController.dispatchSuccess
);
router.post(
  '/webhook/dispatch/payment-failed',
  webhookController.dispatchFailure
);

router.post(
  '/webhook/travel/payment-success',
  paymentController.webhookSuccessTravelPayment
);
router.post(
  '/webhook/travel/payment-failed',
  paymentController.webhookFailedTravelPayment
);

// --- PROTECTED ROUTES ---
router.use(authController.protect);

// GET /api/v1/hotel/:hotelId/bookings/
// Also allow POST to the same nested path to create a booking (uses mergeParams.hotelId)
router
  .route('/')
  .get(
    authController.restrictTo('staff', 'admin'),
    bookingController.getAllHotelBookings
  )
  .post(
    authController.restrictTo('user', 'staff', 'admin'),
    bookingController.createBooking,
    paymentController.createPayment
  );

// User-specific routes
router.route('/me').get(bookingController.getMyBookings);
router.route('/my-payments').get(paymentController.getMyPayments);
router
  .route('/payments')
  .get(
    authController.restrictTo('staff', 'admin'),
    paymentController.getHotelPayments
  );

// Booking success/fail pages
router.route('/:tripId/success').get(bookingController.getSuccessfullBookings);
router.route('/:tripId/failed').get(bookingController.getFailedBookings);

// Booking actions
router.route('/book-travel').post(paymentController.createPayment);

// Note: If this is nested under /:hotelId/bookings,
// this URL becomes /api/v1/hotel/:hotelId/bookings/book/:hotelId
// You might want to simplify this to just '/book'
router
  .route('/book/:hotelId')
  .post(
    authController.restrictTo('user', 'staff', 'admin'),
    bookingController.createBooking,
    paymentController.createPayment
  );

module.exports = router;
