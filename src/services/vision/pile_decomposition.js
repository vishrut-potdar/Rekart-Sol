import { db } from '../../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { AiVisionProvider } from './ai_vision_provider.js';

/**
 * Pile-Mode Image Decomposition Service
 * Detects multiple overlapping or laid-out garments/items in a single photograph,
 * segments bounding boxes, and generates individual child item records.
 */
export class PileDecompositionService {
  /**
   * Decomposes a bulk photo into individual garment/item entities.
   * Connects to AI Vision Provider (Gemini / PyTorch model) with deterministic fallback.
   */
  static async decomposePhoto({ batchPhotoUrl, userId, assumedCategory = 'apparel', imageBuffer = null }) {
    const batchId = uuidv4();

    // Use AI Vision Provider
    const detections = await AiVisionProvider.analyzeGarmentPile(imageBuffer || batchPhotoUrl);

    const childItems = [];
    for (const detection of detections) {
      const itemRecord = await db.createItem({
        user_id: userId,
        parent_batch_id: batchId,
        category: detection.category || assumedCategory,
        brand: detection.brand,
        model_name: `${detection.brand} ${detection.sub_type || detection.label}`,
        provisional_grade: detection.provisional_grade || 'B',
        bounding_box: detection.bounding_box,
        raw_media_urls: [batchPhotoUrl],
        metadata: {
          color: detection.color,
          sub_type: detection.sub_type,
          visual_defects: detection.visual_defects || [],
          requires_exception_closeup: Boolean(detection.requires_exception_closeup),
          exception_reason: detection.exception_reason || null
        },
        status: 'triaging'
      });
      childItems.push(itemRecord);
    }

    return {
      batch_id: batchId,
      original_photo_url: batchPhotoUrl,
      items_detected_count: childItems.length,
      items: childItems
    };
  }
}
