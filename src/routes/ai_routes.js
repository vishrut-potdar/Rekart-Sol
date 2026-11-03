import express from 'express';
import { ENV } from '../config/env.js';

const router = express.Router();

const SYSTEM_PROMPT = `You are REKART's assistant for households in Nagpur, India.
Help people decide whether to repair, sell, donate, reuse or recycle an item, and how to do it locally.
Be concise (under 150 words), practical and honest. Use ₹ for money.
Only quote prices that appear in the provided context; otherwise say a local quote is needed rather than inventing numbers.
Never suggest DIY on swollen batteries, microwave internals or mains wiring.
Reply in the same language as the user (English, Hindi or Hinglish).`;

// Chat with the REKART assistant via OpenRouter. Body: { messages: [{role, content}], context?: object }
router.post('/ask', async (req, res, next) => {
  try {
    const { messages, context } = req.body;
    if (!Array.isArray(messages) || !messages.length || messages.some(m => !['user', 'assistant'].includes(m?.role) || typeof m.content !== 'string')) {
      return res.status(400).json({ success: false, error: 'messages must be a non-empty array of {role: user|assistant, content: string}' });
    }
    if (!ENV.OPENROUTER_API_KEY) {
      return res.status(503).json({ success: false, error: 'AI assistant is not configured. Add OPENROUTER_API_KEY to .env and restart the server.' });
    }

    const system = context ? `${SYSTEM_PROMPT}\n\nContext from the app (JSON):\n${JSON.stringify(context).slice(0, 4000)}` : SYSTEM_PROMPT;
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ENV.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'Rekart' },
      body: JSON.stringify({
        model: ENV.OPENROUTER_MODEL,
        messages: [{ role: 'system', content: system }, ...messages.slice(-12).map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))]
      })
    });
    if (!response.ok) {
      console.warn('[ai/ask] OpenRouter error', response.status, await response.text());
      const hint = [401, 402, 403].includes(response.status)
        ? 'the API key was rejected or its spending limit is reached (check it at openrouter.ai/settings/keys)'
        : 'try again shortly';
      return res.status(502).json({ success: false, error: `AI provider error (${response.status}): ${hint}.` });
    }
    const reply = (await response.json()).choices?.[0]?.message?.content?.trim() || '';
    return res.status(200).json({ success: true, data: { reply, model: ENV.OPENROUTER_MODEL } });
  } catch (err) {
    next(err);
  }
});

export default router;
