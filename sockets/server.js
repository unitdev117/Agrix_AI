const { randomUUID } = require('crypto');
const { Server } = require('socket.io');
const logger = require('../services/loggerService');
const metrics = require('../services/metricsService');
const aiService = require('../services/aiService');
const {
    touchWebUser,
    updateWebUserProfileBySession,
    getWebUserProfileBySession,
    findOrCreateSession,
    getSessionById,
    transitionSessionState,
    appendOnboardingAnswer,
    updateSessionRouteChoice,
    setAssignedAgent,
    saveMessage,
    saveEventIfNew,
    createHumanHandoff,
    getPendingQueue,
    acceptHandoff,
    markFirstAgentResponse,
    resolveHandoff,
    findActiveHandoffBySession,
} = require('../services/webChatService');
const { createWidgetAuthMiddleware, createAgentAuthMiddleware } = require('./auth');
const { validateEventPayload } = require('./validation');
const { isRateLimited } = require('./rateLimit');
const { ackOk, ackError, emitStandardError, sessionRoom } = require('./utils');
const { SESSION_STATES, ONBOARDING_QUESTIONS, CONTACT_INFO } = require('./constants');
const { getValidNextStates } = require('./stateMachine');

const getCorsOrigins = () => {
    const raw = process.env.SOCKET_CORS_ALLOWLIST || '';
    return raw
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
};

const shouldAllowOrigin = (allowedOrigins, origin) => {
    if (!origin) {
        return true;
    }

    if (allowedOrigins.length === 0) {
        return true;
    }

    return allowedOrigins.includes(origin);
};

const onboardingProgress = (session) => {
    const answeredQuestionIds = new Set(session.onboarding_answers.map((item) => item.question_id));
    const nextQuestion = ONBOARDING_QUESTIONS.find((question) => !answeredQuestionIds.has(question.id));

    return {
        total: ONBOARDING_QUESTIONS.length,
        answered: answeredQuestionIds.size,
        nextQuestion,
    };
};

const buildSessionStatePayload = (session) => {
    const progress = onboardingProgress(session);

    return {
        sessionId: session.session_id,
        state: session.state,
        validNextStates: getValidNextStates(session.state),
        onboarding: {
            total: progress.total,
            answered: progress.answered,
            nextQuestion: progress.nextQuestion || null,
        },
        routeChoice: session.route_choice,
        assignedAgentId: session.assigned_agent_id,
        active: session.active,
        updatedAt: session.updatedAt,
    };
};

const buildQueueUpdatePayload = (queueItems) => ({
    queueLength: queueItems.length,
    items: queueItems.map((item) => ({
        handoffId: item.handoff_id,
        sessionId: item.session_id,
        createdAt: item.createdAt,
        status: item.status,
    })),
    timestamp: new Date().toISOString(),
});

const createSocketServer = (httpServer) => {
    const allowedOrigins = getCorsOrigins();
    const startEventCache = new Map();

    const io = new Server(httpServer, {
        cors: {
            origin(origin, callback) {
                if (shouldAllowOrigin(allowedOrigins, origin)) {
                    callback(null, true);
                    return;
                }

                callback(new Error('Socket origin not allowed by CORS policy'));
            },
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });

    const widgetNamespace = io.of('/widget');
    const agentNamespace = io.of('/agent');

    setInterval(() => {
        const now = Date.now();
        for (const [key, value] of startEventCache.entries()) {
            if (now - value.timestamp > 5 * 60 * 1000) {
                startEventCache.delete(key);
            }
        }
    }, 60000).unref();

    const broadcastQueueUpdate = async () => {
        const queueItems = await getPendingQueue();
        metrics.setGauge('queueLength', queueItems.length);
        const payload = buildQueueUpdatePayload(queueItems);
        agentNamespace.emit('queue:update', payload);
        widgetNamespace.emit('queue:update', {
            queueLength: payload.queueLength,
            timestamp: payload.timestamp,
        });
    };

    const enforcePayloadAndRateLimit = ({ socket, eventName, payload, ack, sessionId }) => {
        const validation = validateEventPayload(eventName, payload);

        if (!validation.valid) {
            const errorPayload = emitStandardError(socket, {
                code: 'INVALID_PAYLOAD',
                message: validation.errors.join('; '),
            });
            ackError(ack, 'INVALID_PAYLOAD', errorPayload.message, {
                details: validation.errors,
            });
            return false;
        }

        const rateKey = [
            eventName,
            socket.handshake.address || 'unknown-ip',
            sessionId || payload.sessionId || socket.id,
        ].join(':');

        if (isRateLimited({ key: rateKey })) {
            const errorPayload = emitStandardError(socket, {
                code: 'RATE_LIMITED',
                message: 'Rate limit exceeded. Please retry shortly.',
            });
            ackError(ack, 'RATE_LIMITED', errorPayload.message);
            return false;
        }

        return true;
    };

    const guardEventIdempotency = async ({ socket, ack, source, eventName, sessionId, messageId, payload }) => {
        const idempotencyResult = await saveEventIfNew({
            eventType: eventName,
            source,
            sessionId,
            messageId,
            payload,
        });

        if (idempotencyResult.duplicate) {
            ackOk(ack, {
                duplicate: true,
                sessionId,
            });
            return false;
        }

        return true;
    };

    const streamAiResponse = async ({ sessionId, prompt, sourceMessageId }) => {
        const aiText = await aiService.generateResponse({
            prompt,
            language: 'English',
            context: {
                channel: 'web',
                sessionId,
                sourceMessageId,
            },
        });

        const aiMessageId = randomUUID();
        const chunks = aiText.match(/(.|[\r\n]){1,120}/g) || [aiText];

        chunks.forEach((chunk, index) => {
            widgetNamespace.to(sessionRoom(sessionId)).emit('chat:message', {
                sessionId,
                messageId: aiMessageId,
                senderType: 'ai',
                text: chunk,
                isPartial: index < chunks.length - 1,
                timestamp: new Date().toISOString(),
            });
        });

        await saveMessage({
            messageId: aiMessageId,
            sessionId,
            senderType: 'ai',
            senderId: 'ai',
            content: aiText,
            metadata: {
                streamedChunks: chunks.length,
            },
        });
    };

    widgetNamespace.use(createWidgetAuthMiddleware());
    agentNamespace.use(createAgentAuthMiddleware());

    widgetNamespace.on('connection', (socket) => {
        metrics.increment('activeWidgetSockets');
        logger.info('widget_socket_connected', {
            socketId: socket.id,
            origin: socket.authContext?.origin || null,
        });

        socket.on('session:start', async (payload = {}, ack) => {
            try {
                if (!enforcePayloadAndRateLimit({ socket, eventName: 'session:start', payload, ack })) {
                    return;
                }

                const userId = payload.userId || socket.id;
                const startCacheKey = `${userId}:${payload.messageId}`;
                const cachedStartResult = startEventCache.get(startCacheKey);

                if (cachedStartResult) {
                    ackOk(ack, {
                        ok: true,
                        duplicate: true,
                        resumed: true,
                        sessionId: cachedStartResult.sessionId,
                        state: cachedStartResult.state,
                    });
                    return;
                }

                await touchWebUser({
                    userId,
                    displayName: payload.displayName || 'Widget User',
                    role: 'widget_user',
                    metadata: {
                        userAgent: socket.handshake.headers['user-agent'] || 'unknown',
                    },
                });

                const { session, resumed } = await findOrCreateSession({
                    requestedSessionId: payload.sessionId,
                    userId,
                });

                socket.join(sessionRoom(session.session_id));

                const shouldContinue = await guardEventIdempotency({
                    socket,
                    ack,
                    source: 'widget',
                    eventName: 'session:start',
                    sessionId: session.session_id,
                    messageId: payload.messageId,
                    payload,
                });

                if (!shouldContinue) {
                    return;
                }

                if (session.state === SESSION_STATES.NEW || session.state === SESSION_STATES.ONBOARDING) {
                    const transition = await transitionSessionState(session, SESSION_STATES.ROUTE_CHOICE);
                    if (transition.ok) {
                        widgetNamespace.to(sessionRoom(session.session_id)).emit('session:state', buildSessionStatePayload(transition.session));
                        ackOk(ack, {
                            duplicate: false,
                            resumed,
                            sessionId: transition.session.session_id,
                            state: transition.session.state,
                        });
                        startEventCache.set(startCacheKey, {
                            sessionId: transition.session.session_id,
                            state: transition.session.state,
                            timestamp: Date.now(),
                        });
                        return;
                    }
                }

                widgetNamespace.to(sessionRoom(session.session_id)).emit('session:state', buildSessionStatePayload(session));
                ackOk(ack, {
                    duplicate: false,
                    resumed,
                    sessionId: session.session_id,
                    state: session.state,
                });
                startEventCache.set(startCacheKey, {
                    sessionId: session.session_id,
                    state: session.state,
                    timestamp: Date.now(),
                });
            } catch (error) {
                logger.error('session_start_error', { error, socketId: socket.id });
                const eventError = emitStandardError(socket, {
                    code: 'SESSION_START_FAILED',
                    message: 'Unable to start session',
                });
                ackError(ack, eventError.code, eventError.message);
            }
        });

        socket.on('onboarding:answer', async (payload = {}, ack) => {
            try {
                if (!enforcePayloadAndRateLimit({
                    socket,
                    eventName: 'onboarding:answer',
                    payload,
                    ack,
                    sessionId: payload.sessionId,
                })) {
                    return;
                }

                const session = await getSessionById(payload.sessionId);
                if (!session) {
                    const eventError = emitStandardError(socket, {
                        code: 'SESSION_NOT_FOUND',
                        message: 'Session not found',
                    });
                    ackError(ack, eventError.code, eventError.message);
                    return;
                }

                const shouldContinue = await guardEventIdempotency({
                    socket,
                    ack,
                    source: 'widget',
                    eventName: 'onboarding:answer',
                    sessionId: session.session_id,
                    messageId: payload.messageId,
                    payload,
                });

                if (!shouldContinue) {
                    return;
                }

                if (session.state !== SESSION_STATES.ONBOARDING) {
                    const eventError = emitStandardError(socket, {
                        code: 'INVALID_STATE_TRANSITION',
                        message: 'onboarding:answer is only valid while session is onboarding',
                        currentState: session.state,
                    });
                    ackError(ack, eventError.code, eventError.message, {
                        currentState: eventError.currentState,
                        validNextStates: eventError.validNextStates,
                    });
                    return;
                }

                await appendOnboardingAnswer(session, payload.questionId, payload.answer);

                const progress = onboardingProgress(session);
                if (!progress.nextQuestion) {
                    const transition = await transitionSessionState(session, SESSION_STATES.ROUTE_CHOICE);

                    if (!transition.ok) {
                        const eventError = emitStandardError(socket, {
                            code: transition.code,
                            message: 'Unable to move session to route choice',
                            currentState: transition.currentState,
                        });
                        ackError(ack, eventError.code, eventError.message, {
                            currentState: eventError.currentState,
                            validNextStates: eventError.validNextStates,
                        });
                        return;
                    }

                    widgetNamespace.to(sessionRoom(session.session_id)).emit('session:state', buildSessionStatePayload(transition.session));
                    ackOk(ack, {
                        duplicate: false,
                        sessionId: session.session_id,
                        state: transition.session.state,
                    });
                    return;
                }

                widgetNamespace.to(sessionRoom(session.session_id)).emit('session:state', buildSessionStatePayload(session));
                ackOk(ack, {
                    duplicate: false,
                    sessionId: session.session_id,
                    state: session.state,
                });
            } catch (error) {
                logger.error('onboarding_answer_error', { error, socketId: socket.id });
                const eventError = emitStandardError(socket, {
                    code: 'ONBOARDING_ANSWER_FAILED',
                    message: 'Unable to process onboarding answer',
                });
                ackError(ack, eventError.code, eventError.message);
            }
        });

        socket.on('route:choose', async (payload = {}, ack) => {
            try {
                if (!enforcePayloadAndRateLimit({
                    socket,
                    eventName: 'route:choose',
                    payload,
                    ack,
                    sessionId: payload.sessionId,
                })) {
                    return;
                }

                const session = await getSessionById(payload.sessionId);
                if (!session) {
                    const eventError = emitStandardError(socket, {
                        code: 'SESSION_NOT_FOUND',
                        message: 'Session not found',
                    });
                    ackError(ack, eventError.code, eventError.message);
                    return;
                }

                const shouldContinue = await guardEventIdempotency({
                    socket,
                    ack,
                    source: 'widget',
                    eventName: 'route:choose',
                    sessionId: session.session_id,
                    messageId: payload.messageId,
                    payload,
                });

                if (!shouldContinue) {
                    return;
                }

                if (session.state !== SESSION_STATES.ROUTE_CHOICE) {
                    const eventError = emitStandardError(socket, {
                        code: 'INVALID_STATE_TRANSITION',
                        message: 'route:choose is only valid while session is in route_choice',
                        currentState: session.state,
                    });
                    ackError(ack, eventError.code, eventError.message, {
                        currentState: eventError.currentState,
                        validNextStates: eventError.validNextStates,
                    });
                    return;
                }

                if (payload.route === 'ai') {
                    const profile = await getWebUserProfileBySession({ sessionId: session.session_id });

                    if (!profile || !profile.displayName || !profile.phoneNumber) {
                        const eventError = emitStandardError(socket, {
                            code: 'PROFILE_REQUIRED',
                            message: 'Please submit your full name and phone number before starting AI chat.',
                            currentState: session.state,
                        });
                        ackError(ack, eventError.code, eventError.message, {
                            currentState: eventError.currentState,
                            validNextStates: eventError.validNextStates,
                        });
                        return;
                    }
                }

                const routeState = payload.route === 'human' ? SESSION_STATES.HUMAN_HANDOFF : SESSION_STATES.AI_CHAT;

                await updateSessionRouteChoice(session, payload.route);

                const transition = await transitionSessionState(session, routeState);
                if (!transition.ok) {
                    const eventError = emitStandardError(socket, {
                        code: transition.code,
                        message: 'Unable to apply route choice',
                        currentState: transition.currentState,
                    });
                    ackError(ack, eventError.code, eventError.message, {
                        currentState: eventError.currentState,
                        validNextStates: eventError.validNextStates,
                    });
                    return;
                }

                if (routeState === SESSION_STATES.HUMAN_HANDOFF) {
                    const handoff = await createHumanHandoff({ sessionId: session.session_id });

                    widgetNamespace.to(sessionRoom(session.session_id)).emit('handoff:status', {
                        sessionId: session.session_id,
                        handoffId: handoff.handoff_id,
                        status: handoff.status,
                        phone: CONTACT_INFO.phone,
                        whatsapp: CONTACT_INFO.whatsapp,
                        assignedAgentId: handoff.assigned_agent_id,
                        firstResponseMs: handoff.first_response_ms,
                    });

                    await broadcastQueueUpdate();
                }

                widgetNamespace.to(sessionRoom(session.session_id)).emit('session:state', buildSessionStatePayload(transition.session));

                ackOk(ack, {
                    duplicate: false,
                    sessionId: session.session_id,
                    state: transition.session.state,
                });
            } catch (error) {
                logger.error('route_choose_error', { error, socketId: socket.id });
                const eventError = emitStandardError(socket, {
                    code: 'ROUTE_CHOICE_FAILED',
                    message: 'Unable to process route selection',
                });
                ackError(ack, eventError.code, eventError.message);
            }
        });

        socket.on('profile:submit', async (payload = {}, ack) => {
            try {
                if (!enforcePayloadAndRateLimit({
                    socket,
                    eventName: 'profile:submit',
                    payload,
                    ack,
                    sessionId: payload.sessionId,
                })) {
                    return;
                }

                const session = await getSessionById(payload.sessionId);
                if (!session) {
                    const eventError = emitStandardError(socket, {
                        code: 'SESSION_NOT_FOUND',
                        message: 'Session not found',
                    });
                    ackError(ack, eventError.code, eventError.message);
                    return;
                }

                const shouldContinue = await guardEventIdempotency({
                    socket,
                    ack,
                    source: 'widget',
                    eventName: 'profile:submit',
                    sessionId: session.session_id,
                    messageId: payload.messageId,
                    payload,
                });

                if (!shouldContinue) {
                    return;
                }

                if (session.state !== SESSION_STATES.ROUTE_CHOICE) {
                    const eventError = emitStandardError(socket, {
                        code: 'INVALID_STATE_TRANSITION',
                        message: 'profile:submit is only valid while session is in route_choice',
                        currentState: session.state,
                    });
                    ackError(ack, eventError.code, eventError.message, {
                        currentState: eventError.currentState,
                        validNextStates: eventError.validNextStates,
                    });
                    return;
                }

                await updateWebUserProfileBySession({
                    sessionId: session.session_id,
                    fullName: payload.fullName.trim(),
                    phoneNumber: payload.phoneNumber.trim(),
                });

                await appendOnboardingAnswer(session, 'name', payload.fullName.trim());
                await appendOnboardingAnswer(session, 'phone', payload.phoneNumber.trim());

                ackOk(ack, {
                    duplicate: false,
                    sessionId: session.session_id,
                });
            } catch (error) {
                logger.error('profile_submit_error', { error, socketId: socket.id });
                const eventError = emitStandardError(socket, {
                    code: 'PROFILE_SUBMIT_FAILED',
                    message: 'Unable to save profile details',
                });
                ackError(ack, eventError.code, eventError.message);
            }
        });

        socket.on('personnel:request', async (payload = {}, ack) => {
            try {
                if (!enforcePayloadAndRateLimit({
                    socket,
                    eventName: 'personnel:request',
                    payload,
                    ack,
                    sessionId: payload.sessionId,
                })) {
                    return;
                }

                const session = await getSessionById(payload.sessionId);
                if (!session) {
                    const eventError = emitStandardError(socket, {
                        code: 'SESSION_NOT_FOUND',
                        message: 'Session not found',
                    });
                    ackError(ack, eventError.code, eventError.message);
                    return;
                }

                const shouldContinue = await guardEventIdempotency({
                    socket,
                    ack,
                    source: 'widget',
                    eventName: 'personnel:request',
                    sessionId: session.session_id,
                    messageId: payload.messageId,
                    payload,
                });

                if (!shouldContinue) {
                    return;
                }

                if (session.state !== SESSION_STATES.ROUTE_CHOICE) {
                    const eventError = emitStandardError(socket, {
                        code: 'INVALID_STATE_TRANSITION',
                        message: 'personnel:request is only valid while session is in route_choice',
                        currentState: session.state,
                    });
                    ackError(ack, eventError.code, eventError.message, {
                        currentState: eventError.currentState,
                        validNextStates: eventError.validNextStates,
                    });
                    return;
                }

                await updateSessionRouteChoice(session, 'human');

                widgetNamespace.to(sessionRoom(session.session_id)).emit('handoff:status', {
                    sessionId: session.session_id,
                    status: 'contact_only',
                    phone: CONTACT_INFO.phone,
                    whatsapp: CONTACT_INFO.whatsapp,
                });

                ackOk(ack, {
                    duplicate: false,
                    sessionId: session.session_id,
                });
            } catch (error) {
                logger.error('personnel_request_error', { error, socketId: socket.id });
                const eventError = emitStandardError(socket, {
                    code: 'PERSONNEL_REQUEST_FAILED',
                    message: 'Unable to process personnel request',
                });
                ackError(ack, eventError.code, eventError.message);
            }
        });

        socket.on('chat:user_message', async (payload = {}, ack) => {
            try {
                if (!enforcePayloadAndRateLimit({
                    socket,
                    eventName: 'chat:user_message',
                    payload,
                    ack,
                    sessionId: payload.sessionId,
                })) {
                    return;
                }

                const session = await getSessionById(payload.sessionId);
                if (!session) {
                    const eventError = emitStandardError(socket, {
                        code: 'SESSION_NOT_FOUND',
                        message: 'Session not found',
                    });
                    ackError(ack, eventError.code, eventError.message);
                    return;
                }

                const shouldContinue = await guardEventIdempotency({
                    socket,
                    ack,
                    source: 'widget',
                    eventName: 'chat:user_message',
                    sessionId: session.session_id,
                    messageId: payload.messageId,
                    payload,
                });

                if (!shouldContinue) {
                    return;
                }

                if (![SESSION_STATES.AI_CHAT, SESSION_STATES.HUMAN_HANDOFF].includes(session.state)) {
                    const eventError = emitStandardError(socket, {
                        code: 'INVALID_STATE_TRANSITION',
                        message: 'chat:user_message is only valid in ai_chat or human_handoff',
                        currentState: session.state,
                    });
                    ackError(ack, eventError.code, eventError.message, {
                        currentState: eventError.currentState,
                        validNextStates: eventError.validNextStates,
                    });
                    return;
                }

                socket.join(sessionRoom(session.session_id));

                await saveMessage({
                    messageId: payload.messageId,
                    sessionId: session.session_id,
                    senderType: 'widget_user',
                    senderId: session.user_id,
                    content: payload.text,
                });

                widgetNamespace.to(sessionRoom(session.session_id)).emit('chat:message', {
                    sessionId: session.session_id,
                    messageId: payload.messageId,
                    senderType: 'widget_user',
                    text: payload.text,
                    timestamp: new Date().toISOString(),
                });

                agentNamespace.to(sessionRoom(session.session_id)).emit('chat:message', {
                    sessionId: session.session_id,
                    messageId: payload.messageId,
                    senderType: 'widget_user',
                    text: payload.text,
                    timestamp: new Date().toISOString(),
                });

                ackOk(ack, {
                    duplicate: false,
                    sessionId: session.session_id,
                });

                if (session.state === SESSION_STATES.AI_CHAT) {
                    await streamAiResponse({
                        sessionId: session.session_id,
                        prompt: payload.text,
                        sourceMessageId: payload.messageId,
                    });
                }
            } catch (error) {
                logger.error('chat_user_message_error', { error, socketId: socket.id });
                const eventError = emitStandardError(socket, {
                    code: 'CHAT_USER_MESSAGE_FAILED',
                    message: 'Unable to process user chat message',
                });
                ackError(ack, eventError.code, eventError.message);
            }
        });

        socket.on('session:close', async (payload = {}, ack) => {
            try {
                if (!enforcePayloadAndRateLimit({
                    socket,
                    eventName: 'session:close',
                    payload,
                    ack,
                    sessionId: payload.sessionId,
                })) {
                    return;
                }

                const session = await getSessionById(payload.sessionId);
                if (!session) {
                    const eventError = emitStandardError(socket, {
                        code: 'SESSION_NOT_FOUND',
                        message: 'Session not found',
                    });
                    ackError(ack, eventError.code, eventError.message);
                    return;
                }

                const shouldContinue = await guardEventIdempotency({
                    socket,
                    ack,
                    source: 'widget',
                    eventName: 'session:close',
                    sessionId: session.session_id,
                    messageId: payload.messageId,
                    payload,
                });

                if (!shouldContinue) {
                    return;
                }

                const transition = await transitionSessionState(session, SESSION_STATES.CLOSED);
                if (!transition.ok) {
                    const eventError = emitStandardError(socket, {
                        code: transition.code,
                        message: 'Unable to close session',
                        currentState: transition.currentState,
                    });
                    ackError(ack, eventError.code, eventError.message, {
                        currentState: eventError.currentState,
                        validNextStates: eventError.validNextStates,
                    });
                    return;
                }

                const activeHandoff = await findActiveHandoffBySession(session.session_id);
                if (activeHandoff) {
                    await resolveHandoff({ handoffId: activeHandoff.handoff_id });
                    widgetNamespace.to(sessionRoom(session.session_id)).emit('handoff:status', {
                        sessionId: session.session_id,
                        handoffId: activeHandoff.handoff_id,
                        status: 'resolved',
                        resolvedAt: new Date().toISOString(),
                    });
                    await broadcastQueueUpdate();
                }

                widgetNamespace.to(sessionRoom(session.session_id)).emit('session:state', buildSessionStatePayload(transition.session));
                agentNamespace.to(sessionRoom(session.session_id)).emit('session:state', buildSessionStatePayload(transition.session));

                ackOk(ack, {
                    duplicate: false,
                    sessionId: session.session_id,
                    state: transition.session.state,
                });
            } catch (error) {
                logger.error('session_close_error', { error, socketId: socket.id });
                const eventError = emitStandardError(socket, {
                    code: 'SESSION_CLOSE_FAILED',
                    message: 'Unable to close session',
                });
                ackError(ack, eventError.code, eventError.message);
            }
        });

        socket.on('disconnect', () => {
            metrics.decrement('activeWidgetSockets');
            logger.info('widget_socket_disconnected', { socketId: socket.id });
        });
    });

    agentNamespace.on('connection', (socket) => {
        metrics.increment('activeAgentSockets');
        logger.info('agent_socket_connected', {
            socketId: socket.id,
            agentId: socket.authContext?.userId || null,
        });

        socket.on('agent:online', async (payload = {}, ack) => {
            try {
                if (!enforcePayloadAndRateLimit({ socket, eventName: 'agent:online', payload, ack })) {
                    return;
                }

                const agentId = socket.authContext?.userId;

                await touchWebUser({
                    userId: agentId,
                    displayName: payload.displayName || agentId,
                    role: socket.authContext?.role || 'agent',
                    metadata: {
                        online: true,
                    },
                });

                const syntheticSessionId = `agent:${agentId}`;
                const shouldContinue = await guardEventIdempotency({
                    socket,
                    ack,
                    source: 'agent',
                    eventName: 'agent:online',
                    sessionId: syntheticSessionId,
                    messageId: payload.messageId,
                    payload,
                });

                if (!shouldContinue) {
                    return;
                }

                socket.join(`agent:${agentId}`);
                await broadcastQueueUpdate();

                ackOk(ack, {
                    duplicate: false,
                    agentId,
                    role: socket.authContext?.role,
                });
            } catch (error) {
                logger.error('agent_online_error', { error, socketId: socket.id });
                const eventError = emitStandardError(socket, {
                    code: 'AGENT_ONLINE_FAILED',
                    message: 'Unable to mark agent online',
                });
                ackError(ack, eventError.code, eventError.message);
            }
        });

        socket.on('handoff:accept', async (payload = {}, ack) => {
            try {
                if (!enforcePayloadAndRateLimit({
                    socket,
                    eventName: 'handoff:accept',
                    payload,
                    ack,
                    sessionId: payload.sessionId,
                })) {
                    return;
                }

                const session = await getSessionById(payload.sessionId);
                if (!session) {
                    const eventError = emitStandardError(socket, {
                        code: 'SESSION_NOT_FOUND',
                        message: 'Session not found',
                    });
                    ackError(ack, eventError.code, eventError.message);
                    return;
                }

                const shouldContinue = await guardEventIdempotency({
                    socket,
                    ack,
                    source: 'agent',
                    eventName: 'handoff:accept',
                    sessionId: session.session_id,
                    messageId: payload.messageId,
                    payload,
                });

                if (!shouldContinue) {
                    return;
                }

                if (session.state !== SESSION_STATES.HUMAN_HANDOFF) {
                    const eventError = emitStandardError(socket, {
                        code: 'INVALID_STATE_TRANSITION',
                        message: 'handoff:accept is only valid in human_handoff state',
                        currentState: session.state,
                    });
                    ackError(ack, eventError.code, eventError.message, {
                        currentState: eventError.currentState,
                        validNextStates: eventError.validNextStates,
                    });
                    return;
                }

                const handoff = await acceptHandoff({
                    handoffId: payload.handoffId,
                    agentId: socket.authContext.userId,
                });

                if (!handoff) {
                    const eventError = emitStandardError(socket, {
                        code: 'HANDOFF_NOT_AVAILABLE',
                        message: 'Handoff is not pending or already assigned',
                        currentState: session.state,
                    });
                    ackError(ack, eventError.code, eventError.message);
                    return;
                }

                await setAssignedAgent(session.session_id, socket.authContext.userId);

                socket.join(sessionRoom(session.session_id));

                const handoffPayload = {
                    sessionId: session.session_id,
                    handoffId: handoff.handoff_id,
                    status: handoff.status,
                    assignedAgentId: handoff.assigned_agent_id,
                    acceptedAt: handoff.accepted_at,
                    phone: CONTACT_INFO.phone,
                    whatsapp: CONTACT_INFO.whatsapp,
                };

                widgetNamespace.to(sessionRoom(session.session_id)).emit('handoff:status', handoffPayload);
                agentNamespace.to(sessionRoom(session.session_id)).emit('handoff:status', handoffPayload);

                await broadcastQueueUpdate();

                ackOk(ack, {
                    duplicate: false,
                    handoffId: handoff.handoff_id,
                    sessionId: session.session_id,
                });
            } catch (error) {
                logger.error('handoff_accept_error', { error, socketId: socket.id });
                const eventError = emitStandardError(socket, {
                    code: 'HANDOFF_ACCEPT_FAILED',
                    message: 'Unable to accept handoff',
                });
                ackError(ack, eventError.code, eventError.message);
            }
        });

        socket.on('chat:agent_message', async (payload = {}, ack) => {
            try {
                if (!enforcePayloadAndRateLimit({
                    socket,
                    eventName: 'chat:agent_message',
                    payload,
                    ack,
                    sessionId: payload.sessionId,
                })) {
                    return;
                }

                const session = await getSessionById(payload.sessionId);
                if (!session) {
                    const eventError = emitStandardError(socket, {
                        code: 'SESSION_NOT_FOUND',
                        message: 'Session not found',
                    });
                    ackError(ack, eventError.code, eventError.message);
                    return;
                }

                const shouldContinue = await guardEventIdempotency({
                    socket,
                    ack,
                    source: 'agent',
                    eventName: 'chat:agent_message',
                    sessionId: session.session_id,
                    messageId: payload.messageId,
                    payload,
                });

                if (!shouldContinue) {
                    return;
                }

                if (session.state !== SESSION_STATES.HUMAN_HANDOFF) {
                    const eventError = emitStandardError(socket, {
                        code: 'INVALID_STATE_TRANSITION',
                        message: 'chat:agent_message is only valid in human_handoff state',
                        currentState: session.state,
                    });
                    ackError(ack, eventError.code, eventError.message, {
                        currentState: eventError.currentState,
                        validNextStates: eventError.validNextStates,
                    });
                    return;
                }

                const activeHandoff = await findActiveHandoffBySession(session.session_id);

                if (!activeHandoff) {
                    const eventError = emitStandardError(socket, {
                        code: 'HANDOFF_NOT_FOUND',
                        message: 'No active handoff for this session',
                        currentState: session.state,
                    });
                    ackError(ack, eventError.code, eventError.message);
                    return;
                }

                if (activeHandoff.assigned_agent_id && activeHandoff.assigned_agent_id !== socket.authContext.userId) {
                    const eventError = emitStandardError(socket, {
                        code: 'HANDOFF_AGENT_MISMATCH',
                        message: 'This handoff is assigned to another agent',
                        currentState: session.state,
                    });
                    ackError(ack, eventError.code, eventError.message);
                    return;
                }

                await saveMessage({
                    messageId: payload.messageId,
                    sessionId: session.session_id,
                    senderType: 'agent',
                    senderId: socket.authContext.userId,
                    content: payload.text,
                });

                await markFirstAgentResponse({ handoffId: activeHandoff.handoff_id });

                const messagePayload = {
                    sessionId: session.session_id,
                    messageId: payload.messageId,
                    senderType: 'agent',
                    senderId: socket.authContext.userId,
                    text: payload.text,
                    timestamp: new Date().toISOString(),
                };

                widgetNamespace.to(sessionRoom(session.session_id)).emit('chat:message', messagePayload);
                agentNamespace.to(sessionRoom(session.session_id)).emit('chat:message', messagePayload);

                ackOk(ack, {
                    duplicate: false,
                    sessionId: session.session_id,
                });
            } catch (error) {
                logger.error('chat_agent_message_error', { error, socketId: socket.id });
                const eventError = emitStandardError(socket, {
                    code: 'CHAT_AGENT_MESSAGE_FAILED',
                    message: 'Unable to process agent message',
                });
                ackError(ack, eventError.code, eventError.message);
            }
        });

        socket.on('handoff:resolve', async (payload = {}, ack) => {
            try {
                if (!enforcePayloadAndRateLimit({
                    socket,
                    eventName: 'handoff:resolve',
                    payload,
                    ack,
                    sessionId: payload.sessionId,
                })) {
                    return;
                }

                const session = await getSessionById(payload.sessionId);
                if (!session) {
                    const eventError = emitStandardError(socket, {
                        code: 'SESSION_NOT_FOUND',
                        message: 'Session not found',
                    });
                    ackError(ack, eventError.code, eventError.message);
                    return;
                }

                const shouldContinue = await guardEventIdempotency({
                    socket,
                    ack,
                    source: 'agent',
                    eventName: 'handoff:resolve',
                    sessionId: session.session_id,
                    messageId: payload.messageId,
                    payload,
                });

                if (!shouldContinue) {
                    return;
                }

                if (session.state !== SESSION_STATES.HUMAN_HANDOFF) {
                    const eventError = emitStandardError(socket, {
                        code: 'INVALID_STATE_TRANSITION',
                        message: 'handoff:resolve is only valid in human_handoff state',
                        currentState: session.state,
                    });
                    ackError(ack, eventError.code, eventError.message, {
                        currentState: eventError.currentState,
                        validNextStates: eventError.validNextStates,
                    });
                    return;
                }

                const resolvedHandoff = await resolveHandoff({ handoffId: payload.handoffId });

                if (!resolvedHandoff) {
                    const eventError = emitStandardError(socket, {
                        code: 'HANDOFF_RESOLVE_FAILED',
                        message: 'Unable to resolve handoff',
                    });
                    ackError(ack, eventError.code, eventError.message);
                    return;
                }

                const transition = await transitionSessionState(session, SESSION_STATES.CLOSED);
                if (!transition.ok) {
                    const eventError = emitStandardError(socket, {
                        code: transition.code,
                        message: 'Unable to close session after handoff resolution',
                        currentState: transition.currentState,
                    });
                    ackError(ack, eventError.code, eventError.message, {
                        currentState: eventError.currentState,
                        validNextStates: eventError.validNextStates,
                    });
                    return;
                }

                const handoffPayload = {
                    sessionId: session.session_id,
                    handoffId: resolvedHandoff.handoff_id,
                    status: resolvedHandoff.status,
                    resolvedAt: resolvedHandoff.resolved_at,
                    firstResponseMs: resolvedHandoff.first_response_ms,
                };

                widgetNamespace.to(sessionRoom(session.session_id)).emit('handoff:status', handoffPayload);
                agentNamespace.to(sessionRoom(session.session_id)).emit('handoff:status', handoffPayload);
                widgetNamespace.to(sessionRoom(session.session_id)).emit('session:state', buildSessionStatePayload(transition.session));
                agentNamespace.to(sessionRoom(session.session_id)).emit('session:state', buildSessionStatePayload(transition.session));

                await broadcastQueueUpdate();

                ackOk(ack, {
                    duplicate: false,
                    sessionId: session.session_id,
                    handoffId: resolvedHandoff.handoff_id,
                    state: transition.session.state,
                });
            } catch (error) {
                logger.error('handoff_resolve_error', { error, socketId: socket.id });
                const eventError = emitStandardError(socket, {
                    code: 'HANDOFF_RESOLVE_FAILED',
                    message: 'Unable to resolve handoff',
                });
                ackError(ack, eventError.code, eventError.message);
            }
        });

        socket.on('disconnect', () => {
            metrics.decrement('activeAgentSockets');
            logger.info('agent_socket_disconnected', {
                socketId: socket.id,
                agentId: socket.authContext?.userId || null,
            });
        });
    });

    io.engine.on('connection_error', (error) => {
        logger.error('socket_connection_error', { error });
    });

    logger.info('socket_server_initialized', {
        namespaces: ['/widget', '/agent'],
        corsAllowlist: allowedOrigins,
    });

    return io;
};

module.exports = {
    createSocketServer,
};
