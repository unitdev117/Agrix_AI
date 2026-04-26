const mongoose = require('mongoose');

const { Schema } = mongoose;

const buildWebEventModel = (connection) => {
    if (connection.models.WebEvent) {
        return connection.models.WebEvent;
    }

    const WebEventSchema = new Schema(
        {
            event_id: {
                type: String,
                required: true,
            },
            message_id: {
                type: String,
                required: true,
            },
            event_type: {
                type: String,
                required: true,
            },
            source: {
                type: String,
                enum: ['widget', 'agent', 'server'],
                required: true,
            },
            session_id: {
                type: String,
                required: true,
                index: true,
            },
            timestamp: {
                type: Date,
                default: Date.now,
                index: true,
            },
            payload: {
                type: Schema.Types.Mixed,
                default: {},
            },
        },
        {
            timestamps: false,
            collection: 'web_events',
        }
    );

    WebEventSchema.index({ session_id: 1, timestamp: -1 });
    WebEventSchema.index({ session_id: 1, source: 1, message_id: 1 }, { unique: true });

    return connection.model('WebEvent', WebEventSchema);
};

module.exports = buildWebEventModel;
