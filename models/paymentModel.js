const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true
    },

    booking: {
      type: mongoose.Schema.ObjectId,
      ref: 'Booking',
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

    amount: {
      type: Number,
      required: true
    },

    currency: {
      type: String,
      default: 'INR'
    },

    paymentMethod: {
      type: String,
      enum: ['card', 'upi', 'netbanking'],
      required: true
    },

    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending'
    },

    transactionId: {
      type: String
    },

    paymentIntentId: {
      type: String
    },

    failureReason: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

// Index for faster queries
paymentSchema.index({ user: 1 });
paymentSchema.index({ booking: 1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
