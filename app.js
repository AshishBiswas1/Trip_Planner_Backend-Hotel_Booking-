const express = require('express');
const globalErrorHandler = require('./controller/errorController');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const AppError = require('./util/appError');
const userRouter = require('./router/userRouter');

const app = express();

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

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Routes
app.use('/api/v1/user', userRouter);

app.all('/:splat', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
