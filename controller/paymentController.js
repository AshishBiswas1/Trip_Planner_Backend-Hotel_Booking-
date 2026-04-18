const Razorpay = require('razorpay');
const Booking = require('../models/bookingModel');
const Payment = require('../models/paymentModel');
const catchAsync = require('../util/catchAsync');
const AppError = require('../util/appError');

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
      roomId: booking.room.toString()
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
