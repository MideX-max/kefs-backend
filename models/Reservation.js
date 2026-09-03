import mongoose from 'mongoose';
import { CASE_INSENSITIVE } from '../db/collation.js';

// Dates are stored as `YYYY-MM-DD` and times as `HH:MM` strings. Both formats
// sort lexicographically in chronological order, so range queries behave the
// same way the DATE/TIME columns did in the previous PostgreSQL schema.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

const reservationSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    passId: { type: String, required: true, unique: true },
    guestName: { type: String, required: true },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    guestCount: { type: Number, required: true, default: 1, min: 1 },
    purpose: { type: String, default: 'Apartment Stay' },
    flat: { type: String, required: true },
    checkInDate: { type: String, required: true, match: DATE_PATTERN },
    checkOutDate: { type: String, required: true, match: DATE_PATTERN },
    checkInTime: { type: String, required: true, default: '14:00', match: TIME_PATTERN },
    checkOutTime: { type: String, required: true, default: '11:00', match: TIME_PATTERN },
    idType: { type: String, default: '' },
    idNumber: { type: String, default: '' },
    idDocumentName: { type: String, default: '' },
    idDocumentUrl: { type: String, default: '' },
    photoUrl: { type: String, default: '' },
    signatureUrl: { type: String, default: '' },
    managerSignatureUrl: { type: String, default: '' },
    // Airbnb booking evidence, captured during registration.
    airbnbBooking: { type: Boolean, default: false },
    airbnbScreenshotUrl: { type: String, default: '' },
    airbnbScreenshotName: { type: String, default: '' },
    // Cloudinary public ids, kept so replaced or reset assets can be destroyed.
    idDocumentPublicId: { type: String, default: '' },
    idDocumentResourceType: { type: String, default: '' },
    photoPublicId: { type: String, default: '' },
    photoResourceType: { type: String, default: '' },
    signaturePublicId: { type: String, default: '' },
    signatureResourceType: { type: String, default: '' },
    airbnbScreenshotPublicId: { type: String, default: '' },
    airbnbScreenshotResourceType: { type: String, default: '' },
    status: { type: String, required: true },
    autoApproved: { type: Boolean, required: true, default: false },
    verificationNotes: { type: String, default: '' },
    submittedBy: { type: String, default: 'Guest / Representative' }
  },
  { collection: 'reservations', timestamps: true, versionKey: false }
);

// Mirrors the reservations_valid_date_range CHECK constraint.
reservationSchema.pre('validate', async function enforceDateRange() {
  if (this.checkInDate && this.checkOutDate && this.checkOutDate <= this.checkInDate) {
    throw new Error('Check-out date must be strictly after check-in date.');
  }
  
  // For Airbnb bookings, set defaults for required fields
  if (this.airbnbBooking) {
    if (!this.flat) this.flat = 'Airbnb Booking';
    if (!this.phone) this.phone = '';
  }
});

reservationSchema.index(
  { flat: 1, checkInDate: 1, checkOutDate: 1 },
  { name: 'reservations_flat_dates_idx', collation: CASE_INSENSITIVE }
);
reservationSchema.index({ status: 1 }, { name: 'reservations_status_idx' });
// Lets the upload-delete route check whether an asset is still referenced.
reservationSchema.index(
  { idDocumentPublicId: 1, photoPublicId: 1, signaturePublicId: 1, airbnbScreenshotPublicId: 1 },
  { name: 'reservations_asset_ids_idx', sparse: true }
);
reservationSchema.index({ createdAt: -1 }, { name: 'reservations_created_at_idx' });

export const Reservation = mongoose.model('Reservation', reservationSchema);
