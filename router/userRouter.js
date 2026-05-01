const express = require('express');
const authController = require('../controller/authController');
const userController = require('../controller/userController');

const router = express.Router();

router.route('/register').post(authController.register);
router.route('/login').post(authController.login);

router.route('/staff-register').post(authController.staffRegistration);
router.route('/staff-login').post(authController.staffLogin);

router.route('/logout').get(authController.logout);

router.use(authController.protect);
router
  .route('/me')
  .get(userController.getMe, userController.getUser)
  .patch(userController.updateMe);
router.route('/deleteMe').delete(userController.deleteMe);

router.use(authController.restrictTo('admin'));
router.route('/').get(userController.getAllUsers);
router
  .route('/:id')
  .get(userController.getUser)
  .patch(userController.updateUser)
  .delete(userController.deleteUser);

module.exports = router;
