const ensureString = (value) => typeof value === 'string' && value.trim().length > 0;

const validatePayload = (payload, requiredFields = []) => {
    const errors = [];

    if (!payload || typeof payload !== 'object') {
        return {
            valid: false,
            errors: ['Payload must be an object'],
        };
    }

    requiredFields.forEach((field) => {
        if (!ensureString(payload[field])) {
            errors.push(`Field '${field}' must be a non-empty string`);
        }
    });

    return {
        valid: errors.length === 0,
        errors,
    };
};

const validators = {
    'session:start': (payload) => validatePayload(payload, ['messageId']),
    'onboarding:answer': (payload) => {
        const result = validatePayload(payload, ['messageId', 'sessionId', 'questionId', 'answer']);
        return result;
    },
    'route:choose': (payload) => {
        const result = validatePayload(payload, ['messageId', 'sessionId', 'route']);

        if (result.valid && !['ai', 'human'].includes(payload.route)) {
            result.valid = false;
            result.errors.push("Field 'route' must be either 'ai' or 'human'");
        }

        return result;
    },
    'profile:submit': (payload) => validatePayload(payload, ['messageId', 'sessionId', 'fullName', 'phoneNumber']),
    'personnel:request': (payload) => validatePayload(payload, ['messageId', 'sessionId']),
    'chat:user_message': (payload) => validatePayload(payload, ['messageId', 'sessionId', 'text']),
    'session:close': (payload) => validatePayload(payload, ['messageId', 'sessionId']),
    'agent:online': (payload) => validatePayload(payload, ['messageId']),
    'handoff:accept': (payload) => validatePayload(payload, ['messageId', 'handoffId', 'sessionId']),
    'chat:agent_message': (payload) => validatePayload(payload, ['messageId', 'sessionId', 'text']),
    'handoff:resolve': (payload) => validatePayload(payload, ['messageId', 'handoffId', 'sessionId']),
};

const validateEventPayload = (eventName, payload) => {
    const validator = validators[eventName];

    if (!validator) {
        return {
            valid: false,
            errors: [`No validator defined for event '${eventName}'`],
        };
    }

    return validator(payload);
};

module.exports = {
    validateEventPayload,
};
