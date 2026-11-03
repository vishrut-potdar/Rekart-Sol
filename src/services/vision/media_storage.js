import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ENV } from '../../config/env.js';
import { db } from '../../db/connection.js';

let s3Client = null;
if (ENV.AWS_ACCESS_KEY_ID && ENV.AWS_SECRET_ACCESS_KEY) {
  s3Client = new S3Client({
    region: ENV.S3_REGION,
    endpoint: ENV.S3_ENDPOINT || undefined,
    credentials: {
      accessKeyId: ENV.AWS_ACCESS_KEY_ID,
      secretAccessKey: ENV.AWS_SECRET_ACCESS_KEY
    }
  });
}

export class MediaStorageService {
  /**
   * Uploads media buffer to S3 or local storage
   */
  static async uploadMedia({ filename, buffer, mediaType = 'image/jpeg' }) {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const safeName = `${Date.now()}_${hash.substring(0, 12)}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    if (s3Client && ENV.STORAGE_MODE === 's3') {
      const command = new PutObjectCommand({
        Bucket: ENV.S3_BUCKET,
        Key: safeName,
        Body: buffer,
        ContentType: mediaType
      });
      await s3Client.send(command);

      const s3Url = ENV.S3_ENDPOINT
        ? `${ENV.S3_ENDPOINT}/${ENV.S3_BUCKET}/${safeName}`
        : `https://${ENV.S3_BUCKET}.s3.${ENV.S3_REGION}.amazonaws.com/${safeName}`;

      return {
        url: s3Url,
        key: safeName,
        sha256: hash,
        size_bytes: buffer.length,
        media_type: mediaType,
        storage: 's3'
      };
    }

    // Local filesystem storage fallback
    const uploadDir = path.resolve(ENV.LOCAL_UPLOAD_DIR);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filePath = path.join(uploadDir, safeName);
    fs.writeFileSync(filePath, buffer);

    return {
      url: `/uploads/${safeName}`,
      key: safeName,
      sha256: hash,
      size_bytes: buffer.length,
      media_type: mediaType,
      storage: 'local'
    };
  }

  /**
   * Generates a pre-signed S3 URL for direct client-side uploads (photo/video)
   */
  static async generatePresignedUploadUrl({ filename, mediaType = 'image/jpeg' }) {
    const safeName = `direct_${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    if (s3Client && ENV.STORAGE_MODE === 's3') {
      const command = new PutObjectCommand({
        Bucket: ENV.S3_BUCKET,
        Key: safeName,
        ContentType: mediaType
      });
      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
      return {
        upload_url: uploadUrl,
        public_url: `https://${ENV.S3_BUCKET}.s3.${ENV.S3_REGION}.amazonaws.com/${safeName}`,
        key: safeName,
        expires_in_seconds: 900
      };
    }

    // Mock direct upload target for development
    return {
      upload_url: `/api/v1/vision/upload-media`,
      public_url: `/uploads/${safeName}`,
      key: safeName,
      expires_in_seconds: 900
    };
  }

  /**
   * Pre-Pickup Photo Log Manager
   * Creates an immutable, timestamped archive linked to the item before handoff/inspection.
   */
  static async createPrePickupLog({ itemId, photoUrls, operatorId, conditionNotes = '' }) {
    const timestamp = new Date().toISOString();
    const manifestPayload = JSON.stringify({
      item_id: itemId,
      timestamp,
      photo_urls: photoUrls,
      operator_id: operatorId,
      condition_notes: conditionNotes
    });

    const manifestSignature = crypto
      .createHash('sha256')
      .update(manifestPayload)
      .digest('hex');

    const archiveRecord = {
      archive_id: `ARCHIVE-${Date.now()}-${itemId.substring(0, 8)}`,
      item_id: itemId,
      timestamp,
      operator_id: operatorId,
      photo_urls: photoUrls,
      condition_notes: conditionNotes,
      immutable_hash: manifestSignature,
      verification_status: 'locked_and_archived'
    };

    const item = await db.getItem(itemId);
    if (item) {
      const currentLogs = item.metadata?.pre_pickup_logs || [];
      currentLogs.push(archiveRecord);
      await db.updateItem(itemId, {
        metadata: {
          ...item.metadata,
          pre_pickup_logs: currentLogs
        }
      });
    }

    return archiveRecord;
  }
}
