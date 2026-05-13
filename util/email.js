const nodemailer = require('nodemailer');
const path = require('path');
const pug = require('pug');

const emailUser = process.env.EMAIL_USER;
const googleAppPassword = process.env.GOOGLE_APP_PASSWORD;
const frontendBaseUrl = process.env.CORS_ORIGINS || 'http://localhost:3000';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  port: 465,
  secure: true,
  auth: {
    user: emailUser,
    pass: googleAppPassword
  }
});

const welcomeEmail = async (email, name, frontendBaseUrl) => {
  if (!emailUser || !googleAppPassword) {
    throw new Error(
      'Missing email credentials. Set EMAIL_USER and GOOGLE_APP_PASSWORD in the backend environment.'
    );
  }

  const html = pug.renderFile(
    path.join(__dirname, '..', 'views', 'emails', 'welcomeEmail.pug'),
    {
      name,
      frontendBaseUrl,
      appName: 'Trip Planner'
    }
  );

  const message = {
    from: `Trip Planner <${emailUser}>`,
    to: email,
    subject: 'Welcome to Trip Planner',
    html
  };

  return transporter.sendMail(message);
};

const forgetPasswordEmail = async (email, name, resetUrl) => {
  if (!emailUser || !googleAppPassword) {
    throw new Error(
      'Missing email credentials. Set EMAIL_USER and GOOGLE_APP_PASSWORD in the backend environment.'
    );
  }

  const html = pug.renderFile(
    path.join(__dirname, '..', 'views', 'emails', 'forgetPasswordEmail.pug'),
    {
      name,
      resetUrl,
      appName: 'Trip Planner'
    }
  );

  const message = {
    from: `Trip Planner <${emailUser}>`,
    to: email,
    subject: 'Reset Your Password',
    html
  };

  return transporter.sendMail(message);
};

module.exports = {
  welcomeEmail,
  forgetPasswordEmail
};
