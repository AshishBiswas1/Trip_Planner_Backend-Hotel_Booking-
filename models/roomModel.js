const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  hotel: {
    type: mongoose.Schema.ObjectId,
    ref: 'Hotel',
    required: true
  },

  roomNumber: {
    type: String,
    required: true
  },

  roomType: {
    type: String,
    required: [true, 'Room must have a type']
  },

  price: {
    type: Number,
    required: [true, 'Room must have a price']
  },

  capacity: {
    type: Number,
    required: true
  },

  amenities: {
    type: [String],
    default: []
  },

  images: {
    type: [String],
    default: []
  },

  isActive: {
    type: Boolean,
    default: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;
