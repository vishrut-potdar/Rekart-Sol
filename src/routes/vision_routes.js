import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { ENV } from '../config/env.js';
import { PileDecompositionService } from '../services/vision/pile_decomposition.js';
import { SingleItemClassifierService } from '../services/vision/single_item_classifier.js';
import { stripExifMetadata } from '../utils/exif_stripper.js';
import { MediaStorageService, sniffImageType } from '../services/vision/media_storage.js';
import { jobQueue } from '../services/queue/job_queue.js';
import { authenticateToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requireV2Module } from '../middleware/feature_flag.js';
import { db } from '../db/connection.js';
import { AppError } from '../utils/errors.js';

// Locally stored uploads are read back so AI vision providers receive the actual image, not a relative path.
const readLocalUpload = url => (typeof url === 'string' && url.startsWith('/uploads/')
  ? fs.readFile(path.resolve(ENV.LOCAL_UPLOAD_DIR, path.basename(url))).catch(() => null)
  : null);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const scanUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1, fields: 1, fieldSize: 1000, parts: 3 } });
const router = express.Router();

const DecomposePileSchema = z.object({
  batchPhotoUrl: z.string().min(1).max(500),
  assumedCategory: z.enum(['electronics', 'apparel', 'appliance', 'furniture', 'other']).optional().default('apparel')
});

const ClassifySingleSchema = z.object({
  imageUrl: z.string().min(1).max(500),
  userHint: z.string().max(250).optional().default('')
});

const PresignedUrlSchema = z.object({
  filename: z.string().min(1).max(160).optional().default('upload.jpg'),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional().default('image/jpeg')
});

const PrePickupLogSchema = z.object({
  itemId: z.string().min(1).max(128),
  photoUrls: z.array(z.string().min(1).max(500)).min(1).max(20),
  conditionNotes: z.string().max(500).optional().default('')
});

async function enforceAiQuota(req) {
  const quota = await db.checkAndIncrementAiQuota(req.user.userId);
  if (!quota.allowed) {
    throw AppError.tooManyRequests(`Daily AI quota (${quota.limit} scans/day) reached. Please enter details manually or try again tomorrow.`, 'AI_QUOTA_EXCEEDED');
  }
}

// 1. Pile-Mode Image Decomposition (Synchronous)
router.post('/decompose-pile', authenticateToken, validate({ body: DecomposePileSchema }), async (req, res, next) => {
  try {
    await enforceAiQuota(req);
    const { batchPhotoUrl, assumedCategory } = req.body;
    const result = await PileDecompositionService.decomposePhoto({
      batchPhotoUrl,
      userId: req.user.userId,
      assumedCategory,
      imageBuffer: await readLocalUpload(batchPhotoUrl)
    });
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// 1b. Pile-Mode Image Decomposition (Asynchronous Background Job — v2 gated)
router.post('/decompose-pile-async', requireV2Module('async_jobs'), authenticateToken, validate({ body: DecomposePileSchema }), async (req, res, next) => {
  try {
    await enforceAiQuota(req);
    const { batchPhotoUrl, assumedCategory } = req.body;
    const job = jobQueue.createJob('decompose_pile', {
      batchPhotoUrl,
      userId: req.user.userId,
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
router.post('/classify-single', authenticateToken, validate({ body: ClassifySingleSchema }), async (req, res, next) => {
  try {
    await enforceAiQuota(req);
    const { imageUrl, userHint } = req.body;
    const imageBuffer = await readLocalUpload(imageUrl);
    const classification = await SingleItemClassifierService.classifyImage({ imageUrl, userHint, imageBuffer });
    return res.status(200).json({ success: true, data: classification });
  } catch (err) {
    next(err);
  }
});

// Scan directly from the cleaned request bytes. No temporary photo URL is needed.
router.post('/scan', authenticateToken, scanUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw AppError.badRequest('Choose a photo to scan.', 'MISSING_FILE');
    const type = sniffImageType(req.file.buffer);
    if (!type) throw AppError.unsupportedMedia('Choose a JPEG, PNG or WebP photo.');
    await enforceAiQuota(req);
    const imageBuffer = stripExifMetadata(req.file.buffer, type.mime);
    const classification = await SingleItemClassifierService.classifyImage({
      imageBuffer,
      userHint: typeof req.body.userHint === 'string' ? req.body.userHint.slice(0, 200) : ''
    });
    res.json({ success: true, data: { classification, exif_stripped: true } });
  } catch (err) {
    next(err);
  }
});

// 3. Media Upload (Photo — EXIF stripped on upload)
router.post('/upload-media', authenticateToken, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw AppError.badRequest('No file uploaded in form-data', 'MISSING_FILE');
    }
    const uploaded = await MediaStorageService.uploadMedia({
      buffer: req.file.buffer,
      userId: req.user.userId
    });
    return res.status(201).json({ success: true, data: uploaded });
  } catch (err) {
    next(err);
  }
});

// 3b. Pre-Signed Cloud Storage URL Generator (S3 / R2 direct upload)
router.post('/presigned-upload-url', authenticateToken, validate({ body: PresignedUrlSchema }), async (req, res, next) => {
  try {
    const { filename, mediaType } = req.body;
    const presigned = await MediaStorageService.generatePresignedUploadUrl({ filename, mediaType });
    return res.status(200).json({ success: true, data: presigned });
  } catch (err) {
    next(err);
  }
});

// 4. Pre-Pickup Photo Log Manager
router.post('/pre-pickup-log', authenticateToken, validate({ body: PrePickupLogSchema }), async (req, res, next) => {
  try {
    const { itemId, photoUrls, conditionNotes } = req.body;
    const item = await db.getItem(itemId);
    if (item && item.user_id && item.user_id !== req.user.userId && req.user.role !== 'admin') {
      throw AppError.forbidden('You do not own this item');
    }
    const archive = await MediaStorageService.createPrePickupLog({
      itemId,
      photoUrls,
      operatorId: req.user.userId,
      conditionNotes
    });
    return res.status(201).json({ success: true, data: archive });
  } catch (err) {
    next(err);
  }
});

export default router;
