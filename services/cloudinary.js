import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

// The root folder every asset this app owns lives under. Deletes are refused
// for public ids outside it, so a stray id can never reach another app's media.
export const ROOT_FOLDER = process.env.CLOUDINARY_FOLDER || 'keffi';

export const FOLDERS = {
  idDocument: `${ROOT_FOLDER}/id-documents`,
  photo: `${ROOT_FOLDER}/guest-photos`,
  signature: `${ROOT_FOLDER}/signatures`,
  managerSignature: `${ROOT_FOLDER}/manager-signatures`,
  booking: `${ROOT_FOLDER}/booking-screenshots`
};

export const isCloudinaryConfigured = Boolean(CLOUD_NAME && API_KEY && API_SECRET);

if (isCloudinaryConfigured) {
  // The secret stays server-side: it is only ever read from the environment
  // here and is never returned by any route.
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true
  });
} else {
  console.warn(
    'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and ' +
    'CLOUDINARY_API_SECRET in backend/.env - uploads will be rejected until you do.'
  );
}

export class CloudinaryError extends Error {
  constructor(message, { status = 502, cause } = {}) {
    super(message);
    this.name = 'CloudinaryError';
    this.status = status;
    this.cause = cause;
  }
}

function assertConfigured() {
  if (!isCloudinaryConfigured) {
    throw new CloudinaryError('File storage is not configured on this server.', { status: 503 });
  }
}

export function isCloudinaryUrl(url) {
  return typeof url === 'string' && /^https?:\/\/res\.cloudinary\.com\//.test(url);
}

export function isDataUri(value) {
  return typeof value === 'string' && value.startsWith('data:');
}

// Guards deletes: only ids inside this app's own folder tree may be destroyed.
export function isOwnedPublicId(publicId) {
  return typeof publicId === 'string'
    && publicId.length > 0
    && !publicId.includes('..')
    && publicId.startsWith(`${ROOT_FOLDER}/`);
}

function normalizeResult(result) {
  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    format: result.format || '',
    bytes: result.bytes || 0,
    width: result.width || null,
    height: result.height || null,
    version: result.version ? String(result.version) : '',
    uploadedAt: result.created_at || new Date().toISOString()
  };
}

/**
 * Uploads a buffer to Cloudinary. `resourceType` should be 'image' for images
 * and 'raw' for PDFs, so Cloudinary serves them back with the right handling.
 */
export function uploadBuffer(buffer, { folder, resourceType = 'image', filename } = {}) {
  assertConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: folder || ROOT_FOLDER,
        resource_type: resourceType,
        // Cloudinary generates the id, so a hostile filename can never steer the path.
        use_filename: false,
        unique_filename: true,
        overwrite: false,
        context: filename ? { original_filename: String(filename).slice(0, 200) } : undefined
      },
      (error, result) => {
        if (error || !result) {
          // Cloudinary answers 4xx when the payload itself is bad (corrupt or
          // unsupported content). That is the caller's fault, not an outage,
          // so surface it as a 400 rather than a gateway error.
          const upstream = Number(error?.http_code) || 0;
          const clientFault = upstream >= 400 && upstream < 500;

          return reject(new CloudinaryError(
            clientFault
              ? 'That file could not be processed. Please upload a valid image or PDF.'
              : 'Upload to file storage failed.',
            { status: clientFault ? 400 : 502, cause: error }
          ));
        }
        return resolve(normalizeResult(result));
      }
    );

    stream.end(buffer);
  });
}

/** Uploads a `data:` URI (drawn signatures arrive this way) to Cloudinary. */
export async function uploadDataUri(dataUri, { folder, filename } = {}) {
  assertConfigured();

  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUri || '');
  if (!match) {
    throw new CloudinaryError('Malformed data URI.', { status: 400 });
  }

  const [, mime, isBase64, payload] = match;
  const buffer = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');

  // SVG is delivered as an image by Cloudinary but must be uploaded as such.
  const resourceType = mime === 'application/pdf' ? 'raw' : 'image';
  return uploadBuffer(buffer, { folder, resourceType, filename });
}

/**
 * Best-effort delete. Never throws: cleanup runs alongside database writes that
 * have already succeeded, and a failed delete must not fail the request.
 * Returns true when the asset is gone (or was already gone).
 */
export async function destroyAsset(publicId, resourceType = 'image') {
  if (!isCloudinaryConfigured || !isOwnedPublicId(publicId)) return false;

  // A stored resource type can be wrong (an id recorded as 'image' that was
  // actually uploaded as 'raw'), and Cloudinary answers 'not found' rather than
  // erroring in that case - so try the other type before believing it is gone.
  const order = resourceType === 'raw' ? ['raw', 'image'] : ['image', 'raw'];

  try {
    let everyAttemptNotFound = true;

    for (const type of order) {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: type,
        invalidate: true
      });

      if (result.result === 'ok') return true;
      if (result.result !== 'not found') everyAttemptNotFound = false;
    }

    // Nothing to delete under either type: the asset is genuinely absent.
    return everyAttemptNotFound;
  } catch (error) {
    console.error(`Cloudinary cleanup failed for ${publicId}:`, error.message);
    return false;
  }
}

/** Best-effort bulk cleanup for `[{ publicId, resourceType }]`. */
export async function destroyAssets(assets = []) {
  const targets = assets.filter(asset => asset && isOwnedPublicId(asset.publicId));
  if (targets.length === 0) return 0;

  const results = await Promise.all(
    targets.map(asset => destroyAsset(asset.publicId, asset.resourceType))
  );
  return results.filter(Boolean).length;
}

export { cloudinary };
