# Trip Planner Backend - Hotel Booking REST API

A robust Node.js and Express-based REST API server for the Trip Planner hotel booking and travel management platform. Provides comprehensive endpoints for hotel management, bookings, payments, user authentication, and trip planning.

## Overview

Trip Planner Backend is a production-ready API server that serves as the central hub for:
- Hotel, room, and booking data management
- User authentication and authorization
- Payment processing via Razorpay
- Trip planning and route calculations
- Review and rating management
- Travel mode options (flights, trains, buses)
- Email notifications and confirmation
- File uploads and image CDN integration
- Comprehensive error handling and security

## Key Features

### Authentication & Authorization
- JWT token-based authentication
- Role-based access control (user, staff, admin)
- Secure password hashing
- Token refresh mechanism
- Email verification for new accounts

### Hotel Management
- Full CRUD operations for hotels
- Hotel amenities and facilities management
- Location-based filtering and search
- Hotel availability status tracking
- Multi-image support with Cloudinary CDN

### Room Management
- Room creation and management per hotel
- Room type categorization (Single, Double, Suite, Deluxe)
- Dynamic pricing based on availability
- Room amenity management
- Capacity and availability validation

### Booking Management
- Hotel room booking creation and management
- Check-in and check-out date validation
- Booking status tracking (pending, confirmed, completed, cancelled)
- Booking history and past bookings retrieval
- Guest count validation

### Payment Processing
- Razorpay payment gateway integration
- Payment status tracking
- Webhook handling for payment confirmations
- Refund management
- Payment history and receipts

### Trip Planning
- Trip creation with multi-leg routes
- Travel mode selection (flight, train, bus, car)
- Route distance and duration calculation
- Cost estimation using AI service
- Trip status management

### Reviews & Ratings
- Guest review submission after checkout
- Rating system (1-5 stars)
- Review moderation
- Average rating calculation
- Review filtering by hotel

### User Management
- User registration and profile management
- User preferences and settings
- User activity tracking
- Password reset functionality
- Profile picture upload

### Travel Options
- Flight availability and details
- Train schedules and routes
- Bus routes and availability
- Travel mode filtering and comparison

### Email Notifications
- Welcome email on registration
- Password reset email
- Booking confirmation email
- Payment receipt email
- Pug template-based email rendering

### File Management
- Image uploads via Multer
- Cloudinary integration for CDN
- Hotel and room photo management
- User profile picture upload
- Automatic image optimization

## Technology Stack

### Runtime & Framework
- **Node.js** - JavaScript runtime
- **Express.js** - Web framework and routing
- **Mongoose** - MongoDB ODM

### Database
- **MongoDB** - NoSQL database
- **Mongoose** - Schema validation and modeling

### Authentication
- **JWT** - JSON Web Tokens
- **bcryptjs** - Password hashing

### Payments
- **Razorpay** - Payment gateway and webhooks

### Email
- **Nodemailer** - Email sending
- **Pug** - Email template rendering

### File Upload
- **Multer** - Middleware for file uploads
- **Cloudinary** - Image CDN and storage

### Security
- **Helmet** - HTTP headers security
- **CORS** - Cross-origin request handling
- **Express-mongo-sanitize** - MongoDB injection prevention
- **express-rate-limit** - Rate limiting
- **hpp** - HTTP parameter pollution protection
- **xss-clean** - XSS attack prevention

### Utilities
- **dotenv** - Environment variable management
- **cors** - CORS middleware
- **morgan** - Request logging

## Installation & Setup

### Prerequisites
- Node.js 14+ and npm/yarn
- MongoDB instance (local or cloud)
- Razorpay API credentials
- Cloudinary API credentials
- Email service provider credentials

### 1. Install Dependencies
`
cd Trip_Planner_Backend-Hotel_Booking-
npm install
`

### 2. Configure Environment Variables

Create a .env file in the project root:

`
NODE_ENV=development
PORT=8000

MONGO_URI=your_mongodb_connection_string
MONGO_DATABASE=trip_planner

JWT_SECRET=your_jwt_secret_key
JWT_EXPIRE=7d

RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

CLOUDINARY_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

SMTP_HOST=your_email_provider_host
SMTP_PORT=your_email_provider_port
SMTP_USER=your_email_address
SMTP_PASS=your_email_password
SMTP_FROM=noreply@tripplanner.com

EMAIL_FROM=noreply@tripplanner.com

API_BASE_URL=http://localhost:8000/api/v1

GOOGLE_MAPS_API_KEY=your_google_maps_api_key

FRONTEND_URL=http://localhost:3000
CMS_URL=http://localhost:3001

CORS_ORIGIN=http://localhost:3000
`

### 3. Start Development Server
`
npm run dev
`

Server runs on http://localhost:8000

### 4. Build for Production
`
npm run build
npm start
`

## Environment Variables

| Variable | Purpose |
|----------|---------|
| NODE_ENV | Environment (development/production) |
| PORT | Server port |
| MONGO_URI | MongoDB connection string |
| MONGO_DATABASE | Database name |
| JWT_SECRET | Secret key for JWT signing |
| JWT_EXPIRE | Token expiration time |
| RAZORPAY_KEY_ID | Razorpay merchant key ID |
| RAZORPAY_KEY_SECRET | Razorpay merchant secret key |
| CLOUDINARY_NAME | Cloudinary account name |
| CLOUDINARY_API_KEY | Cloudinary API key |
| CLOUDINARY_API_SECRET | Cloudinary API secret |
| SMTP_HOST | Email provider host |
| SMTP_PORT | Email provider port |
| SMTP_USER | Email provider username |
| SMTP_PASS | Email provider password |
| SMTP_FROM | Email from address |
| EMAIL_FROM | Email sender address |
| API_BASE_URL | API base URL for links |
| GOOGLE_MAPS_API_KEY | Google Maps API key |
| FRONTEND_URL | Frontend application URL |
| CMS_URL | CMS application URL |
| CORS_ORIGIN | CORS allowed origins |

## API Endpoints

### Authentication Routes (/auth)
- POST /register - Register new user
- POST /login - User login
- POST /forgotPassword - Request password reset
- PUT /resetPassword/:token - Reset password
- PATCH /updatePassword - Update password (authenticated)

### User Routes (/users)
- GET /profile - Get current user profile (authenticated)
- PATCH /updateProfile - Update user profile (authenticated)
- PATCH /updateProfileImage - Upload profile picture (authenticated)
- GET /:id - Get user by ID (admin)
- GET / - Get all users (admin)
- DELETE /:id - Delete user (admin)

### Hotel Routes (/hotels)
- GET / - Get all hotels with filters
- POST / - Create hotel (staff/admin)
- GET /:id - Get hotel details
- PATCH /:id - Update hotel (staff/admin)
- DELETE /:id - Delete hotel (admin)
- GET /:id/reviews - Get hotel reviews

### Room Routes (/rooms)
- GET / - Get all rooms with filters
- POST / - Create room (staff/admin)
- GET /:id - Get room details
- PATCH /:id - Update room (staff/admin)
- DELETE /:id - Delete room (admin)
- GET /hotel/:hotelId - Get rooms by hotel

### Booking Routes (/bookings)
- GET / - Get bookings (filtered by role)
- POST / - Create booking (authenticated)
- GET /:id - Get booking details
- PATCH /:id - Update booking status (staff/admin)
- DELETE /:id - Cancel booking (authenticated)
- POST /:id/checkout - Prepare checkout

### Payment Routes (/payments)
- POST /create - Initiate payment
- POST /verify - Verify payment
- GET / - Get all payments (filtered by role)
- GET /:id - Get payment details
- POST /webhook - Razorpay webhook handler

### Review Routes (/reviews)
- GET / - Get reviews (filtered)
- POST / - Create review (authenticated)
- GET /:id - Get review details
- DELETE /:id - Delete review (authenticated)

### Trip Routes (/trips)
- GET / - Get user trips
- POST / - Create trip (authenticated)
- GET /:id - Get trip details
- PATCH /:id - Update trip
- DELETE /:id - Delete trip

### Travel Mode Routes (/travelModes)
- GET /flights - Get flight options
- GET /trains - Get train options
- GET /buses - Get bus options
- GET /options - Get all travel mode options

### AI Routes (/ai)
- POST /tripCost - Estimate trip cost
- POST /nearbyHotels - Find nearby hotels
- POST /recommend - Get hotel recommendations

## Database Models

### User Model
- Personal information and contact
- Role assignment (user/staff/admin)
- Authentication credentials
- Profile picture reference
- Timestamps

### Hotel Model
- Hotel details and amenities
- Location coordinates
- Room count and availability
- Average rating calculation
- Image references
- Staff assignment

### Room Model
- Room type categorization
- Capacity and pricing
- Amenities list
- Hotel reference
- Availability status
- Image references

### Booking Model
- Guest details
- Room and hotel reference
- Check-in and check-out dates
- Guest count
- Special requests
- Booking status tracking
- Payment reference

### Payment Model
- Razorpay order and transaction IDs
- Amount and currency
- Payment status
- User and booking reference
- Timestamps

### Review Model
- Guest rating and comments
- Hotel and user reference
- Timestamps

### Trip Model
- Trip details and notes
- Route polyline data
- Travel mode selection
- Cost estimation
- Status tracking

## API Response Format

All API responses follow a consistent format:

Success Response:
`
{
  \"status\": \"success\",
  \"data\": { ... }
}
`

Error Response:
`
{
  \"status\": \"error\",
  \"message\": \"Error description\",
  \"statusCode\": 400
}
`

## Authentication

### Token Generation
- JWT issued on successful login
- Token contains user ID and role
- Valid for 7 days (configurable)

### Protected Endpoints
- Require Authorization header with Bearer token
- Token validation on each request
- Automatic token expiration handling

### Role-Based Access
- User: Can access own data and bookings
- Staff: Can manage assigned hotel
- Admin: Can access all resources

## Payment Webhook

### Razorpay Integration
- Webhook URL: /payments/webhook
- Handles payment.authorized event
- Confirms payment and updates booking status
- Sends confirmation email

### Webhook Validation
- Signature verification using secret key
- Prevents unauthorized webhook calls
- Automatic retry on failures

## Error Handling

### Error Types
- Authentication errors (401)
- Authorization errors (403)
- Validation errors (400)
- Not found errors (404)
- Server errors (500)

### Error Messages
- Clear, descriptive error messages
- Error codes for client handling
- Structured error responses

## Security Features

### Middleware Protection
- CORS for cross-origin requests
- Helmet for HTTP headers
- Rate limiting for endpoint protection
- Input sanitization and validation
- MongoDB injection prevention
- XSS attack prevention
- HTTP parameter pollution prevention

### Data Protection
- Password hashing with bcryptjs
- JWT token-based authentication
- Secure HTTPS communication
- Database connection encryption

### Authorization
- Role-based access control
- User-specific data isolation
- Admin-only operations

## Testing

### Test Setup
- Jest configuration for unit and integration tests
- Test files in tests/ directory

### Running Tests
`
npm test
`

## Project Structure

`
├── app.js - Express application setup
├── server.js - Server startup
├── controller/ - Route handlers (13 files)
├── models/ - Database schemas (7 files)
├── router/ - API routes (8 files)
├── util/ - Utility modules (6 files)
├── views/ - Email templates
├── dev-data/ - Sample data for development
├── tests/ - Test files
├── public/ - Static data files
└── package.json - Dependencies and scripts
`

## Deployment

### Production Readiness
- Environment variables configured
- Database backups enabled
- Error logging configured
- CORS properly restricted
- Rate limiting enabled

### Deploy Steps
1. Configure .env with production values
2. Run database migrations
3. Start server with npm start
4. Monitor logs and metrics
5. Set up automated backups
