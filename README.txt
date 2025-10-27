####################################
BOT Status : OPERATIONAL🟩
Test Link : https://t.me/AgrixAI_Bot
####################################

To start the server 
    Type npm start

Make sure before turning it up that your IP is listed in MongoDB

# Gemini Telegram Bot

A Telegram bot powered by Google's Gemini AI model that supports multilingual conversations (English and Hindi).

## Features

- 🤖 Powered by Gemini-2.5-Flash-Lite AI model
- 🌐 Multilingual support (English, Hindi, Bengoli & Bhojuri)
- 💾 MongoDB integration for user preferences
- 🚀 Express server for monitoring
- 🔄 In-memory caching for better performance

## Prerequisites

- Node.js (Latest LTS version recommended)
- MongoDB instance
- Telegram Bot Token
- Google Gemini API Key

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
GEMINI_API_KEY=your_gemini_api_key
MONGO_URI=your_mongodb_connection_string
PORT=8000 (optional)



Dependencies
@google/generative-ai: Gemini AI integration
node-telegram-bot-api: Telegram Bot API
express: Web server framework
mongoose: MongoDB ODM
dotenv: Environment variable management


Create a new bot with @BotFather on Telegram
Get your Gemini API key from Google AI Studio
Set up a MongoDB instance and get your connection string
Configure your environment variables
Start the server using node app.js
Send /start to your bot on Telegram


├── app.js              # Main application entry point
├── config/
│   └── db.js          # MongoDB configuration
├── controllers/
│   ├── botController.js    # Telegram bot command handlers
│   └── geminiController.js # Gemini AI integration
├── models/
│   └── User.js        # User model schema
├── services/
│   ├── botSetupService.js  # Bot initialization
│   ├── cacheService.js     # In-memory caching
│   └── databaseService.js  # Database operations
└── utils/
    └── helpers.js     # Utility functions