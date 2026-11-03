import { AiVisionProvider } from './ai_vision_provider.js';

/**
 * Single-Item Identification Service
 * Multi-label classification to identify item category, brand, model line,
 * and visual condition signals.
 */
export class SingleItemClassifierService {
  static async classifyImage({ imageUrl, userHint = '', imageBuffer = null }) {
    return await AiVisionProvider.analyzeSingleItem(imageBuffer || imageUrl, userHint);
  }
}
