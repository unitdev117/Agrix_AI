const User = require('../models/User');

/**
 * Finds a user by their Telegram ID. If the user doesn't exist, creates a new one.
 * @param {object} userInfo - Object containing telegramId, firstName, username.
 * @returns {Promise<{user: object, isNew: boolean}>} An object containing the user document and a boolean indicating if the user was newly created.
 */
const findOrCreateUser = async (userInfo) => {
    const { id, first_name, username } = userInfo;

    let user = await User.findOne({ telegramId: id });
    let isNew = false;

    if (!user) {
        isNew = true;
        user = await User.create({
            telegramId: id,
            firstName: first_name,
            username: username || '',
        });
        console.log(`New user created: ${first_name} (${id})`);
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
        { language: languageCode },
        { new: true } // Return the updated document
    );
};

// The addMessageToHistory function has been removed entirely.

module.exports = {
    findOrCreateUser,
    updateUserLanguage,
    // addMessageToHistory is no longer exported.
};