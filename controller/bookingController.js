const Booking = require('../models/bookingModel');
const Payment = require('../models/paymentModel');
const catchAsync = require('../util/catchAsync');
const AppError = require('../util/appError');
const crypto = require('crypto');

const getPaymentReferenceFromWebhookPayload = (body) =>
  body?.payload?.payment_link?.entity?.id ||
  body?.payload?.payment?.entity?.payment_link_id ||
  body?.payload?.payment?.entity?.order_id ||
  body?.razorpay_payment_link_id ||
  body?.razorpay_order_id;

const getPaymentIdFromWebhookPayload = (body) =>
  body?.payload?.payment?.entity?.id || body?.razorpay_payment_id;

const getBookingIdFromWebhookPayload = (body) => {
  const referenceId =
    body?.payload?.payment_link?.entity?.reference_id ||
    body?.payload?.payment?.entity?.notes?.bookingId ||
    body?.razorpay_payment_link_reference_id;

  if (!referenceId) return null;

  const referenceAsString = String(referenceId);
  if (referenceAsString.startsWith('booking_')) {
    return referenceAsString.replace('booking_', '');
  }

  return referenceAsString;
};

const findPaymentForWebhookPayload = async (body) => {
  const paymentReferenceId = getPaymentReferenceFromWebhookPayload(body);
  const paymentId = getPaymentIdFromWebhookPayload(body);

  const references = [paymentReferenceId, paymentId].filter(Boolean);

  if (references.length) {
    const payment = await Payment.findOne({
      $or: [
        { paymentIntentId: { $in: references } },
        { paymentLinkId: { $in: references } },
        { paymentOrderId: { $in: references } },
        { transactionId: { $in: references } }
      ]
    }).sort('-createdAt');

    if (payment) return payment;
  }

  const bookingId = getBookingIdFromWebhookPayload(body);
  if (bookingId) {
    const paymentByBooking = await Payment.findOne({ booking: bookingId }).sort(
      '-createdAt'
    );

    if (paymentByBooking) return paymentByBooking;
  }

  return null;
};

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

exports.createBooking = catchAsync(async (req, res, next) => {
  // 1) Prevent double-booking using our static method
  const isAvailable = await Booking.isRoomAvailable(
    req.body.roomId,
    req.body.checkInDate,
    req.body.checkOutDate
  );

  if (!isAvailable) {
    return next(
      new AppError('This room is already booked for the selected dates.', 400)
    );
  }

  // 2) Create the booking
  const booking = await Booking.create({
    user: req.user.id,
    hotel: req.params.hotelId,
    room: req.body.roomId,
    trip: req.body.tripId,
    checkInDate: req.body.checkInDate,
    checkOutDate: req.body.checkOutDate,
    numberOfGuests: req.body.numberOfGuests,
    status: 'pending',
    isPaid: false,
    specialRequests: req.body.specialRequests
  });

  req.booking = booking;
  return next();
});

exports.successBooking = catchAsync(async (req, res, next) => {
  const booking = await Booking.findByIdAndUpdate(
    req.params.id,
    { status: 'confirmed', isPaid: true },
    { returnDocument: 'after' }
  );

  if (!booking) {
    return next(new AppError('No booking found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    message: 'Booking confirmed and payment successful'
  });
});

exports.webhookSuccessBooking = catchAsync(async (req, res, next) => {
  verifyRazorpayWebhookSignature(req);

  const paymentId = getPaymentIdFromWebhookPayload(req.body);

  const payment = await findPaymentForWebhookPayload(req.body);

  if (!payment) {
    return next(new AppError('No payment found for this order id', 404));
  }

  if (payment.status === 'completed') {
    return res.status(200).json({
      status: 'success',
      message: 'Webhook already processed'
    });
  }

  await Payment.findByIdAndUpdate(
    payment._id,
    {
      status: 'completed',
      transactionId: paymentId,
      paymentLinkId:
        req.body?.payload?.payment?.entity?.payment_link_id ||
        req.body?.payload?.payment_link?.entity?.id ||
        payment.paymentLinkId,
      paymentOrderId:
        req.body?.payload?.payment?.entity?.order_id || payment.paymentOrderId,
      failureReason: undefined
    },
    { returnDocument: 'after', runValidators: true }
  );

  const booking = await Booking.findByIdAndUpdate(
    payment.booking,
    { status: 'confirmed', isPaid: true },
    { returnDocument: 'after' }
  );

  if (!booking) {
    return next(new AppError('No booking found for this payment', 404));
  }

  res.status(200).json({
    status: 'success',
    message: 'Webhook success processed'
  });
});

exports.failedBooking = catchAsync(async (req, res, next) => {
  const booking = await Booking.findByIdAndUpdate(
    req.params.id,
    { status: 'cancelled', isPaid: false },
    { returnDocument: 'after' }
  );

  if (!booking) {
    return next(new AppError('No booking found with that ID', 404));
  }

  res.status(200).json({
    status: 'failed',
    message: 'Booking cancelled and payment failed'
  });
});

exports.webhookFailedBooking = catchAsync(async (req, res, next) => {
  verifyRazorpayWebhookSignature(req);

  const paymentId = getPaymentIdFromWebhookPayload(req.body);

  const payment = await findPaymentForWebhookPayload(req.body);

  if (!payment) {
    return next(new AppError('No payment found for this order id', 404));
  }

  if (payment.status === 'failed') {
    return res.status(200).json({
      status: 'success',
      message: 'Webhook already processed'
    });
  }

  await Payment.findByIdAndUpdate(
    payment._id,
    {
      status: 'failed',
      transactionId: paymentId || payment.transactionId,
      paymentLinkId:
        req.body?.payload?.payment?.entity?.payment_link_id ||
        req.body?.payload?.payment_link?.entity?.id ||
        payment.paymentLinkId,
      paymentOrderId:
        req.body?.payload?.payment?.entity?.order_id || payment.paymentOrderId,
      failureReason:
        req.body?.payload?.payment?.entity?.error_description ||
        req.body?.failureReason ||
        'Payment failed'
    },
    { returnDocument: 'after', runValidators: true }
  );

  const booking = await Booking.findByIdAndUpdate(
    payment.booking,
    { status: 'cancelled', isPaid: false },
    { returnDocument: 'after' }
  );

  if (!booking) {
    return next(new AppError('No booking found for this payment', 404));
  }

  res.status(200).json({
    status: 'success',
    message: 'Webhook failure processed'
  });
});

exports.getSuccessfullBookings = catchAsync(async (req, res, next) => {
  // 1) Filter specifically for a trip if tripId is provided in params
  let filter = { status: 'confirmed' };
  if (req.params.tripId) filter.trip = req.params.tripId;

  const bookings = await Booking.find(filter);

  if (!bookings || bookings.length === 0) {
    return next(new AppError('No confirmed bookings found for this trip', 404));
  }

  res.status(200).json({
    status: 'success',
    results: bookings.length,
    data: {
      bookings
    }
  });
});

exports.getFailedBookings = catchAsync(async (req, res, next) => {
  const filter = { status: { $in: ['failed', 'cancelled'] } };
  if (req.params.tripId) filter.trip = req.params.tripId;

  const bookings = await Booking.find(filter);

  if (!bookings || bookings.length === 0) {
    return next(
      new AppError('No failed or cancelled bookings found for this trip', 404)
    );
  }

  res.status(200).json({
    status: 'success',
    results: bookings.length,
    data: {
      bookings
    }
  });
});
