const User = require('../models/userModel');
const jwt = require('jsonwebtoken');
const AppError = require('../util/appError');
const catchAsync = require('../util/catchAsync');
const { promisify } = require('util');
const crypto = require('crypto');
const { welcomeEmail, forgetPasswordEmail } = require('../util/email');

/*-----------------Sign-in Token Generation-----------------*/
const signToken = (id, tokenVersion) => {
  return jwt.sign({ id, tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

/*-----------------Response Creation on User Sign-in or Register-----------------*/
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id, user.tokenVersion);
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

  await welcomeEmail(newUser.email, newUser.name);

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

  await welcomeEmail(staff.email, staff.name);

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
exports.logout = catchAsync(async (req, res, next) => {
  if (!req.user) {
    return next(
      new AppError('You are not logged in! Please login to get access.', 401)
    );
  }

  await User.findByIdAndUpdate(req.user.id, { $inc: { tokenVersion: 1 } });

  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully. Remove token from client storage.'
  });
});

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

  // 2) Verification of token
  let decoded;
  try {
    decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  } catch (err) {
    return next(
      new AppError('Invalid or expired token. Please log in again.', 401)
    );
  }

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

  if (decoded.tokenVersion !== currentUser.tokenVersion) {
    return next(
      new AppError('Token no longer valid. Please log in again.', 401)
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
          'You do not have the permission to perform this action!',
          403
        )
      );
    }
    next();
  };
};

/*-----------------Forgot Password-----------------*/
exports.forgetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on POSTed email
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    return next(new AppError('There is no user with email address.', 404));
  }

  // 2) Generate the random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // 3) Send it to user's email
  try {
    const frontendBaseUrl = (
      process.env.CORS_ORIGINS || 'http://localhost:3000'
    )
      .split(',')[0]
      .trim();
    const resetUrl = new URL(
      `/reset-password/${resetToken}`,
      frontendBaseUrl
    ).toString();
    await forgetPasswordEmail(user.email, user.name, resetUrl);

    res.status(200).json({
      status: 'success',
      message: 'Token sent to email!'
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError(
        'There was an error sending the email. Try again later!',
        500
      )
    );
  }
});

/*-----------------Reset Password-----------------*/
exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on the token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  });

  // 2) If token has not expired, and there is user, set the new password
  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }

  user.password = req.body.password;
  user.confirmPassword = req.body.confirmPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // 3) Update changedPasswordAt property for the user
  // 4) Log the user in, send JWT
  createSendToken(user, 200, res);
});
