import express from 'express';
import { WhereDoesThisGoService } from '../services/recycling/where_does_this_go.js';

const router = express.Router();

// 1. "Where Does This Go?" Instant Disposal Lookup
router.get('/where-does-this-go', (req, res) => {
  const { query = '' } = req.query;
  const result = WhereDoesThisGoService.lookup(query);
  return res.status(200).json({ success: true, data: result });
});

export default router;
