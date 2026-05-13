const express = require('express');
const reviewController = require('../controller/reviewController');
const authController = require('../controller/authController');

const router = express.Router({ mergeParams: true });

router
  .route('/')
  .get(authController.protect, reviewController.getAllHotelReviews)
  .post(
    authController.protect,
    authController.restrictTo('user', 'admin'),
    reviewController.createReview
  );

router.use(authController.protect);
router.route('/me').get(reviewController.getMyReviews);
router.route('/all').get(reviewController.getAllReviews);

router
  .route('/:id')
  .get(reviewController.getReview)
  .patch(reviewController.updateReview)
  .delete(reviewController.deleteReview);

module.exports = router;
