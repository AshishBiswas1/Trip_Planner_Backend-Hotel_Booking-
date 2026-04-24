const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Trip must belong to a user']
  },
  details: { type: String, trim: true },
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
  travelMode: {
    type: String,
    enum: ['DRIVE', 'TWO_WHEELER', 'TRANSIT', 'WALK', 'BICYCLE'],
    default: 'DRIVE'
  },
  route: [
    {
      coordinates: { lat: Number, lng: Number }
    }
  ],
  costBreakdown: {
    hotelCost: { type: Number, default: 0 },
    flightCost: { type: Number, default: 0 },
    busCost: { type: Number, default: 0 },
    trainCost: { type: Number, default: 0 },
    otherCost: { type: Number, default: 0 }
  },
  totalCost: { type: Number, default: 0 },
  isAutoPlanned: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Indexes
tripSchema.index({ user: 1, startDate: -1 });
tripSchema.index({ 'startLocation.coordinates': '2dsphere' });

// Pre-save: Calculate total cost
tripSchema.pre('save', function () {
  if (this.isModified('costBreakdown')) {
    this.totalCost = Object.values(this.costBreakdown).reduce(
      (sum, cost) => sum + cost,
      0
    );
  }
});

// Pre-find: Auto-populate user
tripSchema.pre(/^find/, function () {
  this.populate({
    path: 'user',
    select: 'name email'
  });
});

// Post-save logging
tripSchema.post('save', function (doc) {
  console.log(`New trip created: ${doc._id}`);
});

const Trip = mongoose.model('Trip', tripSchema);

module.exports = Trip;
