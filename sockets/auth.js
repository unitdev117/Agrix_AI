const jwt = require('jsonwebtoken');
const logger = require('../services/loggerService');

const parseOriginFromHandshake = (socket) => socket.handshake.headers.origin || 'unknown';

const createWidgetAuthMiddleware = () => (socket, next) => {
    const requiredSiteKey = process.env.WIDGET_SITE_KEY;
    const providedSiteKey = socket.handshake.auth?.siteKey || socket.handshake.query?.siteKey;
    const origin = parseOriginFromHandshake(socket);

    if (!requiredSiteKey) {
        logger.warn('widget_auth_not_enforced_missing_widget_site_key', { origin });
        socket.authContext = {
            type: 'widget',
            siteKey: null,
            origin,
        };
        next();
        return;
    }

    if (providedSiteKey !== requiredSiteKey) {
        next(new Error('Unauthorized widget client'));
        return;
    }

    socket.authContext = {
        type: 'widget',
        siteKey: providedSiteKey,
        origin,
    };
    next();
};

const createAgentAuthMiddleware = () => (socket, next) => {
    const token = socket.handshake.auth?.token;
    const jwtSecret = process.env.AGENT_JWT_SECRET;

    if (!jwtSecret) {
        logger.warn('agent_auth_not_enforced_missing_agent_jwt_secret');
        socket.authContext = {
            type: 'agent',
            userId: socket.handshake.auth?.agentId || `dev-agent-${socket.id}`,
            role: 'admin',
            origin: parseOriginFromHandshake(socket),
        };
        next();
        return;
    }

    if (!token) {
        next(new Error('Missing agent token'));
        return;
    }

    try {
        const payload = jwt.verify(token, jwtSecret);
        const role = payload.role;

        if (!['agent', 'admin'].includes(role)) {
            next(new Error('Insufficient role for agent namespace'));
            return;
        }

        socket.authContext = {
            type: 'agent',
            userId: payload.sub || payload.userId,
            role,
            origin: parseOriginFromHandshake(socket),
        };

        next();
    } catch (error) {
        next(new Error('Invalid agent token'));
    }
};

module.exports = {
    createWidgetAuthMiddleware,
    createAgentAuthMiddleware,
};
