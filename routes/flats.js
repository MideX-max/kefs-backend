import express from 'express';
import { storage } from '../store/storage.js';
import { authenticateToken } from './auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const flats = await storage.getFlats();
  return res.json(flats);
}));

router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const { name, block, floor, type, description } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Flat name is required.' });
  }

  const newFlat = await storage.addFlat({ name, block, floor, type, description });
  return res.status(201).json(newFlat);
}));

router.patch('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const updated = await storage.updateFlat(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ message: 'Flat not found.' });
  }

  return res.json(updated);
}));

export default router;
