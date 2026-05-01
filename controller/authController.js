const User = require('../models/userModel');
const jwt = require('jsonwebtoken');
const AppError = require('../util/appError');
const catchAsync = require('../util/catchAsync');
const { promisify } = require('util');

/*-----------------Sign-in Token Generation-----------------*/
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

/*-----------------Response Creation on User Sign-in or Register-----------------*/
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user
    }
  });
};

/*-----------------User Registration-----------------*/
exports.register = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword
  });
  createSendToken(newUser, 201, res);
});

/*-----------------Hotel Registration-----------------*/
exports.staffRegistration = catchAsync(async (req, res, next) => {
  const staff = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword,
    role: 'staff'
  });
  createSendToken(staff, 201, res);
});

/*-----------------User Login-----------------*/
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  createSendToken(user, 200, res);
});

/*-----------------Staff Login-----------------*/
exports.staffLogin = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  const staff = await User.findOne({ email }).select('+password');

  if (!staff || !(await staff.correctPassword(password, staff.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  createSendToken(staff, 200, res);
});

/*-----------------User Logout-----------------*/
exports.logout = (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully. Remove token from client storage.'
  });
};

/*-----------------Route Protection-----------------*/
exports.protect = catchAsync(async (req, res, next) => {
  // 1) Getting token and check it is there
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(
      new AppError('You are not logged in! Please login to get access.', 401)
    );
  }

  // 2)Verification of token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3)Check if the user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError('The user belonging to this token no longer exist.', 401)
    );
  }

  // 4)Check if the user changed the password after token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changedpassword! Please log in again.', 401)
    );
  }

  // Grant Access to PROTECTED Route
  req.user = currentUser;
  next();
});

/*-----------------Restriction-----------------*/
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          'You do not have the permission to perform thus action!',
          403
        )
      );
    }

    next();
  };
};
