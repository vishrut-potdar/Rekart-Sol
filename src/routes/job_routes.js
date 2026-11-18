import express from 'express';
import { jobQueue } from '../services/queue/job_queue.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireV2Module } from '../middleware/feature_flag.js';
import { AppError } from '../utils/errors.js';

const router = express.Router();

router.use(requireV2Module('async_jobs'));

router.get('/:jobId', authenticateToken, (req, res, next) => {
  const job = jobQueue.getJob(req.params.jobId);
  if (!job) {
    return next(AppError.notFound('Job not found'));
  }
  if (job.payload?.userId && job.payload.userId !== req.user.userId && req.user.role !== 'admin') {
    return next(AppError.forbidden('You do not have permission to view this job'));
  }
  return res.status(200).json({ success: true, data: job });
});

export default router;
