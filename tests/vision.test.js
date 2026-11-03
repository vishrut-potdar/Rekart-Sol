import test from 'node:test';
import assert from 'node:assert/strict';
import { PileDecompositionService } from '../src/services/vision/pile_decomposition.js';
import { SingleItemClassifierService } from '../src/services/vision/single_item_classifier.js';
import { MediaStorageService } from '../src/services/vision/media_storage.js';

test('PileDecompositionService decomposes bulk garment image into discrete child items', async () => {
  const result = await PileDecompositionService.decomposePhoto({
    batchPhotoUrl: 'https://cdn.rekart.in/mock/garment-pile-01.jpg',
    userId: 'user_nagpur_101',
    assumedCategory: 'apparel'
  });

  assert.ok(result.batch_id, 'Batch ID should be generated');
  assert.equal(result.items_detected_count, 3, 'Should detect 3 garments in pile');
  assert.equal(result.items.length, 3);

  const shirt = result.items.find(i => i.brand === 'Levis');
  assert.ok(shirt, 'Should recognize Levis item');
  assert.ok(shirt.bounding_box, 'Should generate bounding box coordinates');
  assert.equal(shirt.parent_batch_id, result.batch_id);

  const sweater = result.items.find(i => i.brand === 'Monte Carlo');
  assert.ok(sweater.metadata.requires_exception_closeup, 'Should flag visual ambiguity on cuff');
});

test('SingleItemClassifierService accurately classifies electronics and extracts sub-features', async () => {
  const classification = await SingleItemClassifierService.classifyImage({
    imageUrl: 'https://cdn.rekart.in/mock/iphone13.jpg',
    userHint: 'iPhone 13 with cracked front glass'
  });

  assert.equal(classification.category, 'electronics');
  assert.equal(classification.brand, 'Apple');
  assert.equal(classification.model_name, 'iPhone 13');
  assert.ok(classification.confidence > 0.9);
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
