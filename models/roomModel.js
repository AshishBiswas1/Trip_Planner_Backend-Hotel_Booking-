const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    hotel: {
      type: mongoose.Schema.ObjectId,
      ref: 'Hotel',
      required: [true, 'A room must belong to a hotel']
    },
    roomNumber: { type: String, required: true },
    roomType: {
      type: String,
      required: [true, 'Room must have a type'],
      enum: ['Single', 'Double', 'Suite', 'Deluxe']
    },
    price: { type: Number, required: [true, 'Room must have a price'] },
    capacity: { type: Number, required: true },
    amenities: [String],
    images: [String],
    isBooked: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

roomSchema.index({ hotel: 1, roomNumber: 1 }, { unique: true });
roomSchema.index({ price: 1, roomType: 1 });

// --- FIXED STATIC METHOD ---
roomSchema.statics.updateAvailableRooms = async function (hotelId) {
  if (!hotelId) return;

  // FIX: Aggregation requires an actual ObjectId, not a string.
  const targetId = new mongoose.Types.ObjectId(hotelId.toString());

  const stats = await this.aggregate([
    {
      $match: {
        hotel: targetId,
        isBooked: false,
        isActive: true
      }
    },
    {
      $group: {
        _id: '$hotel',
        nRooms: { $sum: 1 }
      }
    }
  ]);

  const count = stats.length > 0 ? stats[0].nRooms : 0;

  // Update the Hotel document
  await mongoose.model('Hotel').findByIdAndUpdate(hotelId, {
    roomsAvailable: count
  });
};

// --- FIXED MIDDLEWARE ---

// Pre-save: Async version fixes the "next is not a function" error
roomSchema.pre('save', async function () {
  if (this.roomNumber) {
    this.roomNumber = this.roomNumber.toUpperCase();
  }
});

// Post-save: Update count after single room creation
roomSchema.post('save', async function (doc) {
  if (doc) {
    await doc.constructor.updateAvailableRooms(doc.hotel);
  }
});

// Post-query: Update count after room update (Booking/Cancel)
roomSchema.post(/^findOneAnd/, async function (doc) {
  if (doc) {
    await doc.constructor.updateAvailableRooms(doc.hotel);
  }
});

// Post-delete: Update count after room deletion
roomSchema.post(
  'deleteOne',
  { document: true, query: false },
  async function (doc) {
    if (doc) {
      await doc.constructor.updateAvailableRooms(doc.hotel);
    }
  }
);

const Room = mongoose.model('Room', roomSchema);
module.exports = Room;
