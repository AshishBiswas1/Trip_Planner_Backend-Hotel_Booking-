const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please tell us your name!'],
    trim: true,
    validate: {
      validator: function (val) {
        return val.length > 0 && /^[a-zA-Z\s]+$/.test(val);
      },
      message: 'Name must contain only letters and spaces'
    }
  },
  email: {
    type: String,
    required: [true, 'Please provide your email!'],
    unique: true,
    validate: {
      validator: validator.isEmail,
      message: 'Please provide a valid email'
    }
  },
  password: {
    type: String,
    required: [true, 'Please provide a password!'],
    minlength: 8,
    select: false
  },
  confirmPassword: {
    type: String,
    required: [true, 'Please confirm your password!'],
    validate: {
      validator: function (val) {
        return val === this.password;
      },
      message: 'Passwords do not match!'
    }
  },
  photo: {
    type: String,
    default: 'default.jpg'
  },
  role: {
    type: String,
    default: 'user',
    enum: ['user', 'admin']
  },
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  active: {
    type: Boolean,
    default: true,
    select: false
  }
});

// Before encrypting the password checks if it was modified or not
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  this.password = await bcrypt.hash(this.password, 12);
  this.confirmPassword = undefined;
});

// Fills the field passwordChangedAt with the date on which the password was changed
userSchema.pre('save', function () {
  if (!this.isModified('password') || this.isNew) return;

  this.passwordChangedAt = Date.now() - 1000;
});

// Returns users who have an active account
userSchema.pre(/^find/, function () {
  // This points to the current query
  this.find({ active: { $ne: false } });
});

// Checks if the password entered by the user and the actual password are same or not
userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Check if the user ever changed the password after the JWT token was issued
userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimeStamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );

    return JWTTimestamp < changedTimeStamp;
  }

  // False means not chnaged
  return false;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
