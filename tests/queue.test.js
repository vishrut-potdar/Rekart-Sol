import test from 'node:test';
import assert from 'node:assert/strict';
import { jobQueue } from '../src/services/queue/job_queue.js';

test('JobQueue creates, processes, and completes asynchronous tasks', async () => {
  const job = jobQueue.createJob('decompose_pile', {
    batchPhotoUrl: 'https://cdn.rekart.in/mock/garments_nagpur.jpg',
    userId: 'user-async-test',
    assumedCategory: 'apparel'
  });

  assert.ok(job.id);
  assert.equal(job.type, 'decompose_pile');
  assert.ok(['pending', 'processing'].includes(job.status));

  // Wait a tick for async execution to complete
  await new Promise(resolve => setTimeout(resolve, 50));

  const completedJob = jobQueue.getJob(job.id);
  assert.equal(completedJob.status, 'completed');
  assert.equal(completedJob.progress, 100);
  assert.ok(completedJob.result.items.length >= 3);
});
