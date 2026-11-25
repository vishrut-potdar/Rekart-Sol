import { electronicsSubtype } from '../../../public/assets/device-type.js';
import { AiVisionProvider } from './ai_vision_provider.js';

/**
 * Single-Item Identification Service
 * Multi-label classification to identify item category, brand, model line,
 * and visual condition signals.
 */
export class SingleItemClassifierService {
  static async classifyImage({ imageUrl, userHint = '', imageBuffer = null }) {
    const result = await AiVisionProvider.analyzeSingleItem(imageBuffer || imageUrl, userHint);
    const subtype = electronicsSubtype({ modelName: result.model_name, subCategory: result.sub_category });
    if (subtype !== 'laptop' && subtype !== 'tablet' && result.category !== 'electronics') return result;
    if (subtype === result.sub_category && result.category === 'electronics') return result;
    return {
      ...result, category: 'electronics', sub_category: subtype,
      suggested_flow: subtype === 'smartphone' ? 'electronics_mobile' : 'manual_category_picker',
      requires_manual_confirmation: true
    };
  }
}
