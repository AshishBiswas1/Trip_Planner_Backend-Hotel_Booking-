const Review = require('../models/reviewModel');
const AppError = require('../util/appError');
const catchAsync = require('../util/catchAsync');

exports.setHotelUserIds = (req, res, next) => {
  if (!req.body.hotel && req.params.hotelId)
    req.body.hotel = req.params.hotelId;
  if (!req.body.user && req.user) req.body.user = req.user.id;
  next();
};

exports.getAllReviews = catchAsync(async (req, res, next) => {
  const filter = req.params.hotelId ? { hotel: req.params.hotelId } : {};

  const reviews = await Review.find(filter)
    .populate({ path: 'user', select: 'name photo' })
    .populate({ path: 'hotel', select: 'name slug' });

  res.status(200).json({
    status: 'success',
    results: reviews.length,
    data: {
      reviews
    }
  });
});

exports.getReview = catchAsync(async (req, res, next) => {
  const review = await Review.findById(req.params.id)
    .populate({ path: 'user', select: 'name photo' })
    .populate({ path: 'hotel', select: 'name slug' });

  if (!review) {
    return next(new AppError('No review found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      review
    }
  });
});

exports.createReview = catchAsync(async (req, res, next) => {
  if (!req.user) {
    return next(
      new AppError('You are not logged in! Please login first.', 401)
    );
  }

  if (req.user.role !== 'user') {
    return next(new AppError('Only users can submit reviews', 403));
  }

  if (!req.body.hotel) {
    return next(new AppError('Please provide a valid hotel ID', 400));
  }

  const review = await Review.create({
    user: req.user.id,
    hotel: req.body.hotel,
    rating: req.body.rating,
    comment: req.body.comment
  });

  res.status(201).json({
    status: 'success',
    data: {
      review
    }
  });
});

exports.updateReview = catchAsync(async (req, res, next) => {
  if (!req.user) {
    return next(
      new AppError('You are not logged in! Please login first.', 401)
    );
  }

  if (req.user.role !== 'user') {
    return next(new AppError('Only users can update their reviews', 403));
  }

  const review = await Review.findById(req.params.id);

  if (!review) {
    return next(new AppError('No review found with that ID', 404));
  }

  if (String(review.user) !== String(req.user.id)) {
    return next(
      new AppError('You can only update reviews created by you', 403)
    );
  }

  const updatedReview = await Review.findByIdAndUpdate(
    req.params.id,
    {
      rating: req.body.rating,
      comment: req.body.comment
    },
    {
      new: true,
      runValidators: true
    }
  );

  res.status(200).json({
    status: 'success',
    data: {
      review: updatedReview
    }
  });
});

exports.deleteReview = catchAsync(async (req, res, next) => {
  if (!req.user) {
    return next(
      new AppError('You are not logged in! Please login first.', 401)
    );
  }

  if (req.user.role !== 'user') {
    return next(new AppError('Only users can delete their reviews', 403));
  }

  const review = await Review.findById(req.params.id);

  if (!review) {
    return next(new AppError('No review found with that ID', 404));
  }

  if (String(review.user) !== String(req.user.id)) {
    return next(
      new AppError('You can only delete reviews created by you', 403)
    );
  }

  await Review.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null
  });
});
