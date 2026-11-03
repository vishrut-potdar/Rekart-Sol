import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { ENV } from '../config/env.js';
import { PileDecompositionService } from '../services/vision/pile_decomposition.js';
import { SingleItemClassifierService } from '../services/vision/single_item_classifier.js';
import { MediaStorageService } from '../services/vision/media_storage.js';
import { jobQueue } from '../services/queue/job_queue.js';
import { optionalAuth } from '../middleware/auth.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const router = express.Router();

// 1. Pile-Mode Image Decomposition (Synchronous)
router.post('/decompose-pile', optionalAuth, async (req, res, next) => {
  try {
    const { batchPhotoUrl, userId, assumedCategory = 'apparel' } = req.body;
    const resolvedUserId = req.user?.userId || userId || 'user_guest';

    if (!batchPhotoUrl) {
      return res.status(400).json({ error: 'batchPhotoUrl is required' });
    }
    const result = await PileDecompositionService.decomposePhoto({
      batchPhotoUrl,
      userId: resolvedUserId,
      assumedCategory
    });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// 1b. Pile-Mode Image Decomposition (Asynchronous Background Job)
router.post('/decompose-pile-async', optionalAuth, async (req, res, next) => {
  try {
    const { batchPhotoUrl, userId, assumedCategory = 'apparel' } = req.body;
    const resolvedUserId = req.user?.userId || userId || 'user_guest';

    if (!batchPhotoUrl) {
      return res.status(400).json({ error: 'batchPhotoUrl is required' });
    }

    const job = jobQueue.createJob('decompose_pile', {
      batchPhotoUrl,
      userId: resolvedUserId,
      assumedCategory
    });

    return res.status(202).json({
      success: true,
      message: 'Pile decomposition job queued in background',
      job_id: job.id,
      status_url: `/api/v1/jobs/${job.id}`
    });
  } catch (err) {
    next(err);
  }
});

// 2. Single-Item Identification
router.post('/classify-single', async (req, res, next) => {
  try {
    const { imageUrl, userHint = '' } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl is required' });
    }
    // Locally stored uploads are read back so AI vision providers receive the actual image, not a relative path.
    const imageBuffer = imageUrl.startsWith('/uploads/')
      ? await fs.readFile(path.resolve(ENV.LOCAL_UPLOAD_DIR, path.basename(imageUrl))).catch(() => null)
      : null;
    const classification = await SingleItemClassifierService.classifyImage({ imageUrl, userHint, imageBuffer });
    return res.status(200).json({ success: true, data: classification });
  } catch (err) {
    next(err);
  }
});

// 3. Media Upload (Photo, Video, Audio, Receipt)
router.post('/upload-media', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded in form-data' });
    }
    const uploaded = await MediaStorageService.uploadMedia({
      filename: req.file.originalname,
      buffer: req.file.buffer,
      mediaType: req.file.mimetype
    });
    return res.status(201).json({ success: true, data: uploaded });
  } catch (err) {
    next(err);
  }
});

// 3b. Pre-Signed Cloud Storage URL Generator (S3 / R2 direct upload)
router.post('/presigned-upload-url', async (req, res, next) => {
  try {
    const { filename = 'upload.jpg', mediaType = 'image/jpeg' } = req.body;
    const presigned = await MediaStorageService.generatePresignedUploadUrl({ filename, mediaType });
    return res.status(200).json({ success: true, data: presigned });
  } catch (err) {
    next(err);
  }
});

// 4. Pre-Pickup Photo Log Manager
router.post('/pre-pickup-log', optionalAuth, async (req, res, next) => {
  try {
    const { itemId, photoUrls, operatorId, conditionNotes } = req.body;
    const resolvedOperatorId = req.user?.userId || operatorId || 'op_default';

    if (!itemId || !photoUrls || !Array.isArray(photoUrls)) {
      return res.status(400).json({ error: 'itemId and photoUrls array are required' });
    }
    const archive = await MediaStorageService.createPrePickupLog({
      itemId,
      photoUrls,
      operatorId: resolvedOperatorId,
      conditionNotes
    });
    return res.status(201).json({ success: true, data: archive });
  } catch (err) {
    next(err);
  }
});

export default router;
