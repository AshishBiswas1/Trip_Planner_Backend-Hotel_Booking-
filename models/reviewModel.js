const mongoose = require('mongoose');
const Hotel = require('./hotelModel');

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
      type: String
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

reviewSchema.statics.calcAverageRatings = async function (hotelId) {
  const stats = await this.aggregate([
    {
      $match: {
        hotel: hotelId
      }
    },
    {
      $group: {
        _id: '$hotel',
        totalReviews: { $sum: 1 },
        avgRating: { $avg: '$rating' }
      }
    }
  ]);

  if (stats.length > 0) {
    await Hotel.findByIdAndUpdate(hotelId, {
      totalReviews: stats[0].totalReviews,
      rating: Math.round(stats[0].avgRating * 10) / 10
    });
  } else {
    await Hotel.findByIdAndUpdate(hotelId, {
      totalReviews: 0,
      rating: 0
    });
  }
};

reviewSchema.post('save', function () {
  this.constructor.calcAverageRatings(this.hotel);
});

reviewSchema.pre(/^findOneAnd/, async function () {
  this.reviewDoc = await this.clone().findOne();
});

reviewSchema.post(/^findOneAnd/, async function () {
  if (this.reviewDoc) {
    await this.reviewDoc.constructor.calcAverageRatings(this.reviewDoc.hotel);
  }
});

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
