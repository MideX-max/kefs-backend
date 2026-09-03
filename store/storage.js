import 'dotenv/config';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { connectToDatabase, disconnectFromDatabase, mongoose } from '../db/connection.js';
import { CASE_INSENSITIVE } from '../db/collation.js';
import { Admin } from '../models/Admin.js';
import { Flat } from '../models/Flat.js';
import { Reservation } from '../models/Reservation.js';
import { DEFAULT_MANAGER_SIGNATURE, INITIAL_MANAGERS, INITIAL_FLATS } from '../data/seedData.js';
import {
  FOLDERS,
  destroyAssets,
  isCloudinaryConfigured,
  isDataUri,
  uploadDataUri
} from '../services/cloudinary.js';

function toDateOnly(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const raw = String(value).trim();
  const parts = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!parts) return raw.slice(0, 10);

  const [, year, month, day] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function toTimeOnly(value, fallback) {
  if (!value) return fallback;

  const parts = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!parts) return fallback;

  const [, hours, minutes] = parts;
  return `${hours.padStart(2, '0')}:${minutes}`;
}

function todayDateOnly() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function cleanString(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function isTerminalStatus(status) {
  return status === 'Rejected' || status === 'Pending Review';
}

function generateRecordId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function generatePassId() {
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `KAS-${dateStamp}-${suffix}`;
}

function validateDateRange(checkInDate, checkOutDate) {
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);

  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
    throw new Error('A valid check-in and check-out date are required.');
  }

  if (checkOut <= checkIn) {
    throw new Error('Check-out date must be strictly after check-in date.');
  }
}

function toIsoString(value) {
  if (!value) return value;
  return value instanceof Date ? value.toISOString() : value;
}

function adminFromDoc(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    name: doc.name,
    role: doc.role,
    email: doc.email,
    passwordHash: doc.passwordHash,
    phone: doc.phone || '',
    estateName: doc.estateName,
    estateAddress: doc.estateAddress,
    gateContact: doc.gateContact,
    defaultSignature: doc.defaultSignature || DEFAULT_MANAGER_SIGNATURE,
    defaultSignaturePublicId: doc.defaultSignaturePublicId || '',
    autoApprovalEnabled: doc.autoApprovalEnabled,
    strictIdCheck: doc.strictIdCheck,
    notificationEmail: doc.notificationEmail || ''
  };
}

function reservationFromDoc(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    passId: doc.passId,
    guestName: doc.guestName,
    email: doc.email || '',
    phone: doc.phone || '',
    guestCount: Number(doc.guestCount || 1),
    purpose: doc.purpose || 'Apartment Stay',
    flat: doc.flat,
    checkInDate: toDateOnly(doc.checkInDate),
    checkOutDate: toDateOnly(doc.checkOutDate),
    checkInTime: toTimeOnly(doc.checkInTime, '14:00'),
    checkOutTime: toTimeOnly(doc.checkOutTime, '11:00'),
    idType: doc.idType || 'National Identification Number (NIN)',
    idNumber: doc.idNumber || '',
    idDocumentName: doc.idDocumentName || '',
    idDocumentUrl: doc.idDocumentUrl || '',
    photoUrl: doc.photoUrl || '',
    signatureUrl: doc.signatureUrl || '',
    managerSignatureUrl: doc.managerSignatureUrl || DEFAULT_MANAGER_SIGNATURE,
    airbnbBooking: Boolean(doc.airbnbBooking),
    airbnbScreenshotUrl: doc.airbnbScreenshotUrl || '',
    airbnbScreenshotName: doc.airbnbScreenshotName || '',
    idDocumentPublicId: doc.idDocumentPublicId || '',
    photoPublicId: doc.photoPublicId || '',
    signaturePublicId: doc.signaturePublicId || '',
    airbnbScreenshotPublicId: doc.airbnbScreenshotPublicId || '',
    status: doc.status,
    autoApproved: doc.autoApproved,
    verificationNotes: doc.verificationNotes || '',
    createdAt: toIsoString(doc.createdAt),
    submittedBy: doc.submittedBy || 'Guest / Representative'
  };
}

function flatFromDoc(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    name: doc.name,
    block: doc.block,
    floor: doc.floor,
    type: doc.type,
    status: doc.status,
    currentGuest: doc.currentGuest || null,
    currentPassId: doc.currentPassId || null,
    description: doc.description || ''
  };
}

export function redactReservationForPublic(reservation) {
  if (!reservation) return null;
  return {
    id: reservation.id,
    passId: reservation.passId,
    guestName: reservation.guestName,
    flat: reservation.flat,
    checkInDate: reservation.checkInDate,
    checkOutDate: reservation.checkOutDate,
    checkInTime: reservation.checkInTime,
    checkOutTime: reservation.checkOutTime,
    status: reservation.status,
    managerSignatureUrl: reservation.managerSignatureUrl,
    signatureUrl: reservation.status === 'Pending Review' ? '' : reservation.signatureUrl,
    createdAt: reservation.createdAt
  };
}

// The four media slots a reservation carries. Each maps a public URL field to
// the Cloudinary bookkeeping fields that let us clean the asset up later.
const RESERVATION_MEDIA = [
  { url: 'idDocumentUrl', publicId: 'idDocumentPublicId', resourceType: 'idDocumentResourceType', folder: FOLDERS.idDocument },
  { url: 'photoUrl', publicId: 'photoPublicId', resourceType: 'photoResourceType', folder: FOLDERS.photo },
  { url: 'signatureUrl', publicId: 'signaturePublicId', resourceType: 'signatureResourceType', folder: FOLDERS.signature },
  { url: 'airbnbScreenshotUrl', publicId: 'airbnbScreenshotPublicId', resourceType: 'airbnbScreenshotResourceType', folder: FOLDERS.booking }
];

/**
 * Works out what should be stored for one media slot, uploading to Cloudinary
 * when the incoming value is an inline `data:` URI (drawn signatures arrive
 * that way). Returns the fields to persist plus any asset the change orphans.
 *
 * The built-in manager signature is a bundled `data:` SVG rather than user
 * content, so it is stored inline and never uploaded.
 */
async function resolveMediaSlot({ incomingUrl, incomingPublicId, incomingResourceType, existing, folder, filename }) {
  const previous = {
    url: existing?.url || '',
    publicId: existing?.publicId || '',
    resourceType: existing?.resourceType || ''
  };

  // Field absent from the payload: leave the slot exactly as it is.
  if (incomingUrl === undefined || incomingUrl === null) {
    return { fields: null, orphaned: null };
  }

  const value = String(incomingUrl).trim();

  if (value === previous.url && !isDataUri(value)) {
    return { fields: null, orphaned: null };
  }

  const orphaned = previous.publicId
    ? { publicId: previous.publicId, resourceType: previous.resourceType }
    : null;

  if (value === '') {
    return { fields: { url: '', publicId: '', resourceType: '' }, orphaned };
  }

  if (value === DEFAULT_MANAGER_SIGNATURE) {
    return { fields: { url: value, publicId: '', resourceType: '' }, orphaned };
  }

  if (isDataUri(value)) {
    if (!isCloudinaryConfigured) {
      throw new Error('File storage is not configured, so signatures and images cannot be saved.');
    }

    const asset = await uploadDataUri(value, { folder, filename });
    return {
      fields: { url: asset.url, publicId: asset.publicId, resourceType: asset.resourceType },
      orphaned
    };
  }

  // Already-hosted URL (normally one this app just uploaded via /api/upload).
  // PDFs are stored as 'raw', so trust the reported type and fall back to the
  // URL path segment rather than assuming every asset is an image.
  const publicId = cleanString(incomingPublicId);
  const reported = cleanString(incomingResourceType);
  const fromUrl = /\/(image|raw|video)\/upload\//.exec(value)?.[1] || '';

  return {
    fields: {
      url: value,
      publicId,
      resourceType: publicId ? (reported || fromUrl || 'image') : ''
    },
    orphaned
  };
}

class StorageEngine {
  async init() {
    await connectToDatabase();
    await mongoose.connection.db.admin().command({ ping: 1 });
    await this.migrate();
    await this.seedFlats();
    await this.seedAdmin();
  }

  async close() {
    await disconnectFromDatabase();
  }

  // MongoDB creates collections lazily, so "migrating" means making sure the
  // schema-declared indexes (uniqueness + lookup paths) exist on the server.
  async migrate() {
    await Promise.all([Admin.syncIndexes(), Flat.syncIndexes(), Reservation.syncIndexes()]);
  }

  async dropAllTables() {
    for (const model of [Reservation, Flat, Admin]) {
      await model.collection.drop().catch(error => {
        if (error.codeName !== 'NamespaceNotFound') throw error;
      });
    }
  }

  async seedFlats() {
    for (const flat of INITIAL_FLATS) {
      await Flat.updateOne(
        { _id: flat.id },
        {
          $set: {
            name: flat.name,
            block: flat.block,
            floor: flat.floor,
            type: flat.type,
            description: flat.description
          },
          // Occupancy fields are only applied on insert so existing state survives reseeds,
          // matching the previous ON CONFLICT (id) DO UPDATE clause.
          $setOnInsert: {
            status: flat.status,
            currentGuest: flat.currentGuest,
            currentPassId: flat.currentPassId
          }
        },
        { upsert: true }
      );
    }
  }

  async seedAdmin() {
    const existing = await Admin.countDocuments({});
    if (existing > 0) return;

    // Seed multiple managers with their specific passwords
    for (const manager of INITIAL_MANAGERS) {
      const passwordHash = await bcrypt.hash(manager.password, 12);

      await Admin.updateOne(
        { email: manager.email },
        {
          $setOnInsert: {
            _id: manager.id,
            name: manager.name,
            role: manager.role,
            email: manager.email,
            passwordHash,
            phone: manager.phone,
            estateName: manager.estateName,
            estateAddress: manager.estateAddress,
            gateContact: manager.gateContact,
            defaultSignature: manager.defaultSignature,
            autoApprovalEnabled: manager.autoApprovalEnabled,
            strictIdCheck: manager.strictIdCheck,
            notificationEmail: manager.notificationEmail,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        },
        { upsert: true, timestamps: false }
      );
    }

    console.log('Created development manager accounts:');
    for (const manager of INITIAL_MANAGERS) {
      console.warn(`  email: ${manager.email}`);
      console.warn(`  password: ${manager.password}`);
    }
    console.warn('For production, set individual manager passwords in environment variables.');
  }

  computeStatus(reservation) {
    if (isTerminalStatus(reservation.status)) return reservation.status;

    const now = new Date();
    const checkIn = new Date(`${reservation.checkInDate}T${reservation.checkInTime || '00:00'}:00`);
    const checkOut = new Date(`${reservation.checkOutDate}T${reservation.checkOutTime || '23:59'}:00`);

    if (now > checkOut) return 'Expired';
    if (now >= checkIn && now <= checkOut) return 'Active';
    return 'Upcoming';
  }

  withDynamicStatus(reservation) {
    if (!reservation) return null;
    return { ...reservation, status: this.computeStatus(reservation) };
  }

  /**
   * Resolves every media slot on a reservation payload against what is already
   * stored, returning the fields to persist and the assets left orphaned.
   */
  async resolveReservationMedia(payload, existingDoc = null) {
    const fields = {};
    const orphaned = [];

    for (const slot of RESERVATION_MEDIA) {
      const result = await resolveMediaSlot({
        incomingUrl: payload[slot.url],
        incomingPublicId: payload[slot.publicId],
        incomingResourceType: payload[slot.resourceType],
        existing: existingDoc
          ? {
            url: existingDoc[slot.url],
            publicId: existingDoc[slot.publicId],
            resourceType: existingDoc[slot.resourceType]
          }
          : null,
        folder: slot.folder,
        filename: payload.idDocumentName
      });

      if (result.fields) {
        fields[slot.url] = result.fields.url;
        fields[slot.publicId] = result.fields.publicId;
        fields[slot.resourceType] = result.fields.resourceType;
      }
      if (result.orphaned) orphaned.push(result.orphaned);
    }

    return { fields, orphaned };
  }

  /** True when a saved record still points at this Cloudinary asset. */
  async findAssetReference(publicId) {
    if (!publicId) return null;

    const reservation = await Reservation.findOne({
      $or: [
        { idDocumentPublicId: publicId },
        { photoPublicId: publicId },
        { signaturePublicId: publicId },
        { airbnbScreenshotPublicId: publicId }
      ]
    }).select('_id').lean();

    if (reservation) return { type: 'reservation', id: reservation._id };

    const admin = await Admin.findOne({ defaultSignaturePublicId: publicId }).select('_id').lean();
    if (admin) return { type: 'admin', id: admin._id };

    return null;
  }

  /** Every Cloudinary asset referenced by the database, for bulk cleanup. */
  async collectAllAssets() {
    const [reservations, admins] = await Promise.all([
      Reservation.find({}).select(
        'idDocumentPublicId idDocumentResourceType photoPublicId photoResourceType ' +
        'signaturePublicId signatureResourceType airbnbScreenshotPublicId airbnbScreenshotResourceType'
      ).lean(),
      Admin.find({}).select('defaultSignaturePublicId defaultSignatureResourceType').lean()
    ]);

    const assets = [];
    for (const doc of reservations) {
      for (const slot of RESERVATION_MEDIA) {
        if (doc[slot.publicId]) {
          assets.push({ publicId: doc[slot.publicId], resourceType: doc[slot.resourceType] });
        }
      }
    }
    for (const doc of admins) {
      if (doc.defaultSignaturePublicId) {
        assets.push({ publicId: doc.defaultSignaturePublicId, resourceType: doc.defaultSignatureResourceType });
      }
    }
    return assets;
  }

  // Replaces the flat -> flats(name) foreign key that PostgreSQL enforced.
  async assertFlatExists(flatName) {
    const exists = await Flat.exists({ name: flatName });
    if (!exists) {
      throw new Error(`Flat "${flatName}" does not exist.`);
    }
  }

  async checkFlatConflict(flatName, checkInDate, checkOutDate, excludeReservationId = null) {
    if (!flatName || !checkInDate || !checkOutDate) return null;
    validateDateRange(checkInDate, checkOutDate);

    const from = toDateOnly(checkInDate);
    const to = toDateOnly(checkOutDate);

    const query = {
      flat: cleanString(flatName),
      status: { $nin: ['Rejected', 'Expired'] },
      checkOutDate: { $gte: todayDateOnly(), $gt: from },
      checkInDate: { $lt: to }
    };

    if (excludeReservationId) {
      query._id = { $ne: excludeReservationId };
      query.passId = { $ne: excludeReservationId };
    }

    const doc = await Reservation.findOne(query)
      .collation(CASE_INSENSITIVE)
      .sort({ createdAt: -1 })
      .lean();

    return this.withDynamicStatus(reservationFromDoc(doc));
  }

  async getReservations(filters = {}) {
    const docs = await Reservation.find().sort({ createdAt: -1 }).lean();
    let list = docs.map(doc => this.withDynamicStatus(reservationFromDoc(doc)));

    if (filters.status && filters.status !== 'All') {
      list = list.filter(reservation => reservation.status.toLowerCase() === filters.status.toLowerCase());
    }

    if (filters.flat && filters.flat !== 'All') {
      list = list.filter(reservation => reservation.flat.toLowerCase() === filters.flat.toLowerCase());
    }

    if (filters.search) {
      const q = filters.search.toLowerCase().trim();
      list = list.filter(reservation =>
        reservation.guestName.toLowerCase().includes(q) ||
        reservation.passId.toLowerCase().includes(q) ||
        reservation.flat.toLowerCase().includes(q) ||
        reservation.phone.includes(q) ||
        reservation.email.toLowerCase().includes(q)
      );
    }

    return list;
  }

  async getReservationByIdOrPassId(identifier) {
    if (!identifier) return null;

    const doc = await Reservation.findOne({ $or: [{ _id: identifier }, { passId: identifier }] })
      .collation(CASE_INSENSITIVE)
      .lean();

    return this.withDynamicStatus(reservationFromDoc(doc));
  }

  async createReservation(payload) {
    const guestName = cleanString(payload.guestName);
    const flat = cleanString(payload.flat);
    const phone = cleanString(payload.phone) || '';
    const checkInDate = toDateOnly(payload.checkInDate);
    const checkOutDate = toDateOnly(payload.checkOutDate);
    const isAirbnb = Boolean(payload.airbnbBooking);

    // For Airbnb bookings, only require guest name and Airbnb document
    if (isAirbnb) {
      if (!guestName) {
        throw new Error('Guest Name is required for Airbnb bookings.');
      }
      if (!cleanString(payload.airbnbScreenshotUrl)) {
        throw new Error('Airbnb booking document is required.');
      }
    } else {
      // Normal registration requirements
      if (!guestName || !flat || !phone || !checkInDate || !checkOutDate) {
        throw new Error('Full Name, Phone Number, Flat, Check-in Date, and Check-out Date are required.');
      }
    }

    validateDateRange(checkInDate, checkOutDate);

    // Only check flat conflict and assert flat exists for non-Airbnb bookings
    if (!isAirbnb) {
      const conflict = await this.checkFlatConflict(flat, checkInDate, checkOutDate);
      if (conflict) {
        throw new Error(`Flat "${flat}" is already booked for those dates.`);
      }
      await this.assertFlatExists(flat);
    }

    const admin = await this.getAdmin();

    // For Airbnb bookings, use Airbnb screenshot as ID document
    if (isAirbnb && cleanString(payload.airbnbScreenshotUrl)) {
      payload.idDocumentUrl = payload.airbnbScreenshotUrl;
      payload.idDocumentPublicId = payload.airbnbScreenshotPublicId;
      payload.idDocumentResourceType = payload.airbnbScreenshotResourceType;
      payload.idDocumentName = payload.airbnbScreenshotName;
    }

    // Push any inline data: URIs (drawn signatures) up to Cloudinary first, so
    // what lands in the database is always a hosted URL plus its public id.
    const { fields: media } = await this.resolveReservationMedia(payload, null);

    // For Airbnb, the Airbnb document serves as identity verification
    const hasIdentity = isAirbnb 
      ? Boolean(cleanString(payload.airbnbScreenshotUrl))
      : Boolean(cleanString(media.idDocumentUrl) || cleanString(payload.idNumber));
    
    const hasSignature = Boolean(cleanString(media.signatureUrl));
    const autoApproved = isAirbnb ? hasIdentity : (hasIdentity && hasSignature);
    const verificationNotes = autoApproved
      ? (isAirbnb ? 'Airbnb booking verified and automatically approved.' : 'Automated validation passed all checks.')
      : 'Flagged: identity document/number and guest signature are required before approval.';

    const created = await Reservation.create({
      _id: generateRecordId('res'),
      passId: payload.passId || generatePassId(),
      guestName,
      email: cleanString(payload.email),
      phone: phone || '', // Allow empty phone for Airbnb
      guestCount: Math.max(1, Number.parseInt(payload.guestCount, 10) || 1),
      purpose: cleanString(payload.purpose, isAirbnb ? 'Airbnb Stay' : 'Apartment Stay'),
      flat,
      checkInDate,
      checkOutDate,
      checkInTime: toTimeOnly(payload.checkInTime, '14:00'),
      checkOutTime: toTimeOnly(payload.checkOutTime, '11:00'),
      idType: cleanString(payload.idType, isAirbnb ? 'Airbnb Verified' : 'National Identification Number (NIN)'),
      idNumber: cleanString(payload.idNumber) || (isAirbnb ? 'Airbnb Verified' : ''),
      idDocumentName: cleanString(payload.idDocumentName),
      airbnbBooking: isAirbnb,
      airbnbScreenshotName: cleanString(payload.airbnbScreenshotName),
      ...media,
      managerSignatureUrl: admin?.defaultSignature || DEFAULT_MANAGER_SIGNATURE,
      status: autoApproved ? 'Approved' : 'Pending Review',
      autoApproved,
      verificationNotes,
      submittedBy: cleanString(payload.submittedBy, 'Guest / Representative')
    });

    return this.withDynamicStatus(reservationFromDoc(created.toObject()));
  }

  async updateReservationStatus(id, newStatus, notes = '', actorId = null) {
    const admin = (await this.getAdminById(actorId)) || (await this.getAdmin());
    const update = { status: newStatus };

    // The previous SQL used COALESCE(NULLIF(notes, '')) so blank notes never
    // overwrote an existing verification note.
    if (cleanString(notes)) {
      update.verificationNotes = cleanString(notes);
    }

    if (newStatus === 'Approved') {
      update.managerSignatureUrl = admin?.defaultSignature || DEFAULT_MANAGER_SIGNATURE;
    }

    const doc = await Reservation.findOneAndUpdate(
      { $or: [{ _id: id }, { passId: id }] },
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    return this.withDynamicStatus(reservationFromDoc(doc));
  }

  async updateReservation(id, updates) {
    const existing = await this.getReservationByIdOrPassId(id);
    if (!existing) return null;

    const targetFlat = cleanString(updates.flat, existing.flat);
    const targetCheckIn = toDateOnly(updates.checkInDate || existing.checkInDate);
    const targetCheckOut = toDateOnly(updates.checkOutDate || existing.checkOutDate);

    validateDateRange(targetCheckIn, targetCheckOut);

    const conflict = await this.checkFlatConflict(targetFlat, targetCheckIn, targetCheckOut, id);
    if (conflict) {
      throw new Error(`Flat "${targetFlat}" is already booked during those dates.`);
    }

    await this.assertFlatExists(targetFlat);

    const existingDoc = await Reservation.findOne({ $or: [{ _id: id }, { passId: id }] }).lean();
    const { fields: media, orphaned } = await this.resolveReservationMedia(updates, existingDoc);

    const next = {
      guestName: cleanString(updates.guestName, existing.guestName),
      email: cleanString(updates.email, existing.email),
      phone: cleanString(updates.phone, existing.phone),
      guestCount: Math.max(1, Number.parseInt(updates.guestCount ?? existing.guestCount, 10) || 1),
      purpose: cleanString(updates.purpose, existing.purpose),
      flat: targetFlat,
      checkInDate: targetCheckIn,
      checkOutDate: targetCheckOut,
      checkInTime: toTimeOnly(updates.checkInTime, existing.checkInTime),
      checkOutTime: toTimeOnly(updates.checkOutTime, existing.checkOutTime),
      idType: cleanString(updates.idType, existing.idType),
      idNumber: cleanString(updates.idNumber, existing.idNumber),
      idDocumentName: cleanString(updates.idDocumentName, existing.idDocumentName),
      airbnbBooking: updates.airbnbBooking ?? existing.airbnbBooking,
      airbnbScreenshotName: cleanString(updates.airbnbScreenshotName, existing.airbnbScreenshotName),
      ...media,
      managerSignatureUrl: cleanString(updates.managerSignatureUrl, existing.managerSignatureUrl),
      status: cleanString(updates.status, existing.status),
      verificationNotes: cleanString(updates.verificationNotes, existing.verificationNotes),
      submittedBy: cleanString(updates.submittedBy, existing.submittedBy)
    };

    const doc = await Reservation.findOneAndUpdate(
      { $or: [{ _id: id }, { passId: id }] },
      { $set: next },
      { new: true, runValidators: true }
    ).lean();

    // Only bin the superseded files once the new state is safely persisted.
    if (doc) await destroyAssets(orphaned);

    return this.withDynamicStatus(reservationFromDoc(doc));
  }

  async getFlats() {
    const docs = await Flat.find().sort({ name: 1 }).lean();
    const reservations = await this.getReservations();
    const now = new Date();

    return docs.map(flatDoc => {
      const flat = flatFromDoc(flatDoc);
      const activeReservation = reservations.find(reservation => {
        if (reservation.flat.toLowerCase() !== flat.name.toLowerCase()) return false;
        if (reservation.status === 'Rejected' || reservation.status === 'Expired') return false;
        const start = new Date(`${reservation.checkInDate}T${reservation.checkInTime || '00:00'}:00`);
        const end = new Date(`${reservation.checkOutDate}T${reservation.checkOutTime || '23:59'}:00`);
        return now >= start && now <= end;
      });

      if (activeReservation) {
        return {
          ...flat,
          status: 'occupied',
          currentGuest: activeReservation.guestName,
          currentPassId: activeReservation.passId
        };
      }

      const upcomingReservation = reservations.find(reservation => {
        if (reservation.flat.toLowerCase() !== flat.name.toLowerCase()) return false;
        if (reservation.status === 'Rejected' || reservation.status === 'Expired') return false;
        const start = new Date(`${reservation.checkInDate}T${reservation.checkInTime || '00:00'}:00`);
        return now < start;
      });

      if (upcomingReservation) {
        return {
          ...flat,
          status: 'reserved',
          currentGuest: upcomingReservation.guestName,
          currentPassId: upcomingReservation.passId
        };
      }

      return { ...flat, status: flat.status || 'available', currentGuest: null, currentPassId: null };
    });
  }

  async addFlat(flatData) {
    const name = cleanString(flatData.name);
    if (!name) throw new Error('Flat name is required.');

    const created = await Flat.create({
      _id: generateRecordId('flat'),
      name,
      block: cleanString(flatData.block, 'Main Building'),
      floor: cleanString(flatData.floor, '1st Floor'),
      type: cleanString(flatData.type, 'Standard Suite'),
      status: 'available',
      description: cleanString(flatData.description)
    });

    return flatFromDoc(created.toObject());
  }

  async updateFlat(id, updates) {
    const existing = await Flat.findOne({ $or: [{ _id: id }, { name: id }] }).lean();
    if (!existing) return null;

    const next = {
      name: updates.name ? cleanString(updates.name) : existing.name,
      block: updates.block ? cleanString(updates.block) : existing.block,
      floor: updates.floor ? cleanString(updates.floor) : existing.floor,
      type: updates.type ? cleanString(updates.type) : existing.type,
      status: updates.status ? cleanString(updates.status) : existing.status,
      description: updates.description !== undefined ? cleanString(updates.description) : existing.description
    };

    const doc = await Flat.findOneAndUpdate(
      { _id: existing._id },
      { $set: next },
      { new: true, runValidators: true }
    ).lean();

    // Stands in for ON UPDATE CASCADE on the reservations.flat foreign key.
    if (doc && next.name !== existing.name) {
      await Reservation.updateMany({ flat: existing.name }, { $set: { flat: next.name } });
    }

    return flatFromDoc(doc);
  }

  // The primary manager: used as the "house" identity for signatures stamped on
  // guest-submitted reservations, where there is no authenticated actor.
  async getAdmin() {
    const doc = await Admin.findOne().sort({ createdAt: 1, _id: 1 }).lean();
    return adminFromDoc(doc);
  }

  async getAdminById(id) {
    if (!id) return null;
    const doc = await Admin.findById(id).lean();
    return adminFromDoc(doc);
  }

  async getAdminByEmail(email) {
    const normalized = cleanString(email);
    if (!normalized) return null;
    const doc = await Admin.findOne({ email: normalized }).collation(CASE_INSENSITIVE).lean();
    return adminFromDoc(doc);
  }

  async updateAdmin(id, updates) {
    const current = await this.getAdminById(id);
    if (!current) return null;

    const currentDoc = await Admin.findById(current.id).lean();

    // A manager who draws a new signature sends an inline data: URI; store it in
    // Cloudinary and drop the one it replaces.
    const signature = await resolveMediaSlot({
      incomingUrl: updates.defaultSignature,
      incomingPublicId: updates.defaultSignaturePublicId,
      existing: {
        url: currentDoc?.defaultSignature,
        publicId: currentDoc?.defaultSignaturePublicId,
        resourceType: currentDoc?.defaultSignatureResourceType
      },
      folder: FOLDERS.managerSignature,
      filename: `${current.id}-signature`
    });

    const next = {
      name: cleanString(updates.name, current.name),
      role: cleanString(updates.role, current.role),
      email: cleanString(updates.email, current.email),
      phone: cleanString(updates.phone, current.phone),
      estateName: cleanString(updates.estateName, current.estateName),
      estateAddress: cleanString(updates.estateAddress, current.estateAddress),
      gateContact: cleanString(updates.gateContact, current.gateContact),
      autoApprovalEnabled: updates.autoApprovalEnabled ?? current.autoApprovalEnabled,
      strictIdCheck: updates.strictIdCheck ?? current.strictIdCheck,
      notificationEmail: cleanString(updates.notificationEmail, current.notificationEmail)
    };

    if (signature.fields) {
      next.defaultSignature = signature.fields.url || DEFAULT_MANAGER_SIGNATURE;
      next.defaultSignaturePublicId = signature.fields.publicId;
      next.defaultSignatureResourceType = signature.fields.resourceType;
    }

    if (updates.passwordHash) {
      next.passwordHash = updates.passwordHash;
    }

    const doc = await Admin.findOneAndUpdate(
      { _id: current.id },
      { $set: next },
      { new: true, runValidators: true }
    ).lean();

    if (doc && signature.orphaned) await destroyAssets([signature.orphaned]);

    return adminFromDoc(doc);
  }

  async getStats() {
    const [reservations, flats] = await Promise.all([this.getReservations(), this.getFlats()]);
    const totalGuests = reservations.reduce((sum, reservation) => sum + (reservation.guestCount || 1), 0);
    const active = reservations.filter(reservation => reservation.status === 'Active').length;
    const upcoming = reservations.filter(reservation => reservation.status === 'Upcoming' || reservation.status === 'Approved').length;
    const pending = reservations.filter(reservation => reservation.status === 'Pending Review').length;
    const expired = reservations.filter(reservation => reservation.status === 'Expired').length;
    const occupiedFlats = flats.filter(flat => flat.status === 'occupied').length;

    return {
      totalReservations: reservations.length,
      totalGuests,
      activeReservations: active,
      upcomingReservations: upcoming,
      pendingReview: pending,
      expiredPasses: expired,
      totalFlats: flats.length,
      occupiedFlats,
      occupancyRate: flats.length > 0 ? Math.round((occupiedFlats / flats.length) * 100) : 0
    };
  }

  async resetAllData() {
    // Clear the hosted files before the rows that point at them, otherwise the
    // public ids are gone and the assets are orphaned in Cloudinary forever.
    const assets = await this.collectAllAssets();
    const removed = await destroyAssets(assets);
    if (assets.length) {
      console.log(`Reset: removed ${removed}/${assets.length} stored files from Cloudinary.`);
    }

    await Reservation.deleteMany({});
    await Flat.deleteMany({});
    await Admin.deleteMany({});

    await this.seedFlats();
    await this.seedAdmin();
    return { message: 'All data has been reset successfully' };
  }
}

export const storage = new StorageEngine();
