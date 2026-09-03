import express from 'express';
import multer from 'multer';
import { storage as dataStore } from '../store/storage.js';
import { authenticateGuestToken, authenticateToken } from './auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import {
  FOLDERS,
  CloudinaryError,
  destroyAsset,
  isCloudinaryConfigured,
  isOwnedPublicId,
  uploadBuffer
} from '../services/cloudinary.js';

const MAX_UPLOAD_BYTES = Math.round(Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024);

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

// Client-supplied folder names are mapped through this allowlist so an upload
// can never be steered outside the app's own Cloudinary folder tree.
const FOLDER_BY_KIND = {
  'id-document': FOLDERS.idDocument,
  photo: FOLDERS.photo,
  signature: FOLDERS.signature,
  booking: FOLDERS.booking
};
const DEFAULT_KIND = 'id-document';

const uploadLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: 'Too many uploads. Please wait and try again.'
});

const deleteLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 40,
  message: 'Too many delete requests. Please wait and try again.'
});

/** Verifies the bytes really are what the declared MIME type claims. */
function detectFileType(buffer) {
  if (buffer.subarray(0, 4).equals(Buffer.from('%PDF'))) return 'application/pdf';
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';

  const riff = buffer.subarray(0, 4).toString('ascii') === 'RIFF';
  const webp = buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (riff && webp) return 'image/webp';

  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.has(file.mimetype)) {
      return cb(null, true);
    }

    const rejection = new Error('Only PDF, JPEG, PNG, and WEBP files are allowed.');
    rejection.status = 400;
    return cb(rejection);
  }
});

const router = express.Router();

router.post('/', authenticateGuestToken, uploadLimiter, upload.single('file'), asyncHandler(async (req, res) => {
  if (!isCloudinaryConfigured) {
    return res.status(503).json({ message: 'File storage is not configured on this server.' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  const buffer = req.file.buffer;

  if (!buffer || buffer.length === 0) {
    return res.status(400).json({ message: 'Uploaded file is empty.' });
  }

  const detectedMime = detectFileType(buffer);
  if (!detectedMime || detectedMime !== req.file.mimetype) {
    return res.status(400).json({ message: 'Uploaded file content does not match an allowed file type.' });
  }

  const kind = String(req.body?.kind || DEFAULT_KIND).toLowerCase();
  const folder = FOLDER_BY_KIND[kind];
  if (!folder) {
    return res.status(400).json({
      message: `Unknown upload kind. Must be one of: ${Object.keys(FOLDER_BY_KIND).join(', ')}`
    });
  }

  // PDFs are stored as 'raw' so Cloudinary serves them untransformed.
  const resourceType = detectedMime === 'application/pdf' ? 'raw' : 'image';

  try {
    const asset = await uploadBuffer(buffer, {
      folder,
      resourceType,
      filename: req.file.originalname
    });

    return res.json({
      message: 'File uploaded successfully',
      fileUrl: asset.url,
      publicId: asset.publicId,
      resourceType: asset.resourceType,
      fileName: req.file.originalname,
      fileSize: asset.bytes || req.file.size,
      mimetype: detectedMime,
      width: asset.width,
      height: asset.height,
      uploadedAt: asset.uploadedAt
    });
  } catch (error) {
    if (error instanceof CloudinaryError) {
      console.error('Cloudinary upload failed:', error.cause?.message || error.message);
      return res.status(error.status).json({ message: error.message });
    }
    throw error;
  }
}));

/**
 * Removes an asset that is no longer wanted - the "Replace"/"Remove" actions in
 * the registration form call this so abandoned uploads do not pile up.
 * An asset still referenced by a saved record can only be removed by an admin.
 */
router.delete('/', deleteLimiter, asyncHandler(async (req, res) => {
  const { publicId, resourceType } = req.body || {};

  if (!publicId) {
    return res.status(400).json({ message: 'publicId is required.' });
  }

  if (!isOwnedPublicId(publicId)) {
    return res.status(400).json({ message: 'That asset is not managed by this application.' });
  }

  const referencedBy = await dataStore.findAssetReference(publicId);

  if (referencedBy) {
    const authorized = await new Promise(resolve => {
      authenticateToken(req, { status: () => ({ json: () => resolve(false) }) }, () => resolve(true));
    });

    if (!authorized) {
      return res.status(409).json({
        message: 'That file is attached to a saved reservation and cannot be deleted here.'
      });
    }
  }

  const removed = await destroyAsset(publicId, resourceType);

  if (!removed) {
    return res.status(502).json({ message: 'Could not delete the file from storage.' });
  }

  return res.json({ message: 'File deleted successfully', publicId });
}));

export default router;
