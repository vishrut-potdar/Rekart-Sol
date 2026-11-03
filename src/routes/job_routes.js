import express from 'express';
import { jobQueue } from '../services/queue/job_queue.js';

const router = express.Router();

router.get('/:jobId', (req, res) => {
  const job = jobQueue.getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  return res.status(200).json({ success: true, data: job });
});

export default router;
