const mongoose = require('mongoose');

const { Schema } = mongoose;

const buildWebSessionModel = (connection) => {
    if (connection.models.WebSession) {
        return connection.models.WebSession;
    }

    const WebSessionSchema = new Schema(
        {
            session_id: {
                type: String,
                required: true,
                unique: true,
                index: true,
            },
            user_id: {
                type: String,
                required: true,
                index: true,
            },
            state: {
                type: String,
                enum: ['new', 'onboarding', 'route_choice', 'ai_chat', 'human_handoff', 'closed'],
                default: 'new',
                index: true,
            },
            onboarding_answers: {
                type: [
                    {
                        question_id: String,
                        answer: String,
                        timestamp: {
                            type: Date,
                            default: Date.now,
                        },
                    },
                ],
                default: [],
            },
            route_choice: {
                type: String,
                enum: ['ai', 'human', null],
                default: null,
            },
            active: {
                type: Boolean,
                default: true,
                index: true,
            },
            last_seen_at: {
                type: Date,
                default: Date.now,
                index: true,
            },
            assigned_agent_id: {
                type: String,
                default: null,
                index: true,
            },
            closed_at: {
                type: Date,
                default: null,
            },
        },
        {
            timestamps: true,
            collection: 'web_sessions',
        }
    );

    WebSessionSchema.index({ session_id: 1, last_seen_at: -1 });

    return connection.model('WebSession', WebSessionSchema);
};

module.exports = buildWebSessionModel;
