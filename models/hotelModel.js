const mongoose = require('mongoose');

const hotelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Hotel must have a name']
  },
  description: {
    type: String,
    required: [true, 'Hotel must have a description']
  },
  location: {
    address: String,
    city: String,
    state: String,
    country: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  images: [
    {
      type: String
    }
  ],
  pricePerNight: {
    type: Number,
    required: true
  },
  pricePerNight: {
    type: Number,
    required: true
  },
  rating: {
    type: Number,
    default: 0
  },

  totalReviews: {
    type: Number,
    default: 0
  },

  roomsAvailable: {
    type: Number,
    required: true
  }
});

const Hotel = monggose.model('Hotel', hotelSchema);

module.exports = Hotel;
