const Razorpay = require('razorpay');
const Booking = require('../models/bookingModel');
const Payment = require('../models/paymentModel');
const Hotel = require('../models/hotelModel');
const catchAsync = require('../util/catchAsync');
const AppError = require('../util/appError');
const crypto = require('crypto');

// =====================================================
// CONSTANTS
// =====================================================

// Supported payment methods for Razorpay integration
const allowedPaymentMethods = ['card', 'upi', 'netbanking'];

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Helper function to create and initialize a Razorpay client instance
 * Validates that required environment variables (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) are present
 * @returns {Razorpay} - Initialized Razorpay client instance
 * @throws {AppError} - If credentials are missing from environment
 */
const createRazorpayClient = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new AppError(
      'Razorpay credentials are missing. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env.',
      500
    );
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
};

/**
 * Validates and normalizes the payment method to lowercase
 * Returns 'upi' as default if no method is provided
 * @param {string} method - The payment method to normalize
 * @returns {string} - Normalized payment method (card, upi, or netbanking)
 * @throws {AppError} - If payment method is not in the allowed list
 */
const normalizePaymentMethod = (method) => {
  if (!method) return 'upi';

  const normalizedMethod = String(method).toLowerCase();
  if (!allowedPaymentMethods.includes(normalizedMethod)) {
    throw new AppError(
      'Invalid payment method. Use card, upi, or netbanking.',
      400
    );
  }

  return normalizedMethod;
};

/**
 * Retrieves a booking and validates ownership
 * Ensures that only the booking owner can proceed with payment
 * @param {string} bookingId - The ID of the booking to retrieve
 * @param {string} userId - The ID of the user requesting the booking
 * @returns {Promise<Object>} - The booking document
 * @throws {AppError} - If booking not found (404) or user is not the owner (403)
 */
const getBookingForPayment = async (bookingId, userId) => {
  const booking = await Booking.findById(bookingId);

  if (!booking) {
    throw new AppError('No booking found with that ID.', 404);
  }

  if (String(booking.user) !== String(userId)) {
    throw new AppError('You are not allowed to pay for this booking.', 403);
  }

  return booking;
};

/**
 * Core payment creation/update function
 * Creates a Razorpay payment link and either creates a new Payment record or updates an existing pending one
 * Links the payment to the booking for tracking
 * Note: Booking status updates are handled automatically by Payment model's post-save middleware
 * @param {Object} params - Function parameters
 * @param {Object} params.booking - The booking document
 * @param {string} params.userId - The user ID creating the payment
 * @param {string} params.paymentMethod - Payment method (card, upi, or netbanking)
 * @param {string} params.currency - Currency code (defaults to INR)
 * @returns {Promise<Object>} - Object containing payment, paymentLink, and paymentUrl
 * @throws {AppError} - If Razorpay initialization fails or booking total is invalid
 */
const upsertPaymentForBooking = async ({
  booking,
  userId,
  paymentMethod,
  currency,
  returnUrl
}) => {
  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
  const normalizedCurrency = String(currency || 'INR').toUpperCase();
  const razorpay = createRazorpayClient();
  const amountInPaise = Math.round(Number(booking.totalPrice) * 100);

  if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
    throw new AppError('Booking total price is not valid for payment.', 400);
  }

  const paymentLink = await razorpay.paymentLink.create({
    amount: amountInPaise,
    currency: normalizedCurrency,
    reference_id: `booking_${booking._id.toString()}`,
    description: `Payment for booking ${booking._id.toString()}`,
    callback_url: returnUrl,
    callback_method: 'get',
    notes: {
      bookingId: booking._id.toString(),
      hotelId: booking.hotel.toString(),
      roomId: booking.room.toString(),
      paymentMethod: normalizedPaymentMethod
    }
  });

  const existingPendingPayment = await Payment.findOne({
    booking: booking._id,
    status: 'pending'
  }).sort('-createdAt');

  let payment;

  if (existingPendingPayment) {
    payment = await Payment.findByIdAndUpdate(
      existingPendingPayment._id,
      {
        amount: booking.totalPrice,
        currency: normalizedCurrency,
        paymentMethod: normalizedPaymentMethod,
        paymentIntentId: paymentLink.id,
        paymentLinkId: paymentLink.id,
        paymentOrderId: paymentLink.order_id || undefined,
        failureReason: undefined,
        transactionId: undefined,
        status: 'pending'
      },
      { new: true, runValidators: true }
    );
  } else {
    payment = await Payment.create({
      user: userId,
      booking: booking._id,
      hotel: booking.hotel,
      room: booking.room,
      amount: booking.totalPrice,
      currency: normalizedCurrency,
      paymentMethod: normalizedPaymentMethod,
      status: 'pending',
      paymentIntentId: paymentLink.id,
      paymentLinkId: paymentLink.id,
      paymentOrderId: paymentLink.order_id || undefined
    });
  }

  booking.payment = payment._id;
  await booking.save({ validateBeforeSave: false });

  // Note: Payment status updates are automatically handled by post-save middleware
  return {
    payment,
    paymentLink,
    paymentUrl: paymentLink.short_url
  };
};

const createTravelPaymentLink = async ({
  payment,
  travelMode,
  optionId,
  provider,
  from,
  to,
  passengers,
  travelDate,
  returnUrl
}) => {
  const razorpay = createRazorpayClient();

  const paymentLink = await razorpay.paymentLink.create({
    amount: Math.round(Number(payment.amount) * 100),
    currency: payment.currency || 'INR',
    reference_id: `travel_${payment._id.toString()}`,
    description: `Payment for ${travelMode} booking`,
    callback_url: returnUrl,
    callback_method: 'get',
    notes: {
      travelMode,
      optionId,
      provider,
      from,
      to,
      passengers: String(passengers),
      travelDate: travelDate ? new Date(travelDate).toISOString() : '',
      paymentMethod: payment.paymentMethod
    }
  });

  payment.paymentIntentId = paymentLink.id;
  payment.paymentLinkId = paymentLink.id;
  payment.paymentOrderId = paymentLink.order_id || undefined;

  await payment.save({ validateBeforeSave: false });

  return {
    payment,
    paymentLink,
    paymentUrl: paymentLink.short_url
  };
};

const getPaymentReferenceFromWebhookPayload = (body) =>
  body?.payload?.payment_link?.entity?.id ||
  body?.payload?.payment?.entity?.payment_link_id ||
  body?.payload?.payment?.entity?.order_id ||
  body?.razorpay_payment_link_id ||
  body?.razorpay_order_id;

const getPaymentIdFromWebhookPayload = (body) =>
  body?.payload?.payment?.entity?.id || body?.razorpay_payment_id;

const getPaymentMethodFromWebhookPayload = (body) =>
  body?.payload?.payment?.entity?.method ||
  body?.payload?.payment?.entity?.wallet ||
  body?.payload?.payment?.entity?.notes?.paymentMethod ||
  body?.payload?.payment_link?.entity?.notes?.paymentMethod;

const normalizeWebhookPaymentMethod = (method) => {
  if (!method) return null;

  const normalizedMethod = String(method).toLowerCase();
  return allowedPaymentMethods.includes(normalizedMethod)
    ? normalizedMethod
    : null;
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

const findTravelPaymentForWebhookPayload = async (body) => {
  const paymentReferenceId = getPaymentReferenceFromWebhookPayload(body);
  const paymentId = getPaymentIdFromWebhookPayload(body);

  const references = [paymentReferenceId, paymentId].filter(Boolean);

  if (references.length) {
    const payment = await Payment.findOne({
      paymentCategory: 'travel',
      $or: [
        { paymentIntentId: { $in: references } },
        { paymentLinkId: { $in: references } },
        { paymentOrderId: { $in: references } },
        { transactionId: { $in: references } }
      ]
    }).sort('-createdAt');

    if (payment) return payment;
  }

  return null;
};

// =====================================================
// CONTROLLER EXPORTS (Route Handlers)
// =====================================================

// Export the core payment upsert function for use by other controllers
exports.createPaymentForBooking = upsertPaymentForBooking;

/**
 * Controller: Create Payment for a Booking
 * POST endpoint that validates the booking, creates/updates a payment record, and returns the Razorpay payment link
 * Checks that the booking is not already paid and validates user ownership
 * The payment link URL is sent to the client for payment completion
 * @route POST /api/payments or POST /api/bookings/:hotelId/payments
 * @param {Object} req - Express request with user info and booking details
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.createPayment = catchAsync(async (req, res, next) => {
  if (req.body.travelMode) {
    const travelMode = req.body.travelMode;
    const from = req.body.from;
    const to = req.body.to;
    const optionId = req.body.optionId;
    const provider = req.body.provider;
    const passengers = Number(req.body.passengers);
    const totalPrice = Number(req.body.totalPrice);
    const travelDate = req.body.travelDate;

    if (!['flights', 'trains', 'buses'].includes(travelMode)) {
      return next(new AppError('Please provide a valid travel mode.', 400));
    }

    if (!from || !to || !optionId) {
      return next(
        new AppError('Please provide travel route and option details.', 400)
      );
    }

    if (!Number.isInteger(passengers) || passengers < 1) {
      return next(new AppError('Please provide a valid passenger count.', 400));
    }

    if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
      return next(new AppError('Please provide a valid total price.', 400));
    }

    if (!travelDate) {
      return next(new AppError('Please provide a valid travel date.', 400));
    }

    const payment = await Payment.create({
      user: req.user.id,
      paymentCategory: 'travel',
      amount: totalPrice,
      currency: String(req.body.currency || 'INR').toUpperCase(),
      paymentMethod: normalizePaymentMethod(req.body.paymentMethod),
      status: 'pending',
      travelMeta: {
        mode: travelMode,
        optionId
      }
    });

    const { paymentLink, paymentUrl } = await createTravelPaymentLink({
      payment,
      travelMode,
      optionId,
      provider,
      from,
      to,
      passengers,
      travelDate,
      returnUrl: req.body.returnUrl
    });

    return res.status(201).json({
      status: 'success',
      message: 'Travel payment link created successfully',
      data: {
        payment,
        paymentLink,
        paymentUrl
      }
    });
  }

  const booking =
    req.booking ||
    (req.body.bookingId
      ? await getBookingForPayment(req.body.bookingId, req.user.id)
      : null);

  if (!booking) {
    return next(
      new AppError('Please create a booking before creating payment.', 400)
    );
  }

  if (booking.isPaid || booking.status === 'confirmed') {
    return next(new AppError('This booking is already paid for.', 400));
  }

  const { payment, paymentLink, paymentUrl } = await upsertPaymentForBooking({
    booking,
    userId: req.user.id,
    paymentMethod: req.body.paymentMethod,
    currency: req.body.currency,
    returnUrl: req.body.returnUrl
  });

  res.status(201).json({
    status: 'success',
    message: 'Payment link created successfully',
    data: {
      booking,
      payment,
      paymentLink,
      paymentUrl
    }
  });
});

exports.webhookSuccessTravelPayment = catchAsync(async (req, res, next) => {
  verifyRazorpayWebhookSignature(req);

  const paymentId = getPaymentIdFromWebhookPayload(req.body);
  const payment = await findTravelPaymentForWebhookPayload(req.body);

  if (!payment) {
    return next(new AppError('No travel payment found for this webhook.', 404));
  }

  if (payment.status === 'completed') {
    return res.status(200).json({
      status: 'success',
      message: 'Webhook already processed'
    });
  }

  const webhookPaymentMethod = getPaymentMethodFromWebhookPayload(req.body);
  const normalizedWebhookPaymentMethod =
    normalizeWebhookPaymentMethod(webhookPaymentMethod);

  if (normalizedWebhookPaymentMethod) {
    payment.paymentMethod = normalizedWebhookPaymentMethod;
  }

  payment.status = 'completed';
  payment.transactionId = paymentId;
  payment.paymentLinkId =
    req.body?.payload?.payment?.entity?.payment_link_id ||
    req.body?.payload?.payment_link?.entity?.id ||
    payment.paymentLinkId;
  payment.paymentOrderId =
    req.body?.payload?.payment?.entity?.order_id || payment.paymentOrderId;
  payment.failureReason = undefined;

  await payment.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: 'Travel payment success processed'
  });
});

exports.webhookFailedTravelPayment = catchAsync(async (req, res, next) => {
  verifyRazorpayWebhookSignature(req);

  const paymentId = getPaymentIdFromWebhookPayload(req.body);
  const payment = await findTravelPaymentForWebhookPayload(req.body);

  if (!payment) {
    return next(new AppError('No travel payment found for this webhook.', 404));
  }

  if (payment.status === 'failed') {
    return res.status(200).json({
      status: 'success',
      message: 'Webhook already processed'
    });
  }

  const failureReason =
    req.body?.payload?.payment?.entity?.error_description ||
    req.body?.failureReason ||
    'Payment failed';

  const webhookPaymentMethod = getPaymentMethodFromWebhookPayload(req.body);
  const normalizedWebhookPaymentMethod =
    normalizeWebhookPaymentMethod(webhookPaymentMethod);

  if (normalizedWebhookPaymentMethod) {
    payment.paymentMethod = normalizedWebhookPaymentMethod;
  }

  payment.transactionId = paymentId || payment.transactionId;
  payment.paymentLinkId =
    req.body?.payload?.payment?.entity?.payment_link_id ||
    req.body?.payload?.payment_link?.entity?.id ||
    payment.paymentLinkId;
  payment.paymentOrderId =
    req.body?.payload?.payment?.entity?.order_id || payment.paymentOrderId;

  await payment.markAsFailed(failureReason);

  res.status(200).json({
    status: 'success',
    message: 'Travel payment failure processed'
  });
});

exports.getMyPayments = catchAsync(async (req, res, next) => {
  const payments = await Payment.find({ user: req.user.id })
    .sort('-createdAt')
    .populate({
      path: 'booking',
      select:
        'bookingType status totalPrice checkInDate checkOutDate travelDetails hotel room'
    })
    .populate({ path: 'hotel', select: 'name location slug' })
    .populate({ path: 'room', select: 'roomNumber type' });

  res.status(200).json({
    status: 'success',
    results: payments.length,
    data: {
      payments
    }
  });
});

exports.getHotelPayments = catchAsync(async (req, res, next) => {
  const hotel = await Hotel.findById(req.params.hotelId);

  if (!hotel) {
    return next(new AppError('No hotel found with that ID', 404));
  }

  // Staff can only access payments for their own hotel
  if (
    req.user.role === 'staff' &&
    hotel.user.toString() !== req.user._id.toString()
  ) {
    return next(
      new AppError(
        'You do not have permission to access this hotel payments.',
        403
      )
    );
  }

  // Fetch all payments for bookings at this hotel
  const payments = await Payment.find({ hotel: hotel._id })
    .sort('-createdAt')
    .populate({
      path: 'booking',
      select: 'bookingType status totalPrice checkInDate checkOutDate user room'
    })
    .populate({ path: 'user', select: 'name email' })
    .populate({ path: 'room', select: 'roomNumber roomType' });

  res.status(200).json({
    status: 'success',
    results: payments.length,
    data: {
      hotel,
      payments
    }
  });
});
