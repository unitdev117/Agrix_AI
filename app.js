require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const connectDB = require('./config/db');
const botController = require('./controllers/botController');
const { setBotCommands } = require('./services/botSetupService');

// --- Basic Setup ---
const app = express();
const PORT = process.env.PORT || 8000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
    console.error('FATAL ERROR: TELEGRAM_BOT_TOKEN is not defined in .env file.');
    process.exit(1);
}

// --- Database Connection ---
connectDB();

// --- Initialize Telegram Bot ---
const bot = new TelegramBot(TOKEN, { polling: true });

// --- SETUP BOT MENU AND CONTROLLER ---
// Set the command menu first
setBotCommands(bot); 
// Then, pass the bot instance to the controller to handle actions
botController.setBot(bot); 

console.log('Bot server started...');

// --- Bot Event Listeners ---

// Listener for /start command
bot.onText(/\/start/, (msg) => botController.handleStart(msg));

// Listener for /lang command
bot.onText(/\/lang/, (msg) => botController.handleLanguage(msg));

// Listener for callback queries from inline keyboards
bot.on('callback_query', (callbackQuery) => botController.handleCallbackQuery(callbackQuery));

// Listener for any message that is NOT a command
bot.on('message', (msg) => {
    if (msg.text && !msg.text.startsWith('/')) {
        botController.handleMessage(msg);
    }
});

// Listener for polling errors
bot.on('polling_error', (error) => {
    console.error(`Polling error: ${error.code} - ${error.message}`);
});

// --- Start Express Server ---
app.get('/', (req, res) => {
    res.send('Gemini Telegram Bot is running!');
});

app.listen(PORT, () => {
    console.log(`Express server listening on port ${PORT}`);
});