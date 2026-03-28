const mongoose = require('mongoose');
const User = require('../models/userModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const AppError = require('../util/appError');
const catchAsync = require('../util/catchAsync');

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

  if (
    !newUser.name ||
    !newUser.email ||
    !newUser.password ||
    !newUser.confirmPassword
  ) {
    return next(new AppError('Please provide all required fields', 400));
  }

  createSendToken(newUser, 201, res);
});

/*-----------------User Login-----------------*/
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  const user = await User.findOne({ email }).select('+password');

  createSendToken(user, 200, res);
});

/*-----------------User Logout-----------------*/
exports.logout = (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully. Remove token from client storage.'
  });
};
