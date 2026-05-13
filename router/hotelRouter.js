const express = require('express');
const hotelController = require('../controller/HotelController');
const roomRouter = require('./roomRouter');
const reviewRouter = require('./reviewRouter');
const bookingRouter = require('./bookingRouter');
const authController = require('../controller/authController');

const router = express.Router({ mergeParams: true });

// 1. NESTED ROUTES
// These should stay at the top to ensure specific sub-resources are caught first
router.use('/:hotelId/bookings', bookingRouter);
router.use('/:hotelId/rooms', roomRouter);
router.use('/:hotelId/reviews', reviewRouter);

// 2. PUBLIC ROUTES (Static & Fixed Paths)
router.route('/').get(hotelController.getAllHotels);
router.route('/nearby').get(hotelController.getHotelByDistance);

// 3. LOGGED-IN STAFF SPECIFIC (Static Path)
// Placed BEFORE /:slug to prevent "getMyHotel" being treated as a slug
router
  .route('/getMyHotel')
  .get(
    authController.protect,
    authController.restrictTo('staff'),
    hotelController.setStaffId,
    hotelController.getMyHotel
  );

// 4. PUBLIC DYNAMIC ROUTES (Slugs)
// This is the "catch-all" for hotel details.
router.route('/:slug').get(hotelController.getHotel);

// 5. PROTECTED ROUTES (Requires Authentication)
router.use(authController.protect);

router
  .route('/create')
  .post(
    authController.restrictTo('staff', 'admin'),
    hotelController.uploadHotelImages,
    hotelController.uploadHotelImagesToCloudinary,
    hotelController.createHotel
  );

// --- STAFF ONLY ROUTES ---
router
  .route('/updateMyHotel')
  .patch(
    authController.restrictTo('staff'),
    hotelController.setStaffId,
    hotelController.uploadHotelImages,
    hotelController.uploadHotelImagesToCloudinary,
    hotelController.updateHotel
  );

router
  .route('/updateMyHotelAmenities')
  .patch(
    authController.restrictTo('staff'),
    hotelController.setStaffId,
    hotelController.updateHotlelAmenities
  );

router
  .route('/deleteMyHotel')
  .delete(
    authController.restrictTo('staff'),
    hotelController.setStaffId,
    hotelController.deleteHotel
  );

// --- ADMIN ONLY ROUTES ---
router.use(authController.restrictTo('admin'));

// ID-based routes should be at the bottom as they are highly generic
router
  .route('/:id')
  .patch(
    hotelController.uploadHotelImages,
    hotelController.uploadHotelImagesToCloudinary,
    hotelController.updateHotel
  )
  .delete(hotelController.deleteHotel);

router.route('/:id/amenities').patch(hotelController.updateHotlelAmenities);

module.exports = router;
