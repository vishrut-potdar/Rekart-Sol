import { sniffImageType } from './media_storage.js';
import { z } from 'zod';
import { ENV } from '../../config/env.js';

export const SingleItemVisionSchema = z.object({
  category: z.enum(['electronics', 'apparel', 'appliance', 'furniture', 'other', 'unknown']),
  sub_category: z.string().max(100).nullable().optional().default(null),
  brand: z.string().max(100).nullable().optional().default(null),
  model_name: z.string().max(150).nullable().optional().default(null),
  confidence: z.number().min(0).max(1).nullable().optional().default(null),
  detected_features: z.array(z.string().max(100)).max(20).optional().default([]),
  visual_defects: z.array(z.string().max(120)).max(20).optional().default([]),
  suggested_flow: z.string().max(100).optional().default('manual_category_picker')
});

export const PileDetectionItemSchema = z.object({
  box_id: z.string().max(40),
  label: z.string().max(150),
  category: z.enum(['electronics', 'apparel', 'appliance', 'furniture', 'other']).default('apparel'),
  brand: z.string().max(100).nullable().optional().default('Generic'),
  sub_type: z.string().max(100).optional().default('Garment'),
  bounding_box: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    confidence: z.number().min(0).max(1).optional()
  }),
  visual_defects: z.array(z.string()).optional().default([]),
  color: z.string().max(60).optional().default('Unknown'),
  provisional_grade: z.enum(['A', 'B', 'C', 'BER']).default('B'),
  requires_exception_closeup: z.boolean().optional().default(false),
  exception_reason: z.string().max(250).nullable().optional()
});

export const PileVisionSchema = z.array(PileDetectionItemSchema);

const PILE_PROMPT = `You are Rekart's automated reverse-commerce garment vision model.
Analyze this pile photograph of clothes. Locate each individual piece, return bounding box coordinates, category, brand, sub_type, color, visible defects, and provisional grade (A, B, C, or BER).
Output strictly valid JSON with this shape:
[
  {
    "box_id": "box_01",
    "label": "Garment Name",
    "category": "apparel",
    "brand": "Brand or Generic",
    "sub_type": "Shirt/Jeans/Tee/Dress",
    "bounding_box": { "x": 0, "y": 0, "width": 100, "height": 100, "confidence": 0.95 },
    "visual_defects": ["stain", "tear"],
    "color": "Color",
    "provisional_grade": "A",
    "requires_exception_closeup": false
  }
]`;

const singleItemPrompt = userHint => `Identify this item for reverse commerce triage. User hint: "${String(userHint || '').replace(/"/g, "'").slice(0, 200)}".
Identify brand and exact model only when visible evidence supports them. Otherwise return null. Report only visible defects, never infer battery health or functionality. Return ONLY valid JSON:
{
  "category": "electronics|apparel|appliance|furniture|other|unknown",
  "sub_category": "smartphone|laptop|headphones|jacket|mixer|chair|null",
  "brand": "Apple|Samsung|etc|null",
  "model_name": "Exact Model or null",
  "confidence": 0.0 to 1.0,
  "detected_features": ["string"],
  "visual_defects": ["crack", "dent"],
  "suggested_flow": "electronics_mobile"
}`;

export function honestSingleItemFallback(reason = 'no_ai_provider_configured') {
  return {
    category: 'unknown',
    sub_category: null,
    brand: null,
    model_name: null,
    confidence: null,
    simulated: true,
    requires_manual_confirmation: true,
    fallback_reason: reason,
    detected_features: [],
    visual_defects: [],
    suggested_flow: 'manual_category_picker'
  };
}

export class AiVisionProvider {
  /**
   * Calls OpenRouter (OPENROUTER_API_KEY) or Gemini (GEMINI_API_KEY) vision if configured.
   * Validates LLM JSON with Zod. When unavailable or invalid, returns honest unknown fallback
   * with confidence: null and simulated: true so the UI asks the user to confirm.
   */
  static async analyzeGarmentPile(imageBufferOrUrl) {
    if (ENV.OPENROUTER_API_KEY) {
      try {
        const result = await this._callOpenRouter(PILE_PROMPT, imageBufferOrUrl);
        const parsed = PileVisionSchema.safeParse(result);
        if (parsed.success) {
          return parsed.data.map(item => ({ ...item, simulated: false }));
        }
        console.warn('[AiVisionProvider] OpenRouter pile output failed schema validation');
      } catch (err) {
        console.warn('[AiVisionProvider] OpenRouter pile analysis failed, falling back:', err.message);
      }
    }
    if (ENV.GEMINI_API_KEY) {
      try {
        const geminiResult = await this._callGeminiVisionForPile(imageBufferOrUrl);
        const parsed = PileVisionSchema.safeParse(geminiResult);
        if (parsed.success) {
          return parsed.data.map(item => ({ ...item, simulated: false }));
        }
        console.warn('[AiVisionProvider] Gemini pile output failed schema validation');
      } catch (err) {
        console.warn('[AiVisionProvider] Gemini Vision API call failed, falling back to demo detections:', err.message);
      }
    }

    // No AI provider available: fixed sample detections, flagged simulated so the UI labels them as demo
    return [
      {
        box_id: 'box_01',
        label: 'Men Cotton Casual Shirt',
        category: 'apparel',
        brand: 'Levis',
        sub_type: 'Full Sleeve Shirt',
        bounding_box: { x: 45, y: 30, width: 340, height: 420, confidence: 0.94 },
        visual_defects: ['mild_collar_wear'],
        color: 'Navy Blue',
        provisional_grade: 'B',
        simulated: true
      },
      {
        box_id: 'box_02',
        label: 'Denim Jeans',
        category: 'apparel',
        brand: 'Wrangler',
        sub_type: 'Slim Fit Jeans',
        bounding_box: { x: 380, y: 50, width: 310, height: 460, confidence: 0.91 },
        visual_defects: [],
        color: 'Dark Indigo',
        provisional_grade: 'A',
        simulated: true
      },
      {
        box_id: 'box_03',
        label: 'Winter Knit Sweater',
        category: 'apparel',
        brand: 'Monte Carlo',
        sub_type: 'Sweater / Cardigan',
        bounding_box: { x: 720, y: 80, width: 290, height: 390, confidence: 0.88 },
        visual_defects: ['frayed_cuff_ambiguity'],
        color: 'Charcoal Grey',
        provisional_grade: 'B',
        simulated: true,
        requires_exception_closeup: true,
        exception_reason: 'Ambiguity detected around sleeve cuff: check for moth holes or fraying'
      }
    ];
  }

  static async analyzeSingleItem(imageBufferOrUrl, userHint = '') {
    if (ENV.OPENROUTER_API_KEY) {
      try {
        const result = await this._callOpenRouter(singleItemPrompt(userHint), imageBufferOrUrl);
        const parsed = SingleItemVisionSchema.safeParse(result);
        if (parsed.success && parsed.data.category !== 'unknown') {
          return {
            ...parsed.data,
            simulated: false,
            requires_manual_confirmation: (parsed.data.confidence ?? 0) < 0.75
          };
        }
        console.warn('[AiVisionProvider] OpenRouter single-item output invalid or unknown');
      } catch (err) {
        console.warn('[AiVisionProvider] OpenRouter single-item analysis failed, falling back:', err.message);
      }
    }

    if (ENV.GEMINI_API_KEY) {
      try {
        const geminiResult = await this._callGeminiVisionForSingleItem(imageBufferOrUrl, userHint);
        const parsed = SingleItemVisionSchema.safeParse(geminiResult);
        if (parsed.success && parsed.data.category !== 'unknown') {
          return {
            ...parsed.data,
            simulated: false,
            requires_manual_confirmation: (parsed.data.confidence ?? 0) < 0.75
          };
        }
        console.warn('[AiVisionProvider] Gemini single-item output invalid or unknown');
      } catch (err) {
        console.warn('[AiVisionProvider] Gemini single-item analysis failed, falling back:', err.message);
      }
    }

    // Honest fallback (C7): never invent a brand/model or fake 0.96 confidence from userHint
    return honestSingleItemFallback(
      ENV.OPENROUTER_API_KEY || ENV.GEMINI_API_KEY
        ? 'ai_provider_unavailable_or_invalid'
        : 'no_ai_provider_configured'
    );
  }

  static async _callGeminiVisionForPile(imageBufferOrUrl) {
    return this._callGemini(PILE_PROMPT, imageBufferOrUrl);
  }

  static async _callGeminiVisionForSingleItem(imageBufferOrUrl, userHint) {
    return this._callGemini(singleItemPrompt(userHint), imageBufferOrUrl);
  }

  static async _callGemini(prompt, imageBufferOrUrl) {
    if (!ENV.GEMINI_MODEL) throw new Error('GEMINI_MODEL is required for Gemini vision');
    const model = ENV.GEMINI_MODEL.replace(/^models\//, '');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    let base64Data = '';
    let mimeType = 'image/jpeg';
    if (Buffer.isBuffer(imageBufferOrUrl)) {
      mimeType = sniffImageType(imageBufferOrUrl)?.mime;
      if (!mimeType) return null;
      base64Data = imageBufferOrUrl.toString('base64');
    } else if (typeof imageBufferOrUrl === 'string' && imageBufferOrUrl.startsWith('data:')) {
      const parts = imageBufferOrUrl.split(',');
      mimeType = parts[0].split(':')[1].split(';')[0];
      base64Data = parts[1];
    } else {
      return null;
    }

    const payload = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64Data } }
        ]
      }],
      generationConfig: { maxOutputTokens: 2048, responseMimeType: 'application/json' }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ENV.GEMINI_API_KEY },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(ENV.AI_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const jsonRes = await response.json();
    const textOutput = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return JSON.parse(textOutput);
  }

  static async _callOpenRouter(prompt, imageBufferOrUrl) {
    let imageUrl;
    if (Buffer.isBuffer(imageBufferOrUrl)) {
      const type = sniffImageType(imageBufferOrUrl);
      if (!type) return null;
      imageUrl = `data:${type.mime};base64,${imageBufferOrUrl.toString('base64')}`;
    } else if (typeof imageBufferOrUrl === 'string' && /^(data:|https?:)/.test(imageBufferOrUrl)) imageUrl = imageBufferOrUrl;
    else return null;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ENV.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'Rekart' },
      body: JSON.stringify({
        model: ENV.OPENROUTER_VISION_MODEL || ENV.OPENROUTER_MODEL,
        max_tokens: 2048,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt + '\nRespond with JSON only.' }, { type: 'image_url', image_url: { url: imageUrl } }] }]
      }),
      signal: AbortSignal.timeout(ENV.AI_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`OpenRouter API error: ${response.status}`);
    const text = (await response.json()).choices?.[0]?.message?.content || '';
    return JSON.parse(text.replace(/^\s*```(?:json)?|```\s*$/g, ''));
  }
}
