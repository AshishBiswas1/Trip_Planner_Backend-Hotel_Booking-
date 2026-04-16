const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true
    },
    hotel: {
      type: mongoose.Schema.ObjectId,
      ref: 'Hotel',
      required: true
    },
    trip: {
      type: mongoose.Schema.ObjectId,
      ref: 'Trip',
      required: [true, 'A booking must belong to a trip']
    },
    room: {
      type: mongoose.Schema.ObjectId,
      ref: 'Room',
      required: true
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
bookingSchema.index({ trip: 1 }); // Crucial for filtering by trip
bookingSchema.index({ room: 1 });
bookingSchema.index({ checkInDate: 1, checkOutDate: 1 });

// --- MIDDLEWARE ---

// 1. Auto-populate references on every find query
bookingSchema.pre(/^find/, function () {
  this.populate({ path: 'user', select: 'name email' })
    .populate({ path: 'hotel', select: 'name location' })
    .populate({ path: 'room', select: 'roomNumber type' });
});

// 2. Validate booking dates against the Trip's dates
bookingSchema.pre('save', async function () {
  if (!this.isModified('checkInDate') && !this.isModified('checkOutDate'))
    return;

  const Trip = mongoose.model('Trip');
  const trip = await Trip.findById(this.trip);

  if (!trip) throw new Error('No trip found with that ID');

  if (this.checkInDate < trip.startDate || this.checkOutDate > trip.endDate) {
    throw new Error('Booking dates must fall within the trip duration.');
  }
});

// 3. Auto-fill total price from selected room price
bookingSchema.pre('validate', async function () {
  if (!this.room) throw new Error('A booking must include a room');

  if (this.isNew || this.isModified('room')) {
    const Room = mongoose.model('Room');
    const room = await Room.findById(this.room).select('price');

    if (!room) throw new Error('No room found with that ID');

    this.totalPrice = room.price;
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
    status: 'confirmed',
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
