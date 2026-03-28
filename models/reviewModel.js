const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'Review must belong to a user']
    },
    hotel: {
      type: mongoose.Schema.ObjectId,
      ref: 'Hotel',
      required: [true, 'Review must belong to a hotel']
    },
    rating: {
      type: Number,
      required: [true, 'Review must have a rating'],
      min: 1,
      max: 5,
      set: (val) => Math.round(val * 10) / 10
    },
    comment: {
      type: String,
      required: [true, 'Review must have a comment']
    }
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true
  }
);

reviewSchema.index({ user: 1, hotel: 1 }, { unique: true });
reviewSchema.index({ comment: 'text' });

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
