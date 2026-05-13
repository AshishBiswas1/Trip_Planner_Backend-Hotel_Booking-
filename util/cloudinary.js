const { v2: cloudinary } = require('cloudinary');
const AppError = require('./appError');

const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY || process.env.API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET || process.env.API_SECRET;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });
}

const assertCloudinaryConfigured = () => {
  if (process.env.CLOUDINARY_URL) return;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new AppError(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
      500
    );
  }
};

const uploadBufferToCloudinary = (
  buffer,
  options = {},
  mimeType = 'image/jpeg'
) => {
  assertCloudinaryConfigured();

  const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;

  return cloudinary.uploader.upload(dataUri, {
    resource_type: 'image',
    ...options
  });
};

module.exports = {
  cloudinary,
  uploadBufferToCloudinary
};
