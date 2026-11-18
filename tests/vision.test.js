import test from 'node:test';
import assert from 'node:assert/strict';
import { PileDecompositionService } from '../src/services/vision/pile_decomposition.js';
import { SingleItemClassifierService } from '../src/services/vision/single_item_classifier.js';
import { MediaStorageService } from '../src/services/vision/media_storage.js';
import { SingleItemVisionSchema } from '../src/services/vision/ai_vision_provider.js';

test('PileDecompositionService decomposes bulk garment image into discrete child items flagged simulated when offline', async () => {
  const result = await PileDecompositionService.decomposePhoto({
    batchPhotoUrl: 'https://cdn.rekart.in/mock/garment-pile-01.jpg',
    userId: 'user_nagpur_101',
    assumedCategory: 'apparel'
  });

  assert.ok(result.batch_id, 'Batch ID should be generated');
  assert.equal(result.items_detected_count, 3, 'Should detect 3 garments in pile');
  assert.equal(result.items.length, 3);

  const shirt = result.items.find(i => i.brand === 'Levis');
  assert.ok(shirt, 'Should include sample Levis item');
  assert.equal(shirt.metadata.simulated, true, 'Offline detections must be flagged simulated');
  assert.ok(shirt.bounding_box, 'Should generate bounding box coordinates');
  assert.equal(shirt.parent_batch_id, result.batch_id);

  const sweater = result.items.find(i => i.brand === 'Monte Carlo');
  assert.ok(sweater.metadata.requires_exception_closeup, 'Should flag visual ambiguity on cuff');
});

test('SingleItemClassifierService returns honest unknown fallback when no AI key is configured (C7)', async () => {
  const classification = await SingleItemClassifierService.classifyImage({
    imageUrl: 'https://cdn.rekart.in/mock/iphone13.jpg',
    userHint: 'iPhone 13 with cracked front glass'
  });

  assert.equal(classification.category, 'unknown');
  assert.equal(classification.confidence, null);
  assert.equal(classification.simulated, true);
  assert.equal(classification.requires_manual_confirmation, true);
  assert.equal(classification.suggested_flow, 'manual_category_picker');
});

test('SingleItemVisionSchema validates valid AI JSON and rejects malformed outputs', () => {
  const valid = SingleItemVisionSchema.safeParse({
    category: 'electronics',
    sub_category: 'smartphone',
    brand: 'Apple',
    model_name: 'iPhone 13',
    confidence: 0.91,
    detected_features: ['dual_camera'],
    visual_defects: ['cracked_glass'],
    suggested_flow: 'electronics_mobile'
  });
  assert.equal(valid.success, true);

  const badCategory = SingleItemVisionSchema.safeParse({
    category: 'spaceship',
    confidence: 0.9
  });
  assert.equal(badCategory.success, false);
});

test('MediaStorageService creates immutable timestamped pre-pickup archive', async () => {
  const archive = await MediaStorageService.createPrePickupLog({
    itemId: 'item-sample-001',
    photoUrls: ['https://cdn.rekart.in/photos/front.jpg', 'https://cdn.rekart.in/photos/back.jpg'],
    operatorId: 'technician_sitabuldi_01',
    conditionNotes: 'No visible glass crack, clean ports'
  });

  assert.ok(archive.archive_id);
  assert.ok(archive.immutable_hash, 'Should have SHA-256 integrity signature');
  assert.equal(archive.verification_status, 'locked_and_archived');
});
