const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    bookingType: {
      type: String,
      enum: ['hotel', 'travel'],
      default: 'hotel'
    },
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true
    },
    hotel: {
      type: mongoose.Schema.ObjectId,
      ref: 'Hotel',
      required: function () {
        return this.bookingType === 'hotel';
      }
    },
    trip: {
      type: mongoose.Schema.ObjectId,
      ref: 'Trip'
    },
    room: {
      type: mongoose.Schema.ObjectId,
      ref: 'Room',
      required: function () {
        return this.bookingType === 'hotel';
      }
    },
    checkInDate: {
      type: Date,
      required: [true, 'Booking must have a check-in date']
    },
    checkOutDate: {
      type: Date,
      required: [true, 'Booking must have a check-out date'],
      validate: {
        validator: function (value) {
          return value > this.checkInDate;
        },
        message: 'Check-out must be after check-in'
      }
    },
    numberOfDays: {
      type: Number,
      required: [true, 'Booking must have a number of days'],
      min: [1, 'Booking must be at least 1 day']
    },
    numberOfGuests: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'failed'],
      default: 'pending'
    },
    payment: { type: mongoose.Schema.ObjectId, ref: 'Payment' },
    isPaid: { type: Boolean, default: false },
    specialRequests: { type: String },
    travelDetails: {
      mode: {
        type: String,
        enum: ['flights', 'trains', 'buses']
      },
      optionId: String,
      provider: String,
      from: String,
      to: String,
      passengers: Number,
      travelDate: Date
    },
    createdAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for performance
bookingSchema.index({ user: 1 });
bookingSchema.index({ trip: 1 });
bookingSchema.index({ room: 1 });
bookingSchema.index({ checkInDate: 1, checkOutDate: 1 });
bookingSchema.index({ numberOfDays: 1 });

// --- MIDDLEWARE ---

// 1. Auto-populate references on every find query
bookingSchema.pre(/^find/, function () {
  this.populate({ path: 'user', select: 'name email' })
    .populate({ path: 'hotel', select: 'name location' })
    .populate({ path: 'room', select: 'roomNumber type' });
});

// 2. Auto-fill total price from selected room price and stay duration
bookingSchema.pre('validate', async function () {
  if (this.bookingType === 'travel') {
    if (!Number.isFinite(this.totalPrice) || this.totalPrice <= 0) {
      throw new Error('Travel booking must include a valid total price');
    }
    return;
  }

  if (!this.room) throw new Error('A booking must include a room');
  if (!Number.isInteger(this.numberOfDays) || this.numberOfDays < 1) {
    throw new Error('A booking must include a valid number of days');
  }

  if (
    this.isNew ||
    this.isModified('room') ||
    this.isModified('numberOfDays')
  ) {
    const Room = mongoose.model('Room');
    const room = await Room.findById(this.room).select('price');

    if (!room) throw new Error('No room found with that ID');

    this.totalPrice = room.price * this.numberOfDays;
  }
});

// --- STATIC METHODS ---
bookingSchema.statics.isRoomAvailable = async function (
  roomId,
  checkIn,
  checkOut
) {
  const overlap = await this.findOne({
    room: roomId,
    status: { $in: ['pending', 'confirmed'] },
    $or: [
      {
        checkInDate: { $lt: new Date(checkOut) },
        checkOutDate: { $gt: new Date(checkIn) }
      }
    ]
  });
  return !overlap;
};

const Booking = mongoose.model('Booking', bookingSchema);
module.exports = Booking;
