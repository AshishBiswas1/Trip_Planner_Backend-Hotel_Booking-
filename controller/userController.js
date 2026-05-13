const AppError = require('../util/appError');
const catchAsync = require('../util/catchAsync');
const User = require('../models/userModel');
const handler = require('./handler');
const { upload } = require('../util/upload');
const { uploadBufferToCloudinary } = require('../util/cloudinary');
const jwt = require('jsonwebtoken');

function filterObj(Obj, ...allowedFields) {
  let newObj = {};
  Object.keys(Obj).forEach((el) => {
    if (allowedFields.includes(el)) newObj[el] = Obj[el];
  });
  return newObj;
}

exports.getAllUsers = handler.getAll(User);
exports.getUser = handler.getOne(User, null, 'id');
exports.updateUser = handler.updateOne(User);
exports.deleteUser = handler.deleteOne(User);

exports.uploadUserPhoto = upload.single('photo');

exports.uploadUserPhotoToCloudinary = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  const result = await uploadBufferToCloudinary(
    req.file.buffer,
    {
      folder: 'trip-planner/users',
      public_id: `user-${req.user.id}-${Date.now()}`,
      transformation: [
        { width: 500, height: 500, crop: 'fill', gravity: 'face' },
        { quality: 'auto', fetch_format: 'auto' }
      ]
    },
    req.file.mimetype
  );

  req.body.photo = result.secure_url;
  next();
});

exports.getMe = catchAsync(async (req, res, next) => {
  req.params.id = req.user.id;
  next();
});

exports.updateMe = catchAsync(async (req, res, next) => {
  // 1) Check if the user is trying to update password data
  if (req.body.password || req.body.confirmPassword) {
    return next(
      new AppError(
        'This route is not for password updates. Please use /updateMyPassword',
        400
      )
    );
  }

  // 2) Filter out the unwanted fields that are not allowed to be updated
  const filteredBody = filterObj(req.body, 'name', 'email', 'photo');

  // 3) Update user document
  const updateMe = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    status: 'success',
    data: {
      user: updateMe
    }
  });
});

exports.deleteMe = catchAsync(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user.id, { active: false });

  res.status(204).json({
    status: 'success',
    data: null
  });
});

exports.updateMyPassword = catchAsync(async (req, res, next) => {
  // 1) Get user
  const user = await User.findById(req.user.id).select('+password');

  // 2) Check if current password is correct
  if (!(await user.correctPassword(req.body.currentPassword, user.password))) {
    return next(new AppError('Your current password is wrong', 401));
  }

  // 3) If so, update password
  user.password = req.body.newPassword;
  user.confirmPassword = req.body.confirmPassword;
  await user.save();

  const token = jwt.sign(
    { id: user._id, tokenVersion: user.tokenVersion },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN
    }
  );

  // 4) Log user in, send JWT
  res.status(200).json({
    status: 'success',
    message: 'Password updated successfully',
    token,
    data: {
      user
    }
  });
});
