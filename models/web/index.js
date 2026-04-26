const buildWebUserModel = require('./WebUser');
const buildWebSessionModel = require('./WebSession');
const buildWebMessageModel = require('./WebMessage');
const buildWebEventModel = require('./WebEvent');
const buildHumanHandoffModel = require('./HumanHandoff');

const createWebModels = (connection) => ({
    WebUser: buildWebUserModel(connection),
    WebSession: buildWebSessionModel(connection),
    WebMessage: buildWebMessageModel(connection),
    WebEvent: buildWebEventModel(connection),
    HumanHandoff: buildHumanHandoffModel(connection),
});

module.exports = createWebModels;
