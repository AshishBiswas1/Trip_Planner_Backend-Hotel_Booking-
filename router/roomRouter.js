const express = require('express');
const roomController = require('../controller/roomController');

const router = express.Router({ mergeParams: true });

router.route('/').get(roomController.getAllHotelRooms);
router.route('/:id').get(roomController.getRoom);

module.exports = router;
