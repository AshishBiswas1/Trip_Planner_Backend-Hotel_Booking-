const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    hotel: {
      type: mongoose.Schema.ObjectId,
      ref: 'Hotel',
      required: [true, 'A room must belong to a hotel']
    },
    roomNumber: {
      type: String,
      required: true
    },
    roomType: {
      type: String,
      required: [true, 'Room must have a type'],
      enum: ['Single', 'Double', 'Suite', 'Deluxe']
    },
    price: {
      type: Number,
      required: [true, 'Room must have a price']
    },
    capacity: {
      type: Number,
      required: true
    },
    amenities: [String],
    images: [String],
    isBooked: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// --- INDEXES ---
// Compound index for fast lookup of rooms within a specific hotel
roomSchema.index({ hotel: 1, roomNumber: 1 }, { unique: true });
// Index for filtering by price and type
roomSchema.index({ price: 1, roomType: 1 });

// --- STATIC METHODS ---
// This function calculates and updates the hotel's available room count
roomSchema.statics.updateAvailableRooms = async function (hotelId) {
  const stats = await this.aggregate([
    { $match: { hotel: hotelId, isBooked: false, isActive: true } },
    { $count: 'availableCount' }
  ]);

  const count = stats.length > 0 ? stats[0].availableCount : 0;

  // Assuming your Hotel model has a field 'availableRooms'
  await mongoose.model('Hotel').findByIdAndUpdate(hotelId, {
    availableRooms: count
  });
};

// --- INSTANCE METHODS ---
// Check if room is currently available
roomSchema.methods.checkAvailability = function () {
  return this.isActive && !this.isBooked;
};

// --- MIDDLEWARE ---

// Pre-save: Logic before saving (e.g., logging or formatting)
roomSchema.pre('save', function (next) {
  // Example: Ensure room numbers are always uppercase
  this.roomNumber = this.roomNumber.toUpperCase();
  next();
});

// Post-save: Trigger count update after a room is created or updated
roomSchema.post('save', function () {
  // Use the constructor to access the static method
  this.constructor.updateAvailableRooms(this.hotel);
});

// Post-remove: Trigger count update after a room is deleted
roomSchema.post('remove', function () {
  this.constructor.updateAvailableRooms(this.hotel);
});

// --- REAL-TIME BOOKING SYNC ---
/* Note: If you update 'isBooked' using findByIdAndUpdate, 
   the 'save' middleware won't trigger. Use this post-hook 
   for findOneAndUpdate to catch booking changes.
*/
roomSchema.post(/^findOneAnd/, async function (doc) {
  if (doc) {
    await doc.constructor.updateAvailableRooms(doc.hotel);
  }
});

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;
