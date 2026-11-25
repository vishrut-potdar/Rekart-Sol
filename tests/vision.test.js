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

test('direct scan sends stripped PNG bytes to the configured Gemini model', async t => {
  const { createApp } = await import('../src/app.js');
  const { ENV } = await import('../src/config/env.js');
  const { AuthService } = await import('../src/services/auth/auth_service.js');
  const original = { GEMINI_API_KEY: ENV.GEMINI_API_KEY, GEMINI_MODEL: ENV.GEMINI_MODEL, OPENROUTER_API_KEY: ENV.OPENROUTER_API_KEY };
  Object.assign(ENV, { GEMINI_API_KEY: 'synthetic-key', GEMINI_MODEL: 'synthetic-vision', OPENROUTER_API_KEY: '' });
  t.after(() => Object.assign(ENV, original));
  const fetchLocal = globalThis.fetch;
  let request;
  t.mock.method(globalThis, 'fetch', (url, options) => {
    if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return fetchLocal(url, options);
    request = { url, ...options };
    return Promise.resolve(Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      category: 'electronics', sub_category: 'smartphone', brand: 'Example', model_name: 'Example Phone',
      confidence: 0.92, visual_defects: ['cracked screen']
    }) }] } }] }));
  });
  const server = (await createApp()).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const token = AuthService.generateToken({ id: 'scan-demo', role: 'donor' });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'test.png');
  const url = 'http://127.0.0.1:' + server.address().port + '/api/v1/vision/scan';
  const response = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.data.classification.model_name, 'Example Phone');
  assert.deepEqual(result.data.classification.visual_defects, ['cracked screen']);
  assert.equal(result.data.exif_stripped, true);
  assert.match(request.url, /synthetic-vision:generateContent$/);
  assert.equal(request.headers['x-goog-api-key'], 'synthetic-key');
  assert.equal(JSON.parse(request.body).contents[0].parts[1].inline_data.mime_type, 'image/png');
});


test('vision corrects a Galaxy Book mislabeled as a phone', async t => {
  const { AiVisionProvider } = await import('../src/services/vision/ai_vision_provider.js');
  t.mock.method(AiVisionProvider, 'analyzeSingleItem', async () => ({
    category: 'electronics', sub_category: 'smartphone', brand: 'Samsung', model_name: 'Galaxy Book4 Pro',
    confidence: 0.94, suggested_flow: 'electronics_mobile'
  }));
  const result = await SingleItemClassifierService.classifyImage({ imageUrl: 'test.png' });
  assert.equal(result.sub_category, 'laptop');
  assert.equal(result.requires_manual_confirmation, true);
  assert.notEqual(result.suggested_flow, 'electronics_mobile');
});
