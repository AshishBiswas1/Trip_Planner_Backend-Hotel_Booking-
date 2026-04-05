const AppError = require('../util/appError');

const handleDuplicateFieldsDB = (err) => {
  let value = 'duplicate';
  if (err.detail) {
    const match = err.detail.match(/Key \(([^)]+)\)=\(([^)]+)\)/);
    if (match) {
      value = match[2];
    }
  }

  const message = `Duplicate field value: ${value}. Please use a different value.`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors || {}).map((el) => el.message);
  const message = `Invalid Input Data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

const handleSupabaseConnectionError = (err) => {
  const message = 'Database connection failed. Please try again later.';
  return new AppError(message, 503);
};

const handleJWTError = () =>
  new AppError('Invalid token. Please log in again!', 401);

const handleTokenExpiredError = () =>
  new AppError('Token expired. Please log in again!', 401);

exports.sendDevError = (err, req, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    stack: err.stack
  });
};

exports.sendProdError = (err, req, res) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message
    });
  } else {
    console.error('Error 💥:', err);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong'
    });
  }
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    exports.sendDevError(err, req, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = { ...err };
    error.message = err.message;
    error.name = err.name;
    error.code = err.code;
    error.detail = err.detail;

    if (error.code === '23505') error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError')
      error = handleValidationErrorDB(error);
    if (error.code === 'ECONNREFUSED')
      error = handleSupabaseConnectionError(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleTokenExpiredError();

    exports.sendProdError(error, req, res);
  }
};
