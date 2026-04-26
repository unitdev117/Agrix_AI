const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('./loggerService');
const metrics = require('./metricsService');

const DEFAULT_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 12000);
const DEFAULT_RETRIES = Number(process.env.AI_RETRIES || 1);
const DEFAULT_FALLBACK_RESPONSE =
    process.env.AI_FALLBACK_RESPONSE || 'I am having trouble thinking right now. Please try again later.';

let model;

const getModel = () => {
    if (model) {
        return model;
    }

    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured.');
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const configuredModel = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash-lite';
    const modelName = configuredModel.startsWith('models/')
        ? configuredModel
        : `models/${configuredModel}`;

    model = genAI.getGenerativeModel(
        {
            model: modelName,
            generationConfig: {
                maxOutputTokens: 700,
            },
        },
        { apiVersion: 'v1' }
    );

    return model;
};

const withTimeout = async (promise, timeoutMs) => {
    let timer;

    try {
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error(`AI request timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        });

        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timer);
    }
};

const buildPrompt = (prompt, language) => {
    if (!language) {
        return prompt;
    }

    const languageInstruction = `Please provide the response in ${language}.`;
    return `${prompt}\n\n---\n${languageInstruction}`;
};

const generateResponse = async ({ prompt, language, context = {} }) => {
    const start = Date.now();
    const maxAttempts = Math.max(1, DEFAULT_RETRIES + 1);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const activeModel = getModel();
            const fullPrompt = buildPrompt(prompt, language);
            const result = await withTimeout(activeModel.generateContent(fullPrompt), DEFAULT_TIMEOUT_MS);
            const response = await result.response;
            const text = response.text();
            const latencyMs = Date.now() - start;

            metrics.recordAiLatency(latencyMs);
            logger.info('ai_response_success', {
                latencyMs,
                attempt,
                channel: context.channel || 'unknown',
                sessionId: context.sessionId || null,
                sourceMessageId: context.sourceMessageId || null,
            });

            return text;
        } catch (error) {
            const shouldRetry = attempt < maxAttempts;
            metrics.recordAiError();

            logger.error('ai_response_error', {
                error,
                attempt,
                shouldRetry,
                channel: context.channel || 'unknown',
                sessionId: context.sessionId || null,
                sourceMessageId: context.sourceMessageId || null,
            });

            if (!shouldRetry) {
                return DEFAULT_FALLBACK_RESPONSE;
            }
        }
    }

    return DEFAULT_FALLBACK_RESPONSE;
};

module.exports = {
    generateResponse,
};
