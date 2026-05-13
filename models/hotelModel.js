const mongoose = require('mongoose');

const hotelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'Hotel must belong to a user']
    },
    slug: String,
    description: String,
    location: {
      address: String,
      city: String,
      state: String,
      country: String,
      coordinates: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: [Number]
      }
    },
    images: [String],
    rating: Number,
    totalReviews: Number,
    roomsAvailable: { type: Number, default: 0 },
    amenities: [String],
    featured: { type: Boolean, default: false }
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: false
  }
);

hotelSchema.index({ slug: 1 });
hotelSchema.index({ 'location.city': 1 });
hotelSchema.index({ 'location.coordinates': '2dsphere' });

hotelSchema.virtual('isBookable').get(function () {
  return this.roomsAvailable > 0;
});

// --- FIXED QUERY MIDDLEWARE ---
hotelSchema.pre(/^find/, async function () {
  const query = this.getQuery();

  // 1. Identify the query context
  const isSpecificId = query._id;
  const hasUserFilter = Object.prototype.hasOwnProperty.call(query, 'user');
  const hasRoomsFilter = Object.prototype.hasOwnProperty.call(
    query,
    'roomsAvailable'
  );

  // 2. Apply discoverability filter ONLY for general public searches
  if (!isSpecificId && !hasUserFilter && !hasRoomsFilter) {
    this.find({ roomsAvailable: { $gt: 0 } });
  }

  // 3. Store start time for performance logging
  this.start = Date.now();
});

hotelSchema.post(/^find/, function () {
  console.log(`Read Operation took ${Date.now() - this.start}ms`);
});

const Hotel = mongoose.model('Hotel', hotelSchema);
module.exports = Hotel;
