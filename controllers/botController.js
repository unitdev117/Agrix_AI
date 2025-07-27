// controllers/botController.js

const dbService = require('../services/databaseService');
const cacheService = require('../services/cacheService');
const geminiController = require('./geminiController');
const { getLanguageKeyboard, languageMap } = require('../utils/helpers');

let bot;

// Function to set the bot instance
const setBot = (b) => {
    bot = b;
};

const handleStart = async (msg) => {
    const chatId = msg.chat.id;
    try {
        const { user, isNew } = await dbService.findOrCreateUser(msg.from);

        if (isNew) {
            // New user flow: Greet and ask for language
            await bot.sendMessage(chatId, `👋 Welcome, ${msg.from.first_name}! I am a Gemini-powered bot.`);
            handleLanguage(msg);
        } else {
            // Returning user flow: Welcome them back
            const langName = languageMap[user.language] || 'English';
            await bot.sendMessage(chatId, `👋 Welcome back, ${msg.from.first_name}! Your current language is set to ${langName}. You can start chatting, or use /lang to change it.`);
        }
    } catch (error) {
        console.error('Error in /start handler:', error);
        bot.sendMessage(chatId, 'An error occurred. Please try again later.');
    }
};

const handleLanguage = async (msg) => {
    const chatId = msg.chat.id;
    try {
        const keyboard = getLanguageKeyboard();
        await bot.sendMessage(chatId, 'Please choose your preferred language:', {
            reply_markup: keyboard,
        });
    } catch (error) {
        console.error('Error in /lang handler:', error);
        bot.sendMessage(chatId, 'An error occurred while fetching language options.');
    }
};

const handleCallbackQuery = async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const telegramId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (data.startsWith('lang_')) {
        const langCode = data.split('_')[1];
        try {
            await dbService.updateUserLanguage(telegramId, langCode);
            cacheService.set(telegramId, { language: langCode });

            const langName = languageMap[langCode] || 'your selected language';
            bot.sendMessage(chatId, `✅ Language set to ${langName}. You can now chat with me!`);
            bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id
            });
        } catch (error)
        {
            console.error('Error in callback query handler:', error);
            bot.sendMessage(chatId, 'Failed to update language preference.');
        }
    }
};

const handleMessage = async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text.startsWith('/')) {
        return;
    }

    try {
        bot.sendChatAction(chatId, 'typing');
        
        const { user } = await dbService.findOrCreateUser(msg.from);
        const language = user.language;

        const responseText = await geminiController.generateResponse(text, languageMap[language]);

        await bot.sendMessage(chatId, responseText);

    } catch (error) {
        console.error('Error handling message:', error);
        bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again.');
    }
};


module.exports = {
    setBot,
    handleStart,
    handleLanguage,
    handleCallbackQuery,
    handleMessage,
};