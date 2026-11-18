import express from 'express';
import { z } from 'zod';
import { WhereDoesThisGoService } from '../services/recycling/where_does_this_go.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

const LookupQuerySchema = z.object({
  query: z.string().max(200).optional().default('')
});

// 1. "Where Does This Go?" Instant Disposal Lookup
router.get('/where-does-this-go', validate({ query: LookupQuerySchema }), (req, res) => {
  const result = WhereDoesThisGoService.lookup(req.query.query);
  return res.status(200).json({ success: true, data: result });
});

export default router;
