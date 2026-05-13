const express = require('express');
const authController = require('../controller/authController');
const userController = require('../controller/userController');

const router = express.Router();

router.route('/register').post(authController.register);
router.route('/login').post(authController.login);
router.route('/forgot-password').post(authController.forgetPassword);
router.route('/reset-password/:token').patch(authController.resetPassword);

router.route('/staff-register').post(authController.staffRegistration);
router.route('/staff-login').post(authController.staffLogin);

router.route('/logout').get(authController.protect, authController.logout);

router.use(authController.protect);
router
  .route('/me')
  .get(userController.getMe, userController.getUser)
  .patch(
    userController.uploadUserPhoto,
    userController.uploadUserPhotoToCloudinary,
    userController.updateMe
  );

router.route('/updateMyPassword').patch(userController.updateMyPassword);

router.route('/deleteMe').delete(userController.deleteMe);

router.use(authController.restrictTo('admin'));
router.route('/').get(userController.getAllUsers);
router
  .route('/:id')
  .get(userController.getUser)
  .patch(userController.updateUser)
  .delete(userController.deleteUser);

module.exports = router;
