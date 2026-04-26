const mongoose = require('mongoose');

const { Schema } = mongoose;

const buildWebUserModel = (connection) => {
    if (connection.models.WebUser) {
        return connection.models.WebUser;
    }

    const WebUserSchema = new Schema(
        {
            user_id: {
                type: String,
                required: true,
                unique: true,
                index: true,
            },
            display_name: {
                type: String,
            },
            phone_number: {
                type: String,
                default: null,
            },
            role: {
                type: String,
                enum: ['widget_user', 'agent', 'admin'],
                default: 'widget_user',
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
            metadata: {
                type: Schema.Types.Mixed,
                default: {},
            },
        },
        {
            timestamps: true,
            collection: 'web_users',
        }
    );

    return connection.model('WebUser', WebUserSchema);
};

module.exports = buildWebUserModel;
