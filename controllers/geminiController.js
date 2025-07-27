const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize the Gemini AI model
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

/**
 * Generates a stateless response from Gemini based on a single prompt.
 * @param {string} prompt - The user's message.
 * @param {string} language - The target language for the response (e.g., 'English', 'Hindi').
 * @returns {Promise<string>} The generated text response.
 */
const generateResponse = async (prompt, language) => {
    try {
        const generationConfig = {
            maxOutputTokens: 500,
        };

        const languageInstruction = `Please provide the response in ${language}.`;
        const fullPrompt = `${prompt}\n\n---\n${languageInstruction}`;
        
        // Using generateContent for a single, stateless request instead of startChat
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
            generationConfig,
        });

        const response = await result.response;
        const text = response.text();
        return text;
    } catch (error) {
        console.error('Error generating response:', error);
        return 'I am having trouble thinking right now. Please try again later.';
    }
};

module.exports = { generateResponse };