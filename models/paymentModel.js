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
      required: function () {
        return this.paymentCategory === 'hotel';
      }
    },
    paymentCategory: {
      type: String,
      enum: ['hotel', 'travel'],
      default: 'hotel'
    },
    hotel: {
      type: mongoose.Schema.ObjectId,
      ref: 'Hotel',
      required: function () {
        return this.paymentCategory === 'hotel';
      }
    },
    room: {
      type: mongoose.Schema.ObjectId,
      ref: 'Room',
      required: function () {
        return this.paymentCategory === 'hotel';
      }
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
    transactionId: String,
    paymentIntentId: String,
    paymentLinkId: String,
    paymentOrderId: String,
    failureReason: String,
    travelMeta: {
      mode: {
        type: String,
        enum: ['flights', 'trains', 'buses']
      },
      optionId: String
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// --- INDEXES ---
paymentSchema.index({ user: 1 });
paymentSchema.index({ booking: 1 });
paymentSchema.index({ status: 1 });

// --- PRE-SAVE MIDDLEWARE ---
// Ensure amount is never negative and handle status-based logic before saving
paymentSchema.pre('save', function () {
  if (this.amount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  // Example: Auto-generate a transaction ID if completed but ID is missing
  if (this.status === 'completed' && !this.transactionId) {
    this.transactionId = `TXN-${this._id.toString().toUpperCase()}`;
  }
});

// --- POST-SAVE MIDDLEWARE ---
// Automatically update the associated Booking status when a payment is successful
paymentSchema.post('save', async function (doc) {
  try {
    if (!doc.booking) return;

    if (doc.status === 'completed') {
      await mongoose.model('Booking').findByIdAndUpdate(doc.booking, {
        paymentStatus: 'paid',
        status: 'confirmed'
      });
    } else if (doc.status === 'failed') {
      await mongoose.model('Booking').findByIdAndUpdate(doc.booking, {
        paymentStatus: 'failed'
      });
    }
  } catch (err) {
    console.error('Error updating booking status after payment:', err);
  }
});

// --- INSTANCE METHODS ---
// Method to mark payment as failed with a reason
paymentSchema.methods.markAsFailed = function (reason) {
  this.status = 'failed';
  this.failureReason = reason || 'Transaction declined';
  return this.save();
};

// Method to verify if payment is successful
paymentSchema.methods.isSuccessful = function () {
  return this.status === 'completed';
};

// --- STATIC METHODS ---
// Get total revenue for a specific hotel
paymentSchema.statics.getTotalRevenueByHotel = async function (hotelId) {
  const stats = await this.aggregate([
    {
      $match: {
        hotel: new mongoose.Types.ObjectId(hotelId),
        status: 'completed'
      }
    },
    {
      $group: {
        _id: '$hotel',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
  return stats.length > 0 ? stats[0] : { totalAmount: 0, count: 0 };
};

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
