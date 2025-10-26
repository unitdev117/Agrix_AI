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
        console.log('Bot commands menu has been set successfully.');

    } catch (error) {
        console.error('Error setting bot commands:', error.message);
    }
};

module.exports = {
    setBotCommands,
};