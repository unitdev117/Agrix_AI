const aiService = require('../services/aiService');

/**
 * Generates a stateless response from Gemini based on a single prompt.
 * @param {string} prompt - The user's message.
 * @param {string} language - The target language for the response.
 * @returns {Promise<string>} The generated text response.
 */
const generateResponse = async (prompt, language) => {
    return aiService.generateResponse({
        prompt,
        language,
        context: {
            channel: 'telegram',
        },
    });
};

module.exports = { generateResponse };
