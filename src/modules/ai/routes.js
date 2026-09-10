const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

try {
    process.loadEnvFile?.();
} catch (e) {
    // .env is optional
}

const router = express.Router();

const LANG_MAP = {
    'en': 'English',
    'np': 'Nepali',
    'hi': 'Hindi',
    'as': 'Assamese'
};

function parseJsonResponse(rawText) {
    if (!rawText) return null;
    const trimmed = rawText.trim();
    // Strip markdown code fences if wrapped
    const cleaned = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        // Fallback: extract the first JSON object or array substring if there is surrounding commentary
        const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (match) {
            return JSON.parse(match[0]);
        }
        throw e;
    }
}

function normalizeTranslationResult(inputData, parsedOutput) {
    if (Array.isArray(inputData)) {
        if (Array.isArray(parsedOutput)) return parsedOutput;
        if (parsedOutput && typeof parsedOutput === 'object') {
            for (const key of ['translations', 'data', 'result', 'strings', 'items']) {
                if (Array.isArray(parsedOutput[key])) return parsedOutput[key];
            }
            const firstVal = Object.values(parsedOutput)[0];
            if (Array.isArray(firstVal)) return firstVal;
        }
    }
    return parsedOutput || inputData;
}

/**
 * POST /api/v1/ai/translate
 * Dynamically translates text using local Gemma (Ollama) or Gemini API.
 */
router.post('/translate', async (req, res) => {
    const { data, targetLanguage } = req.body || {};
    
    if (!data || !targetLanguage) {
        return res.status(400).json({ error: 'Missing data or targetLanguage' });
    }

    // Fast path: target is English and source is already English
    if (targetLanguage === 'en') {
        return res.json({ translatedData: data });
    }

    const targetLangName = LANG_MAP[targetLanguage] || targetLanguage;
    const prompt = Array.isArray(data)
        ? `Translate each string in this JSON array into ${targetLangName}. Return ONLY a valid JSON array of strings in the same order:\n\n${JSON.stringify(data)}`
        : `Translate all the string values in the following JSON into ${targetLangName}. Maintain the exact JSON structure and keys. Do not translate keys, only the string values. Return ONLY valid JSON:\n\n${JSON.stringify(data)}`;

    const provider = (process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? 'gemini' : 'ollama')).toLowerCase();

    // 1. Local Gemma via Ollama
    if (provider === 'ollama' || provider === 'gemma') {
        const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        const model = process.env.OLLAMA_MODEL || 'gemma4:e4b';

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s max timeout

            const ollamaRes = await fetch(`${baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    model: model,
                    prompt: prompt,
                    format: 'json',
                    stream: false,
                    options: {
                        num_predict: 300,
                        temperature: 0.1
                    }
                })
            });
            clearTimeout(timeoutId);

            if (!ollamaRes.ok) {
                console.warn(`Ollama request failed with status ${ollamaRes.status} (${ollamaRes.statusText})`);
                return res.json({ translatedData: data });
            }

            const result = await ollamaRes.json();
            const parsed = parseJsonResponse(result.response);
            return res.json({ translatedData: normalizeTranslationResult(data, parsed) });
        } catch (err) {
            console.warn(`Ollama translation skipped or timed out (${err.message}). Rendering original content.`);
            return res.json({ translatedData: data });
        }
    }

    // 2. Google Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn("No GEMINI_API_KEY found, using mock translation.");
        return res.json({ translatedData: data });
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.6-flash", 
            generationConfig: { responseMimeType: "application/json" } 
        });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const translatedText = response.text().trim();
        const parsed = parseJsonResponse(translatedText);

        return res.json({ translatedData: normalizeTranslationResult(data, parsed) });
    } catch (err) {
        console.warn(`Gemini translation error (${err.message}). Falling back to original content.`);
        return res.json({ translatedData: data });
    }
});

module.exports = router;
