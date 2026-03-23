const mongoose = require('mongoose');
const dotenv = require('dotenv');

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

const port = process.env.PORT
const server = app.listen(port, () => console.log(`Server connected to port: ${port}`))