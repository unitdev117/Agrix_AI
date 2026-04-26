

const mongoose = require('mongoose');

// The conversationHistory has been removed from the schema.
const UserSchema = new mongoose.Schema({
    telegramId: {
        type: Number,
        required: true,
        unique: true,
    },
    firstName: {
        type: String,
        required: true,
    },
    username: {
        type: String,
    },
    language: {
        type: String,
        default: 'en', // Default language is English
    },
    usage_count: {
        type: Number,
        default: 0,
    },
    last_used_at: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true // Adds createdAt and updatedAt timestamps
});

module.exports = mongoose.model('User', UserSchema);
