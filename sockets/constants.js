const SESSION_STATES = {
    NEW: 'new',
    ONBOARDING: 'onboarding',
    ROUTE_CHOICE: 'route_choice',
    AI_CHAT: 'ai_chat',
    HUMAN_HANDOFF: 'human_handoff',
    CLOSED: 'closed',
};

const ALLOWED_TRANSITIONS = {
    [SESSION_STATES.NEW]: [SESSION_STATES.ROUTE_CHOICE, SESSION_STATES.ONBOARDING],
    [SESSION_STATES.ONBOARDING]: [SESSION_STATES.ROUTE_CHOICE],
    [SESSION_STATES.ROUTE_CHOICE]: [SESSION_STATES.AI_CHAT, SESSION_STATES.HUMAN_HANDOFF],
    [SESSION_STATES.AI_CHAT]: [SESSION_STATES.CLOSED],
    [SESSION_STATES.HUMAN_HANDOFF]: [SESSION_STATES.CLOSED],
    [SESSION_STATES.CLOSED]: [],
};

const ONBOARDING_QUESTIONS = [
    {
        id: 'name',
        question: 'What is your complete name?',
    },
    {
        id: 'phone',
        question: 'What is your phone number?',
    },
];

const CONTACT_INFO = {
    phone: process.env.HANDOFF_PHONE || '+91-00000-00000',
    whatsapp: process.env.HANDOFF_WHATSAPP || '+91-00000-00000',
};

module.exports = {
    SESSION_STATES,
    ALLOWED_TRANSITIONS,
    ONBOARDING_QUESTIONS,
    CONTACT_INFO,
};
