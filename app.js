const express = require('express');
const globalErrorHandler = require('./controller/errorController');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const AppError = require('./util/appError');
const userRouter = require('./router/userRouter');
const hotelRouter = require('./router/hotelRouter');
const bookingRouter = require('./router/bookingRouter');
const tripRouter = require('./router/tripRouter');
const travelModeRouter = require('./router/travelModeRouter');

const app = express();

// Parse nested query params like rating[gte]=4 for combined filtering.
app.set('query parser', 'extended');

app.use(cors());
app.use(helmet());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message:
      'Too many requests from this IP, please try again after 15 minutes!'
  })
);

app.use(
  express.json({
    limit: '10kb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Routes
app.get('/', (req, res, next) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome to the Trip Planner Hotel Booking API!'
  });
});

app.use('/api/v1/user', userRouter);
app.use('/api/v1/hotel', hotelRouter);
app.use('/api/v1/booking', bookingRouter);
app.use('/api/v1/trip', tripRouter);
app.use('/api/v1/travel', travelModeRouter);

app.all('/:splat', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
