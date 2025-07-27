// utils/helpers.js

/**
 * Returns an inline keyboard for language selection.
 */
const getLanguageKeyboard = () => {
    return {
        inline_keyboard: [
            [
                { text: 'English 🇬🇧', callback_data: 'lang_en' },
                { text: 'हिन्दी 🇮🇳', callback_data: 'lang_hi' }
            ]
        ]
    };
};

const languageMap = {
    en: 'English',
    hi: 'Hindi'
};

module.exports = {
    getLanguageKeyboard,
    languageMap
};