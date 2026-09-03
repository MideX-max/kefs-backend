import express from 'express';
import { storage } from '../store/storage.js';
import { authenticateToken } from './auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = express.Router();

router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const stats = await storage.getStats();
  return res.json(stats);
}));

router.post('/reset', authenticateToken, asyncHandler(async (req, res) => {
  const result = await storage.resetAllData();
  return res.json(result);
}));

export default router;
