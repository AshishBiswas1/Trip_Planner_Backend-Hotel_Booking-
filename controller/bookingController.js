const Booking = require('../models/bookingModel');
const Hotel = require('../models/hotelModel');
const Room = require('../models/roomModel');
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

const getPaymentMethodFromWebhookPayload = (body) =>
  body?.payload?.payment?.entity?.method ||
  body?.payload?.payment?.entity?.wallet ||
  body?.payload?.payment?.entity?.notes?.paymentMethod ||
  body?.payload?.payment_link?.entity?.notes?.paymentMethod;

const normalizePaymentMethod = (method) => {
  if (!method) return null;

  const normalizedMethod = String(method).toLowerCase();
  const allowedPaymentMethods = ['card', 'upi', 'netbanking'];

  return allowedPaymentMethods.includes(normalizedMethod)
    ? normalizedMethod
    : null;
};

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

const addDaysToDate = (date, numberOfDays) => {
  const result = new Date(date);
  result.setDate(result.getDate() + numberOfDays);
  return result;
};

exports.createBooking = catchAsync(async (req, res, next) => {
  const numberOfDays = Number(req.body.numberOfDays);
  const numberOfGuests = Number(req.body.numberOfGuests);
  const checkInDate = new Date(req.body.checkInDate);

  if (!Number.isInteger(numberOfDays) || numberOfDays < 1) {
    return next(new AppError('Please provide a valid number of days.', 400));
  }

  if (!Number.isInteger(numberOfGuests) || numberOfGuests < 1) {
    return next(new AppError('Please provide a valid number of guests.', 400));
  }

  if (Number.isNaN(checkInDate.getTime())) {
    return next(new AppError('Please provide a valid check-in date.', 400));
  }

  const room = await Room.findById(req.body.roomId).select('capacity hotel');

  if (!room) {
    return next(new AppError('No room found with that ID.', 404));
  }

  if (String(room.hotel) !== String(req.params.hotelId)) {
    return next(
      new AppError('This room does not belong to the selected hotel.', 400)
    );
  }

  if (numberOfGuests > room.capacity) {
    return next(
      new AppError(
        'The room cannot hold the number of guests. Please book another room.',
        400
      )
    );
  }

  const checkOutDate = addDaysToDate(checkInDate, numberOfDays);

  // 1) Prevent double-booking using our static method
  const isAvailable = await Booking.isRoomAvailable(
    req.body.roomId,
    checkInDate,
    checkOutDate
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
    trip: req.body.tripId || undefined,
    checkInDate,
    checkOutDate,
    numberOfDays,
    numberOfGuests,
    status: 'pending',
    isPaid: false,
    specialRequests: req.body.specialRequests
  });

  req.booking = booking;
  return next();
});

exports.createTravelBooking = catchAsync(async (req, res, next) => {
  const travelMode = req.body.travelMode;
  const from = req.body.from;
  const to = req.body.to;
  const optionId = req.body.optionId;
  const provider = req.body.provider;
  const passengers = Number(req.body.passengers);
  const totalPrice = Number(req.body.totalPrice);
  const travelDate = new Date(req.body.travelDate);

  if (!['flights', 'trains', 'buses'].includes(travelMode)) {
    return next(new AppError('Please provide a valid travel mode.', 400));
  }

  if (!from || !to) {
    return next(
      new AppError('Please provide both origin and destination.', 400)
    );
  }

  if (!optionId) {
    return next(new AppError('Please provide a valid travel option id.', 400));
  }

  if (!Number.isInteger(passengers) || passengers < 1) {
    return next(new AppError('Please provide a valid passenger count.', 400));
  }

  if (Number.isNaN(travelDate.getTime())) {
    return next(new AppError('Please provide a valid travel date.', 400));
  }

  if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
    return next(new AppError('Please provide a valid total price.', 400));
  }

  const checkOutDate = addDaysToDate(travelDate, 1);

  const booking = await Booking.create({
    user: req.user.id,
    bookingType: 'travel',
    checkInDate: travelDate,
    checkOutDate,
    numberOfDays: 1,
    numberOfGuests: passengers,
    totalPrice,
    status: 'pending',
    isPaid: false,
    specialRequests: req.body.specialRequests,
    travelDetails: {
      mode: travelMode,
      optionId,
      provider,
      from,
      to,
      passengers,
      travelDate
    }
  });

  req.booking = booking;
  return next();
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

  // Update payment using instance and save() to trigger pre/post-save middleware
  const webhookPaymentMethod = getPaymentMethodFromWebhookPayload(req.body);
  const normalizedWebhookPaymentMethod =
    normalizePaymentMethod(webhookPaymentMethod);
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
  // Post-save middleware automatically updates payment status

  // Explicitly update booking status and payment flag only for hotel bookings.
  if (payment.booking) {
    const booking = await Booking.findByIdAndUpdate(
      payment.booking,
      { status: 'confirmed', isPaid: true },
      { returnDocument: 'after' }
    );

    if (!booking) {
      return next(new AppError('No booking found for this payment', 404));
    }
  }

  res.status(200).json({
    status: 'success',
    message: 'Webhook success processed'
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

  // Update payment using markAsFailed() instance method which internally calls save()
  // to trigger pre/post-save middleware
  const failureReason =
    req.body?.payload?.payment?.entity?.error_description ||
    req.body?.failureReason ||
    'Payment failed';

  const webhookPaymentMethod = getPaymentMethodFromWebhookPayload(req.body);
  const normalizedWebhookPaymentMethod =
    normalizePaymentMethod(webhookPaymentMethod);
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
  // Post-save middleware automatically updates payment status

  // Explicitly update booking status and payment flag only for hotel bookings.
  if (payment.booking) {
    const booking = await Booking.findByIdAndUpdate(
      payment.booking,
      { status: 'cancelled', isPaid: false },
      { returnDocument: 'after' }
    );

    if (!booking) {
      return next(new AppError('No booking found for this payment', 404));
    }
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

exports.getAllHotelBookings = catchAsync(async (req, res, next) => {
  console.log(
    'Accessing getAllHotelBookings with hotel ID:',
    req.params.hotelId
  );
  const hotel = await Hotel.findById(req.params.hotelId);

  if (!hotel) {
    return next(new AppError('No hotel found with that ID', 404));
  }

  console.log('Hotel user:', hotel.user);
  console.log('Requesting user ID:', req.user._id);

  // Staff can only access bookings for their own hotel
  if (
    req.user.role === 'staff' &&
    hotel.user.toString() !== req.user._id.toString()
  ) {
    return next(
      new AppError(
        'You do not have permission to access this hotel bookings.',
        403
      )
    );
  }

  // Fetch all bookings for the hotel (not filtered by date)
  const bookings = await Booking.find({
    hotel: hotel._id,
    bookingType: 'hotel',
    status: { $in: ['pending', 'confirmed'] }
  })
    .populate('user', 'name email')
    .populate('room', 'roomNumber roomType price')
    .sort('-checkInDate');

  res.status(200).json({
    status: 'success',
    results: bookings.length,
    data: {
      hotel,
      bookings
    }
  });
});

exports.getMyBookings = catchAsync(async (req, res, next) => {
  const bookings = await Booking.find({ user: req.user.id }).sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: bookings.length,
    data: {
      bookings
    }
  });
});
