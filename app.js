const express = require('express');
const globalErrorHandler = require('./controller/errorController');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { sanitize } = require('express-xss-sanitizer');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');

const AppError = require('./util/appError');
const userRouter = require('./router/userRouter');
const hotelRouter = require('./router/hotelRouter');
const bookingRouter = require('./router/bookingRouter');
const tripRouter = require('./router/tripRouter');
const travelModeRouter = require('./router/travelModeRouter');
const reviewRouter = require('./router/reviewRouter');

const app = express();
const aiRouter = require('./router/aiRouter');

const xssSanitizer = (req, res, next) => {
  if (req.body) req.body = sanitize(req.body);
  if (req.params) req.params = sanitize(req.params);
  if (req.headers) req.headers = sanitize(req.headers);

  next();
};

const mongoSanitizer = (req, res, next) => {
  if (req.body) req.body = mongoSanitize.sanitize(req.body);
  if (req.params) req.params = mongoSanitize.sanitize(req.params);
  if (req.headers) req.headers = mongoSanitize.sanitize(req.headers);

  if (req.query) {
    const sanitizedQuery = mongoSanitize.sanitize({ ...req.query });

    Object.defineProperty(req, 'query', {
      value: sanitizedQuery,
      writable: false,
      configurable: true,
      enumerable: true
    });
  }

  next();
};

// Parse nested query params like rating[gte]=4 for combined filtering.
app.set('query parser', 'extended');

const normalizeOrigin = (origin) =>
  origin ? origin.trim().replace(/\/$/, '').toLowerCase() : '';

const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const localDevOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
].map((origin) => normalizeOrigin(origin));

const allowedOrigins = Array.from(
  new Set([...configuredOrigins, ...localDevOrigins])
);

const vercelPreviewOriginPattern =
  /^https:\/\/trip-planner-hotel-booking(?:-[a-z0-9-]+)?\.vercel\.app$/i;

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    const normalizedOrigin = normalizeOrigin(origin);

    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      return callback(null, true);
    }

    if (
      allowedOrigins.length === 0 ||
      allowedOrigins.includes(normalizedOrigin)
    ) {
      return callback(null, true);
    }

    if (vercelPreviewOriginPattern.test(normalizedOrigin)) {
      return callback(null, true);
    }

    return callback(new AppError(`CORS Blocked by Origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Access-Control-Request-Private-Network'
  ],
  credentials: true
};

// Chrome Private Network Access preflight support for localhost testing.
const allowPrivateNetwork = (req, res, next) => {
  if (req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }

  next();
};

app.use(allowPrivateNetwork);
app.use(cors(corsOptions));
app.options('/{*splat}', allowPrivateNetwork, cors(corsOptions));

app.use(helmet());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message:
      'Too many requests from this IP, please try again after 15 minutes!'
  })
);

app.use(
  express.json({
    limit: '10kb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use(mongoSanitizer);
app.use(xssSanitizer);
app.use(
  hpp({
    whitelist: ['sort', 'fields', 'page', 'limit']
  })
);

// Routes
app.get('/', (req, res, next) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome to the Trip Planner Hotel Booking API!'
  });
});

// Health and Readiness Endpoint
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'success',
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())} seconds`,
    services: {
      server: 'UP',
      // You can expand this to include actual DB connection checks
      database: 'READY'
    }
  };

  try {
    // Logic to determine readiness (e.g., check if static files are loaded)
    res.status(200).json(healthStatus);
  } catch (error) {
    healthStatus.status = 'error';
    healthStatus.message = error.message;
    res.status(503).json(healthStatus);
  }
});

app.use('/api/v1/user', userRouter);
app.use('/api/v1/hotel', hotelRouter);
app.use('/api/v1/booking', bookingRouter);
app.use('/api/v1/trip', tripRouter);
app.use('/api/v1/travel', travelModeRouter);
app.use('/api/v1/review', reviewRouter);
app.use('/api/v1/ai', aiRouter);

app.all('/:splat', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
