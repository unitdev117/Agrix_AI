const mongoose = require('mongoose');

const { Schema } = mongoose;

const buildWebMessageModel = (connection) => {
    if (connection.models.WebMessage) {
        return connection.models.WebMessage;
    }

    const WebMessageSchema = new Schema(
        {
            message_id: {
                type: String,
                required: true,
                index: true,
            },
            session_id: {
                type: String,
                required: true,
                index: true,
            },
            sender_type: {
                type: String,
                enum: ['widget_user', 'agent', 'ai', 'system'],
                required: true,
            },
            sender_id: {
                type: String,
                default: null,
            },
            content: {
                type: String,
                required: true,
            },
            timestamp: {
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
            timestamps: false,
            collection: 'web_messages',
        }
    );

    WebMessageSchema.index({ session_id: 1, timestamp: -1 });
    WebMessageSchema.index({ session_id: 1, message_id: 1 }, { unique: true });

    return connection.model('WebMessage', WebMessageSchema);
};

module.exports = buildWebMessageModel;
