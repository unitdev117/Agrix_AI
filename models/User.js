

const mongoose = require('mongoose');


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
        default: 'en',
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
    timestamps: true
});

module.exports = mongoose.model('User', UserSchema);
