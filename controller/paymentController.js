const Razorpay = require('razorpay');
const Booking = require('../models/bookingModel');
const Payment = require('../models/paymentModel');
const catchAsync = require('../util/catchAsync');
const AppError = require('../util/appError');

const allowedPaymentMethods = ['card', 'upi', 'netbanking'];

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

const upsertPaymentForBooking = async ({
  booking,
  userId,
  paymentMethod,
  currency
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

  return {
    payment,
    paymentLink,
    paymentUrl: paymentLink.short_url
  };
};

exports.createPaymentForBooking = upsertPaymentForBooking;

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
    currency: req.body.currency
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
