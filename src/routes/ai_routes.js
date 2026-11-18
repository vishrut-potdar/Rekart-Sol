import express from 'express';
import { z } from 'zod';
import { ENV } from '../config/env.js';
import { authenticateToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { db } from '../db/connection.js';
import { AppError } from '../utils/errors.js';

const router = express.Router();

const AskSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(4000)
    })
  ).min(1).max(24),
  context: z.record(z.string(), z.unknown()).optional()
});

const SYSTEM_PROMPT = `You are REKART's assistant for households in Nagpur, India.
Help people decide whether to repair, sell, donate, reuse or recycle an item, and how to do it locally.
Be concise (under 150 words), practical and honest. Use ₹ for money.
Only quote prices that appear in the provided context; otherwise say a local quote is needed rather than inventing numbers.
Never suggest DIY on swollen batteries, microwave internals or mains wiring.
Never suggest giving electronics or batteries to informal kabadiwalas; route electronics only to CPCB/MPCB authorised recyclers.
Reply in the same language as the user (English, Hindi or Hinglish).`;

// Chat with the REKART assistant via OpenRouter.
router.post('/ask', authenticateToken, validate({ body: AskSchema }), async (req, res, next) => {
  try {
    const quota = await db.checkAndIncrementAiQuota(req.user.userId);
    if (!quota.allowed) {
      throw AppError.tooManyRequests(`Daily AI quota (${quota.limit} requests/day) reached.`, 'AI_QUOTA_EXCEEDED');
    }

    const { messages, context } = req.body;
    if (!ENV.OPENROUTER_API_KEY) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'AI_NOT_CONFIGURED',
          message: 'AI assistant is not configured. Add OPENROUTER_API_KEY to .env and restart the server.',
          status: 503
        }
      });
    }

    const system = context ? `${SYSTEM_PROMPT}\n\nContext from the app (JSON):\n${JSON.stringify(context).slice(0, 4000)}` : SYSTEM_PROMPT;
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ENV.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'Rekart' },
      body: JSON.stringify({
        model: ENV.OPENROUTER_MODEL,
        messages: [{ role: 'system', content: system }, ...messages.slice(-12).map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))]
      }),
      signal: AbortSignal.timeout(ENV.AI_TIMEOUT_MS)
    });
    if (!response.ok) {
      console.warn('[ai/ask] OpenRouter error', response.status);
      const hint = [401, 402, 403].includes(response.status)
        ? 'the API key was rejected or its spending limit is reached'
        : 'try again shortly';
      return res.status(502).json({
        success: false,
        error: {
          code: 'AI_UPSTREAM_ERROR',
          message: `AI provider error (${response.status}): ${hint}.`,
          status: 502
        }
      });
    }
    const reply = (await response.json()).choices?.[0]?.message?.content?.trim() || '';
    return res.status(200).json({ success: true, data: { reply, model: ENV.OPENROUTER_MODEL } });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return next(new AppError('AI request timed out. Please try again.', { status: 504, code: 'AI_TIMEOUT' }));
    }
    next(err);
  }
});

export default router;
