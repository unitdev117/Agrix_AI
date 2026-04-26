const logger = require('./loggerService');

/**
 * Sets the bot's command menu that users sees.
 * @param {object} bot - The initialized node-telegram-bot-api instance.
 */
const setBotCommands = async (bot) => {
    try {
        const commands = [
            { 
                command: 'start', 
                description: 'Check if bot is alive / Restart' 
            },
            {
                command: 'lang',
                description: 'Change language preference (English/Hindi)',
            },
        ];

        await bot.setMyCommands(commands);
        logger.success('Bot commands menu has been set successfully.');

    } catch (error) {
        logger.error('Error setting bot commands:', { error });
    }
};

module.exports = {
    setBotCommands,
};