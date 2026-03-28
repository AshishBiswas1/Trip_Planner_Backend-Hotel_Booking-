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

    numberOfGuests: {
      type: Number,
      required: true
    },

    totalPrice: {
      type: Number,
      required: true
    },

    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'pending'
    },

    payment: {
      type: mongoose.Schema.ObjectId,
      ref: 'Payment'
    },

    isPaid: {
      type: Boolean,
      default: false
    },

    specialRequests: {
      type: String
    },

    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Indexes for performance
bookingSchema.index({ user: 1 });
bookingSchema.index({ room: 1 });
bookingSchema.index({ checkInDate: 1, checkOutDate: 1 });

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
