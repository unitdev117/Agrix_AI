const mongoose = require('mongoose');

const { Schema } = mongoose;

const buildHumanHandoffModel = (connection) => {
    if (connection.models.HumanHandoff) {
        return connection.models.HumanHandoff;
    }

    const HumanHandoffSchema = new Schema(
        {
            handoff_id: {
                type: String,
                required: true,
                unique: true,
                index: true,
            },
            session_id: {
                type: String,
                required: true,
                index: true,
            },
            status: {
                type: String,
                enum: ['pending', 'accepted', 'resolved'],
                default: 'pending',
                index: true,
            },
            active: {
                type: Boolean,
                default: true,
                index: true,
            },
            assigned_agent_id: {
                type: String,
                default: null,
                index: true,
            },
            accepted_at: {
                type: Date,
                default: null,
            },
            first_response_at: {
                type: Date,
                default: null,
            },
            first_response_ms: {
                type: Number,
                default: null,
            },
            resolved_at: {
                type: Date,
                default: null,
            },
            last_seen_at: {
                type: Date,
                default: Date.now,
                index: true,
            },
            metadata: {
                type: Schema.Types.Mixed,
                default: {},
            },
        },
        {
            timestamps: true,
            collection: 'human_handoffs',
        }
    );

    HumanHandoffSchema.index({ status: 1, active: 1, last_seen_at: -1 });

    return connection.model('HumanHandoff', HumanHandoffSchema);
};

module.exports = buildHumanHandoffModel;
