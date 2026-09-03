import mongoose from 'mongoose';
import { DEFAULT_MANAGER_SIGNATURE } from '../data/seedData.js';

const adminSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    phone: { type: String, default: '' },
    estateName: { type: String, required: true },
    estateAddress: { type: String, required: true },
    gateContact: { type: String, required: true },
    defaultSignature: { type: String, default: DEFAULT_MANAGER_SIGNATURE },
    defaultSignaturePublicId: { type: String, default: '' },
    defaultSignatureResourceType: { type: String, default: '' },
    autoApprovalEnabled: { type: Boolean, required: true, default: true },
    strictIdCheck: { type: Boolean, required: true, default: true },
    notificationEmail: { type: String, default: '' }
  },
  { collection: 'admins', timestamps: true, versionKey: false }
);

export const Admin = mongoose.model('Admin', adminSchema);
