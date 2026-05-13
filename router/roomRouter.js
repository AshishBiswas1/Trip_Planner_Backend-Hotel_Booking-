const express = require('express');
const roomController = require('../controller/roomController');
const authController = require('../controller/authController');

const router = express.Router({ mergeParams: true });

router.route('/').get(roomController.getAllHotelRooms);
router.route('/:id').get(roomController.getRoom);

router.use(authController.protect);

router
  .route('/bulk')
  .post(
    authController.restrictTo('staff', 'admin'),
    roomController.uploadRoomImages,
    roomController.uploadRoomImagesToCloudinary,
    roomController.createHotelRooms
  );

module.exports = router;
