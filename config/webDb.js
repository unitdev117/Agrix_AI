const mongoose = require('mongoose');
const logger = require('../services/loggerService');

let webConnection;

const getWebDbUri = () => {
    if (process.env.MONGO_WEB_URI) {
        return process.env.MONGO_WEB_URI;
    }

    if (process.env.MONGO_URI) {
        return process.env.MONGO_URI;
    }

    throw new Error('MONGO_WEB_URI or MONGO_URI must be configured.');
};

const connectWebDB = async () => {
    if (webConnection && webConnection.readyState === 1) {
        return webConnection;
    }

    const uri = getWebDbUri();

    webConnection = await mongoose.createConnection(uri, {
        dbName: process.env.MONGO_WEB_DB_NAME || 'agrix_web',
    }).asPromise();

    webConnection.on('error', (error) => {
        logger.error('web_db_connection_error', { error });
    });

    logger.info('web_db_connected', {
        dbName: webConnection.name,
    });

    return webConnection;
};

const getWebConnection = () => {
    if (!webConnection) {
        throw new Error('Web DB connection has not been initialized.');
    }

    return webConnection;
};

module.exports = {
    connectWebDB,
    getWebConnection,
};
