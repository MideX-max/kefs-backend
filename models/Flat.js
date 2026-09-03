import mongoose from 'mongoose';

const flatSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, unique: true },
    block: { type: String, required: true },
    floor: { type: String, required: true },
    type: { type: String, required: true },
    status: { type: String, required: true, default: 'available' },
    currentGuest: { type: String, default: null },
    currentPassId: { type: String, default: null },
    description: { type: String, default: '' }
  },
  { collection: 'flats', timestamps: true, versionKey: false }
);

export const Flat = mongoose.model('Flat', flatSchema);
