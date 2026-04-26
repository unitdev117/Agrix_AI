const { getWebConnection } = require('../config/webDb');
const createWebModels = require('../models/web');

let models;

const getWebModels = () => {
    if (!models) {
        models = createWebModels(getWebConnection());
    }

    return models;
};

module.exports = {
    getWebModels,
};
