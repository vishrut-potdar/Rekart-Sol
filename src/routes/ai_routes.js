import express from 'express';
import { z } from 'zod';
import { ENV } from '../config/env.js';
import { authenticateToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { db } from '../db/connection.js';
import { currentSavedPricing } from '../services/decision/decision_engine.js';
import { AppError } from '../utils/errors.js';

const router = express.Router();

const AskSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(4000)
    })
  ).min(1).max(24),
  context: z.record(z.string(), z.unknown()).optional(),
  itemId: z.string().max(128).optional()
});

const SYSTEM_PROMPT = `You are REKART's assistant for households in Nagpur, India.
Help people decide whether to repair, sell, donate, reuse or recycle an item, and how to do it locally.
Be concise (under 150 words), practical and honest. Use ₹ for money.
Do not supply prices or generalized price ranges. Resale pricing is shown directly from Rekart's calculator.
Never suggest DIY on swollen batteries, microwave internals or mains wiring.
Never suggest giving electronics or batteries to informal kabadiwalas; route electronics only to CPCB/MPCB authorised recyclers.
Reply in the same language as the user (English, Hindi or Hinglish).`;

// Chat with the REKART assistant via OpenRouter.
router.post('/ask', authenticateToken, validate({ body: AskSchema }), async (req, res, next) => {
  try {
    const { messages, itemId } = req.body;
    if (!messages.some(message => message.role === 'user')) throw AppError.badRequest('Add a question first.');
    const pricingQuestion = /price|worth|value|cost|payout|quote|₹|\binr\b|\brs\b|कीमत|दाम|kitna|kimat|keemat|daam|कैश|रुपय/i;
    if (messages.some(message => message.role === 'user' && pricingQuestion.test(message.content))) {
      const decision = itemId ? await db.getDecisionByItemId(itemId) : null;
      if (decision && decision.user_id !== req.user.userId) throw AppError.forbidden('You do not own this decision');
      const pricing = decision ? currentSavedPricing(decision).resale_pricing : null;
      const lines = [];
      for (const [label, entry] of [
        ['Local seller offers', pricing?.sell],
        ['Refurbished retail (what buyers pay)', pricing?.retail]
      ]) {
        if (!entry) continue;
        const range = entry.range_inr.map(value => '₹' + value.toLocaleString('en-IN')).join(' – ');
        lines.push([label, range, entry.storage_gb == null ? null : entry.storage_gb + ' GB' + (entry.base_variant_only ? ' base variant' : ''),
          entry.source, entry.as_of, entry.stale ? 'stale snapshot' : null, entry.source_url].filter(Boolean).join(' · '));
      }
      if (!lines.length) lines.push('No reliable price available. Open your item’s pricing card or get a direct local quote.');
      if (pricing?.verdict === 'borderline') lines.push('Borderline — get a recent local sell or repair quote.');
      if (pricing?.verdict === 'release') lines.push('Release under the 60% rule or safety override.');
      if (pricing?.verdict === 'repair') lines.push('Repair qualifies under the 60% rule.');
      return res.json({ success: true, data: { reply: lines.join('\n'), model: null } });
    }
    const quota = await db.checkAndIncrementAiQuota(req.user.userId);
    if (!quota.allowed) {
      throw AppError.tooManyRequests(`Daily AI quota (${quota.limit} requests/day) reached.`, 'AI_QUOTA_EXCEEDED');
    }

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

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ENV.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'Rekart' },
      body: JSON.stringify({
        model: ENV.OPENROUTER_MODEL,
        max_tokens: 320,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages.filter(message => message.role === 'user').slice(-12).map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))]
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
    const safeReply = /[\p{Sc}]|\b(?:price|worth|payout|rupees?|lakhs?|crores?|inr|rs)\b|रुपय|कीमत|दाम/iu.test(reply)
      ? 'For pricing, open your item’s pricing card and check the dated quotes.' : reply;
    return res.status(200).json({ success: true, data: { reply: safeReply, model: ENV.OPENROUTER_MODEL } });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return next(new AppError('AI request timed out. Please try again.', { status: 504, code: 'AI_TIMEOUT' }));
    }
    next(err);
  }
});

export default router;
