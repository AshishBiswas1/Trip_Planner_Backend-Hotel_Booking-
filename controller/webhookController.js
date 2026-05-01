const bookingController = require('./bookingController');
const paymentController = require('./paymentController');
const AppError = require('../util/appError');
const crypto = require('crypto');

const verifyRazorpayWebhookSignature = (req) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];

  if (!webhookSecret) {
    throw new AppError(
      'RAZORPAY_WEBHOOK_SECRET is not configured on the server',
      500
    );
  }

  if (!signature) {
    throw new AppError('Missing Razorpay webhook signature', 400);
  }

  if (!req.rawBody) {
    throw new AppError('Raw webhook body is missing', 400);
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(req.rawBody)
    .digest('hex');

  if (expectedSignature !== signature) {
    throw new AppError('Invalid Razorpay webhook signature', 401);
  }
};

const getReferenceId = (body) =>
  body?.payload?.payment_link?.entity?.reference_id ||
  body?.payload?.payment?.entity?.payment_link_id ||
  body?.razorpay_payment_link_reference_id ||
  null;

const getNotes = (body) =>
  body?.payload?.payment_link?.entity?.notes ||
  body?.payload?.payment?.entity?.notes ||
  {};

exports.dispatchSuccess = async (req, res, next) => {
  try {
    verifyRazorpayWebhookSignature(req);

    const ref = getReferenceId(req.body);
    const notes = getNotes(req.body);

    // Route by reference prefix
    if (ref && String(ref).startsWith('booking_')) {
      return bookingController.webhookSuccessBooking(req, res, next);
    }

    if (ref && String(ref).startsWith('travel_')) {
      return paymentController.webhookSuccessTravelPayment(req, res, next);
    }

    // Fallback: route by notes
    if (notes.bookingId) {
      return bookingController.webhookSuccessBooking(req, res, next);
    }

    if (notes.travelMode || notes.optionId) {
      return paymentController.webhookSuccessTravelPayment(req, res, next);
    }

    // Unknown: acknowledge to stop retries and log for inspection
    console.warn('Unroutable webhook success payload', req.body);
    return res
      .status(200)
      .json({ status: 'ignored', message: 'No matching flow' });
  } catch (err) {
    next(err);
  }
};

exports.dispatchFailure = async (req, res, next) => {
  try {
    verifyRazorpayWebhookSignature(req);

    const ref = getReferenceId(req.body);
    const notes = getNotes(req.body);

    if (ref && String(ref).startsWith('booking_')) {
      return bookingController.webhookFailedBooking(req, res, next);
    }

    if (ref && String(ref).startsWith('travel_')) {
      return paymentController.webhookFailedTravelPayment(req, res, next);
    }

    if (notes.bookingId) {
      return bookingController.webhookFailedBooking(req, res, next);
    }

    if (notes.travelMode || notes.optionId) {
      return paymentController.webhookFailedTravelPayment(req, res, next);
    }

    console.warn('Unroutable webhook failure payload', req.body);
    return res
      .status(200)
      .json({ status: 'ignored', message: 'No matching flow' });
  } catch (err) {
    next(err);
  }
};
