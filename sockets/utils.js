const { getValidNextStates } = require('./stateMachine');
const metrics = require('../services/metricsService');

const ackOk = (ack, data = {}) => {
    if (typeof ack === 'function') {
        ack({ ok: true, ...data });
    }
};

const ackError = (ack, code, message, details = {}) => {
    if (typeof ack === 'function') {
        ack({ ok: false, error: { code, message, ...details } });
    }
};

const emitStandardError = (socket, { code, message, currentState = null }) => {
    metrics.recordSocketError();

    const payload = {
        code,
        message,
        currentState,
        validNextStates: currentState ? getValidNextStates(currentState) : [],
        timestamp: new Date().toISOString(),
    };

    socket.emit('error:event', payload);
    return payload;
};

const sessionRoom = (sessionId) => `session:${sessionId}`;

module.exports = {
    ackOk,
    ackError,
    emitStandardError,
    sessionRoom,
};
