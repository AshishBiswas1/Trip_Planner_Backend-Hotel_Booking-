const mongoose = require('mongoose');
const dotenv = require('dotenv');

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception! Shutting down...', err);
  process.exit(1);
});

dotenv.config();

if (!process.env.MONGODBURL || !process.env.PASSWORD) {
  console.error('Database URL or password not present');
  process.exit(1);
}

const url = process.env.MONGODBURL.replace('<PASSWORD>', process.env.PASSWORD);

mongoose
  .connect(url)
  .then(() => {
    console.log('Database connected successfully');
  })
  .catch((error) => {
    console.error('Database connection failed:', error.message);
    process.exit(1);
  });
const app = require('./app');

const port = process.env.PORT;
const server = app.listen(port, () =>
  console.log(`Server connected to port: ${port}`)
);

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection! Shutting down...', err);
  if (server) {
    server.close(() => {
      mongoose.connection.close(() => {
        process.exit(1);
      });
    });
  } else {
    process.exit(1);
  }
});
