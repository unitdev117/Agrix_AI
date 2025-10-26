/**
 * Returns an inline keyboard for language selection.
 */
const getLanguageKeyboard = () => {
    return {
        inline_keyboard: [
            [
                { text: 'English', callback_data: 'lang_en' },
                { text: 'हिंदी', callback_data: 'lang_hi' }
            ],
            [
                { text: 'বাংলা', callback_data: 'lang_bn' },
                { text: 'भोजपुरी', callback_data: 'lang_bho' }
            ]
        ]
    };
};

const languageMap = {
    en: 'English',
    hi: 'Hindi',
    bn: 'Bengali (Bangla)',
    bho: 'Bhojpuri'
};

module.exports = {
    getLanguageKeyboard,
    languageMap
};

