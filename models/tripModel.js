const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },

  details: {
    type: String,
    required: [true, 'Trip must have details']
  },

  startDate: {
    type: Date,
    required: [true, 'Trip must have a start date']
  },

  endDate: {
    type: Date,
    required: [true, 'Trip must have an end date']
  },

  startLocation: {
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true }
    }
  },

  endLocation: {
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true }
    }
  },

  route: [
    {
      coordinates: {
        lat: Number,
        lng: Number
      }
    }
  ],

  // 🔥 Prediction-related fields
  costBreakdown: {
    hotelCost: {
      type: Number,
      default: 0
    },
    flightCost: {
      type: Number,
      default: 0
    }
  },

  totalCost: {
    type: Number,
    default: 0
  },

  isAutoPlanned: {
    type: Boolean,
    default: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Trip = mongoose.model('Trip', tripSchema);

module.exports = Trip;
