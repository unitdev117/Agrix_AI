const { randomUUID } = require('crypto');
const { getWebModels } = require('./webModelService');
const { canTransition, getValidNextStates } = require('../sockets/stateMachine');
const { SESSION_STATES } = require('../sockets/constants');

const touchWebUser = async ({ userId, displayName, role = 'widget_user', metadata = {} }) => {
    const { WebUser } = getWebModels();

    return WebUser.findOneAndUpdate(
        { user_id: userId },
        {
            user_id: userId,
            display_name: displayName || userId,
            role,
            active: true,
            last_seen_at: new Date(),
            metadata,
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        }
    );
};

const updateWebUserProfileBySession = async ({ sessionId, fullName, phoneNumber }) => {
    const { WebSession, WebUser } = getWebModels();

    const session = await WebSession.findOne({ session_id: sessionId });
    if (!session) {
        return null;
    }

    await WebUser.findOneAndUpdate(
        { user_id: session.user_id },
        {
            $set: {
                display_name: fullName,
                phone_number: phoneNumber,
                last_seen_at: new Date(),
                'metadata.full_name': fullName,
                'metadata.phone_number': phoneNumber,
            },
        },
        {
            new: true,
        }
    );

    return session;
};

const getWebUserProfileBySession = async ({ sessionId }) => {
    const { WebSession, WebUser } = getWebModels();

    const session = await WebSession.findOne({ session_id: sessionId }).lean();
    if (!session) {
        return null;
    }

    const user = await WebUser.findOne({ user_id: session.user_id }).lean();
    if (!user) {
        return null;
    }

    return {
        displayName: user.display_name || user.metadata?.full_name || '',
        phoneNumber: user.phone_number || user.metadata?.phone_number || '',
    };
};

const createSession = async ({ userId }) => {
    const { WebSession } = getWebModels();
    const sessionId = randomUUID();

    return WebSession.create({
        session_id: sessionId,
        user_id: userId,
        state: SESSION_STATES.NEW,
        active: true,
        last_seen_at: new Date(),
    });
};

const getSessionById = async (sessionId) => {
    const { WebSession } = getWebModels();
    return WebSession.findOne({ session_id: sessionId });
};

const findOrCreateSession = async ({ requestedSessionId, userId }) => {
    let session = null;

    if (requestedSessionId) {
        session = await getSessionById(requestedSessionId);
        if (session) {
            session.last_seen_at = new Date();
            session.active = session.state !== SESSION_STATES.CLOSED;
            await session.save();
            return { session, resumed: true };
        }
    }

    session = await createSession({ userId });
    return { session, resumed: false };
};

const transitionSessionState = async (session, nextState) => {
    if (!session) {
        return {
            ok: false,
            code: 'SESSION_NOT_FOUND',
            currentState: null,
            validNextStates: [],
        };
    }

    if (session.state === nextState) {
        session.last_seen_at = new Date();
        await session.save();
        return {
            ok: true,
            session,
        };
    }

    if (!canTransition(session.state, nextState)) {
        return {
            ok: false,
            code: 'INVALID_STATE_TRANSITION',
            currentState: session.state,
            validNextStates: getValidNextStates(session.state),
        };
    }

    session.state = nextState;
    session.last_seen_at = new Date();

    if (nextState === SESSION_STATES.CLOSED) {
        session.active = false;
        session.closed_at = new Date();
    }

    await session.save();

    return {
        ok: true,
        session,
    };
};

const appendOnboardingAnswer = async (session, questionId, answer) => {
    session.onboarding_answers.push({
        question_id: questionId,
        answer,
        timestamp: new Date(),
    });
    session.last_seen_at = new Date();
    await session.save();
    return session;
};

const updateSessionRouteChoice = async (session, routeChoice) => {
    session.route_choice = routeChoice;
    session.last_seen_at = new Date();
    await session.save();
    return session;
};

const setAssignedAgent = async (sessionId, agentId) => {
    const { WebSession } = getWebModels();
    return WebSession.findOneAndUpdate(
        { session_id: sessionId },
        {
            assigned_agent_id: agentId,
            last_seen_at: new Date(),
        },
        { new: true }
    );
};

const saveMessage = async ({ messageId, sessionId, senderType, senderId, content, metadata = {} }) => {
    const { WebMessage } = getWebModels();

    try {
        return await WebMessage.create({
            message_id: messageId,
            session_id: sessionId,
            sender_type: senderType,
            sender_id: senderId || null,
            content,
            timestamp: new Date(),
            metadata,
        });
    } catch (error) {
        if (error && error.code === 11000) {
            return WebMessage.findOne({ session_id: sessionId, message_id: messageId });
        }

        throw error;
    }
};

const saveEventIfNew = async ({ eventType, source, sessionId, messageId, payload }) => {
    const { WebEvent } = getWebModels();

    try {
        await WebEvent.create({
            event_id: randomUUID(),
            event_type: eventType,
            source,
            session_id: sessionId,
            message_id: messageId,
            timestamp: new Date(),
            payload,
        });

        return { duplicate: false };
    } catch (error) {
        if (error && error.code === 11000) {
            return { duplicate: true };
        }

        throw error;
    }
};

const createHumanHandoff = async ({ sessionId, metadata = {} }) => {
    const { HumanHandoff } = getWebModels();
    const existing = await HumanHandoff.findOne({ session_id: sessionId, active: true, status: { $in: ['pending', 'accepted'] } });

    if (existing) {
        return existing;
    }

    return HumanHandoff.create({
        handoff_id: randomUUID(),
        session_id: sessionId,
        status: 'pending',
        active: true,
        last_seen_at: new Date(),
        metadata,
    });
};

const getPendingQueue = async () => {
    const { HumanHandoff } = getWebModels();
    return HumanHandoff.find({ status: 'pending', active: true }).sort({ createdAt: 1 }).lean();
};

const acceptHandoff = async ({ handoffId, agentId }) => {
    const { HumanHandoff } = getWebModels();

    return HumanHandoff.findOneAndUpdate(
        {
            handoff_id: handoffId,
            status: 'pending',
            active: true,
        },
        {
            status: 'accepted',
            assigned_agent_id: agentId,
            accepted_at: new Date(),
            last_seen_at: new Date(),
        },
        {
            new: true,
        }
    );
};

const markFirstAgentResponse = async ({ handoffId }) => {
    const { HumanHandoff } = getWebModels();
    const handoff = await HumanHandoff.findOne({ handoff_id: handoffId });

    if (!handoff || handoff.first_response_at) {
        return handoff;
    }

    const firstResponseAt = new Date();
    const firstResponseMs = handoff.createdAt ? firstResponseAt.getTime() - handoff.createdAt.getTime() : null;

    handoff.first_response_at = firstResponseAt;
    handoff.first_response_ms = firstResponseMs;
    handoff.last_seen_at = new Date();
    await handoff.save();

    return handoff;
};

const resolveHandoff = async ({ handoffId }) => {
    const { HumanHandoff } = getWebModels();

    return HumanHandoff.findOneAndUpdate(
        {
            handoff_id: handoffId,
            active: true,
            status: { $in: ['pending', 'accepted'] },
        },
        {
            status: 'resolved',
            active: false,
            resolved_at: new Date(),
            last_seen_at: new Date(),
        },
        {
            new: true,
        }
    );
};

const findActiveHandoffBySession = async (sessionId) => {
    const { HumanHandoff } = getWebModels();
    return HumanHandoff.findOne({
        session_id: sessionId,
        active: true,
        status: { $in: ['pending', 'accepted'] },
    });
};

module.exports = {
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
};
