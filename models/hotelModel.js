const mongoose = require('mongoose');

const hotelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    slug: String, // Likely provided by your CMS
    description: String,
    location: {
      address: String,
      city: String,
      state: String,
      country: String,
      coordinates: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point'
        },
        coordinates: [Number] // [longitude, latitude]
      }
    },
    images: [String],
    rating: Number,
    totalReviews: Number,
    roomsAvailable: Number,
    amenities: [String], // Added for better "Single Hotel" details
    featured: {
      type: Boolean,
      default: false
    }
  },
  {
    // Ensures virtuals are included when sending JSON to the frontend
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: false // CMS handles this, usually not needed for read-only
  }
);

// --- PERFORMANCE INDEXING ---
// Essential for fast "Get All" and "Single" fetches
hotelSchema.index({ slug: 1 });
hotelSchema.index({ 'location.city': 1 });

hotelSchema.virtual('isBookable').get(function () {
  return this.roomsAvailable > 0;
});

// --- QUERY MIDDLEWARE ---
// Automatically populate or filter every time you fetch a hotel
hotelSchema.pre(/^find/, function () {
  // To hide hotels with 0 rooms from all results:
  this.find({ roomsAvailable: { $gt: 0 } });

  this.start = Date.now();
});

hotelSchema.post(/^find/, function (docs) {
  console.log(`Read Operation took ${Date.now() - this.start}ms`);
});

// --- STATIC METHODS ---
// Useful for specific "Get All" logic like top deals or city searches
hotelSchema.statics.findByCity = function (city) {
  return this.find({ 'location.city': new RegExp(city, 'i') });
};

const Hotel = mongoose.model('Hotel', hotelSchema);

module.exports = Hotel;
