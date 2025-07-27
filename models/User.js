// models/User.js

const mongoose = require('mongoose');

// The conversationHistory array has been removed from the schema.
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
}, {
    timestamps: true // Adds createdAt and updatedAt timestamps
});

module.exports = mongoose.model('User', UserSchema);