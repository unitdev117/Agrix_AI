require('dotenv').config();

const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');

const connectDB = require('./config/db');
const { connectWebDB, getWebConnection } = require('./config/webDb');
const User = require('./models/User');
const { languageMap } = require('./utils/helpers');
const botController = require('./controllers/botController');
const { setBotCommands } = require('./services/botSetupService');
const { createSocketServer } = require('./sockets/server');
const metrics = require('./services/metricsService');
const logger = require('./services/loggerService');
const { getWebModels } = require('./services/webModelService');

const app = express();
const PORT = process.env.PORT || 8000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TOKEN) {
    console.error('FATAL ERROR: TELEGRAM_BOT_TOKEN is not defined in .env file.');
    process.exit(1);
}

app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'agrixcheck',
        timestamp: new Date().toISOString(),
    });
});

app.get('/ready', (req, res) => {
    const telegramDbReady = mongoose.connection.readyState === 1;

    let webDbReady = false;
    try {
        webDbReady = getWebConnection().readyState === 1;
    } catch (error) {
        webDbReady = false;
    }

    const ready = telegramDbReady && webDbReady;

    const payload = {
        status: ready ? 'ready' : 'not_ready',
        checks: {
            telegramDbReady,
            webDbReady,
        },
        metrics: metrics.getSnapshot(),
        timestamp: new Date().toISOString(),
    };

    if (!ready) {
        res.status(503).json(payload);
        return;
    }

    res.json(payload);
});

app.use('/api/dashboard', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    next();
});

app.get('/api/dashboard/telegram-users', async (req, res) => {
    try {
        const users = await User.find({})
            .sort({ last_used_at: -1, updatedAt: -1 })
            .lean();

        res.json({
            users: users.map((user) => ({
                telegramId: user.telegramId,
                firstName: user.firstName || '',
                username: user.username || '',
                language: languageMap[user.language] || user.language || 'English',
                usageCount: Number(user.usage_count || (user.updatedAt ? 1 : 0)),
                lastUsedAt: user.last_used_at || user.updatedAt || null,
                createdAt: user.createdAt || null,
                updatedAt: user.updatedAt || null,
            })),
        });
    } catch (error) {
        logger.error('dashboard_telegram_users_failed', { error });
        res.status(500).json({ error: 'Failed to load Telegram users' });
    }
});

app.get('/api/dashboard/web-users', async (req, res) => {
    try {
        const { WebUser, WebSession } = getWebModels();

        const [users, sessionStats] = await Promise.all([
            WebUser.find({ role: 'widget_user' })
                .sort({ last_seen_at: -1, updatedAt: -1 })
                .lean(),
            WebSession.aggregate([
                {
                    $group: {
                        _id: '$user_id',
                        sessionsCount: { $sum: 1 },
                        lastSessionAt: { $max: '$last_seen_at' },
                    },
                },
            ]),
        ]);

        const sessionStatsByUserId = new Map(
            sessionStats.map((item) => [
                item._id,
                {
                    sessionsCount: item.sessionsCount,
                    lastSessionAt: item.lastSessionAt,
                },
            ])
        );

        res.json({
            users: users.map((user) => {
                const stats = sessionStatsByUserId.get(user.user_id) || {};
                return {
                    userId: user.user_id,
                    fullName: user.display_name || user.metadata?.full_name || '',
                    phoneNumber: user.phone_number || user.metadata?.phone_number || '',
                    sessionsCount: Number(stats.sessionsCount || 0),
                    lastSeenAt: user.last_seen_at || stats.lastSessionAt || null,
                    createdAt: user.createdAt || null,
                };
            }),
        });
    } catch (error) {
        logger.error('dashboard_web_users_failed', { error });
        res.status(500).json({ error: 'Failed to load web users' });
    }
});

const initializeTelegramBot = () => {
    const bot = new TelegramBot(TOKEN, { polling: true });

    setBotCommands(bot);
    botController.setBot(bot);

    bot.onText(/\/start/, (msg) => botController.handleStart(msg));
    bot.onText(/\/lang/, (msg) => botController.handleLanguage(msg));
    bot.on('callback_query', (callbackQuery) => botController.handleCallbackQuery(callbackQuery));

    bot.on('message', (msg) => {
        if (msg.text && !msg.text.startsWith('/')) {
            botController.handleMessage(msg);
        }
    });

    bot.on('polling_error', (error) => {
        logger.error('telegram_polling_error', {
            error,
            code: error.code,
        });
    });

    logger.info('telegram_bot_initialized');

    return bot;
};

const bootstrap = async () => {
    try {
        await connectDB();
        await connectWebDB();

        // Trigger model compilation and index setup at startup.
        getWebModels();

        initializeTelegramBot();

        const httpServer = http.createServer(app);
        createSocketServer(httpServer);

        httpServer.listen(PORT, () => {
            logger.info('server_started', {
                port: PORT,
                namespaces: ['/widget', '/agent'],
            });
        });
    } catch (error) {
        logger.error('bootstrap_failed', { error });
        process.exit(1);
    }
};

process.on('unhandledRejection', (error) => {
    logger.error('unhandled_rejection', { error });
});

process.on('uncaughtException', (error) => {
    logger.error('uncaught_exception', { error });
});

bootstrap();
