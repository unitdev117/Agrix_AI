const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// We are using Gemini 2.5 Flash-Lite.
const configuredModel = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash-lite';
const modelName = configuredModel.startsWith('models/')
  ? configuredModel
  : `models/${configuredModel}`;

const model = genAI.getGenerativeModel(
  {
    model: modelName,
    generationConfig: {
      maxOutputTokens: 700,
    },
  },
  { apiVersion: 'v1' }
);

/**
 * Generates a stateless response from Gemini based on a single prompt.
 * @param {string} prompt - The user's message.
 * @param {string} language - The target language for the response (e.g., 'English', 'Hindi, Bhojpuri and Bengali').
 * @returns {Promise<string>} The generated text response.
 */
const generateResponse = async (prompt, language) => {
    try {
        const languageInstruction = `Please provide the response in ${language}.`;
        const fullPrompt = `${prompt}\n\n---\n${languageInstruction}`;
        
        // Use the latest SDK style: pass a plain string prompt.
        const result = await model.generateContent(fullPrompt);

        const response = await result.response;
        const text = response.text();
        return text;
    } catch (error) {
        console.error('Error generating response:', error);
        return 'I am having trouble thinking right now. Please try again later.';
    }
};

module.exports = { generateResponse };
