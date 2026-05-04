const User = require('../models/User');

/**
 * Finds a user by their Telegram ID. If the user doesn't exist, creates a new one.
 * @param {object} userInfo - Object containing telegramId, firstName, username.
 * @returns {Promise<{user: object, isNew: boolean}>} An object containing the user document and a boolean indicating if the user was newly created.
 */
const findOrCreateUser = async (userInfo) => {
    const { id, first_name, username } = userInfo;
    const now = new Date();

    let user = await User.findOne({ telegramId: id });
    let isNew = false;

    if (!user) {
        isNew = true;
        user = await User.create({
            telegramId: id,
            firstName: first_name,
            username: username || '',
            usage_count: 1,
            last_used_at: now,
        });
        console.log(`New user created: ${first_name} (${id})`);
    } else {
        user.firstName = first_name || user.firstName;
        user.username = typeof username === 'string' ? username : user.username;
        user.usage_count = Number(user.usage_count || 0) + 1;
        user.last_used_at = now;
        await user.save();
    }
    
    return { user, isNew };
};

/**
 * Updates a user's preferred language.
 * @param {number} telegramId - The user's Telegram ID.
 * @param {string} languageCode - The language code (e.g., 'en', 'hi').
 * @returns {Promise<object>} The updated user document.
 */
const updateUserLanguage = async (telegramId, languageCode) => {
    return await User.findOneAndUpdate(
        { telegramId },
        {
            language: languageCode,
            last_used_at: new Date(),
        },
        { new: true } // Return the updated document
    );
};


module.exports = {
    findOrCreateUser,
    updateUserLanguage,
};
