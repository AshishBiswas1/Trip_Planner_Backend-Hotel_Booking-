const express = require('express');
const hotelController = require('../controller/HotelController');
const roomRouter = require('./roomRouter');
const bookingRouter = require('./bookingRouter');
const authController = require('../controller/authController');

const router = express.Router({ mergeParams: true });

// Forward room-related requests to the nested room router
router.use('/:hotelId/rooms', roomRouter);

// Retrieve all available hotels (Public)
router.route('/').get(hotelController.getAllHotels);

// Search for hotels based on geographical distance (Public)
router.route('/nearby').get(hotelController.getHotelByDistance);

// Retrieve a specific hotel using its slug (Public - moved above protect)
router.route('/:slug').get(hotelController.getHotel);

// Protect all following routes with authentication middleware
router.use(authController.protect);

// Forward hotel bookings requests to the booking router with role restrictions
router.use(
  '/:hotelId/bookings',
  authController.restrictTo('staff', 'admin'),
  bookingRouter
);

// --- STAFF ROUTES (Accessible ONLY by Staff) ---

// Fetch the hotel belonging to the logged-in staff member
router
  .route('/getMyHotel')
  .get(
    authController.restrictTo('staff'),
    hotelController.setStaffId,
    hotelController.getMyHotel
  );

// Update the hotel owned by the logged-in staff member
router
  .route('/updateMyHotel')
  .patch(
    authController.restrictTo('staff'),
    hotelController.setStaffId,
    hotelController.updateHotel
  );

// Update/add/remove amenities for the logged-in staff member's hotel
router
  .route('/updateMyHotelAmenities')
  .patch(
    authController.restrictTo('staff'),
    hotelController.setStaffId,
    hotelController.updateHotlelAmenities
  );

// Delete the hotel owned by the logged-in staff member
router
  .route('/deleteMyHotel')
  .delete(
    authController.restrictTo('staff'),
    hotelController.setStaffId,
    hotelController.deleteHotel
  );

// --- ADMIN ROUTES (Accessible ONLY by Admins) ---

// Restrict all following routes to admin users only
router.use(authController.restrictTo('admin'));

// Create a new hotel entry
router.route('/create').post(hotelController.createHotel);

// Update a specific hotel using its unique ID
router.route('/:id').patch(hotelController.updateHotel);

// Update/add/remove amenities for a specific hotel using its unique ID
router.route('/:id/amenities').patch(hotelController.updateHotlelAmenities);

// Delete a specific hotel using its unique ID
router.route('/:id').delete(hotelController.deleteHotel);

module.exports = router;
