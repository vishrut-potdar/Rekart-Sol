import { v4 as uuidv4 } from 'uuid';
import { PileDecompositionService } from '../vision/pile_decomposition.js';

class JobQueue {
  constructor() {
    this.jobs = new Map();
  }

  createJob(jobType, payload) {
    const jobId = `job_${jobType}_${Date.now()}_${uuidv4().substring(0, 8)}`;
    const jobRecord = {
      id: jobId,
      type: jobType,
      payload,
      status: 'pending', // pending, processing, completed, failed
      progress: 0,
      result: null,
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.jobs.set(jobId, jobRecord);

    // Process asynchronously
    setImmediate(() => this.processJob(jobId));

    return jobRecord;
  }

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  async processJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'processing';
    job.progress = 25;
    job.updated_at = new Date().toISOString();

    try {
      if (job.type === 'decompose_pile') {
        const result = await PileDecompositionService.decomposePhoto(job.payload);
        job.result = result;
        job.progress = 100;
        job.status = 'completed';
      } else {
        job.status = 'completed';
        job.progress = 100;
        job.result = { processed: true };
      }
    } catch (err) {
      job.status = 'failed';
      job.error = err.message;
    } finally {
      job.updated_at = new Date().toISOString();
      this.jobs.set(jobId, job);
    }
  }
}

export const jobQueue = new JobQueue();
