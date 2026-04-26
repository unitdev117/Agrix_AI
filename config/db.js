const mongoose = require('mongoose');
require('dotenv').config();
const logger = require('../services/loggerService');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        logger.success('MongoDB Connected Successfully to Telegram DB');
    } catch (err) {
        logger.error('MongoDB Connection Error', { error: err });
        // Exit process with failure
        process.exit(1);
    }
};

module.exports = connectDB;