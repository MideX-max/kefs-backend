# KEFFI APARTMENT SUITES - Backend API

Express.js backend with MongoDB (via Mongoose) for the KEFFI APARTMENT SUITES Guest Management System.

MongoDB holds the data; **Cloudinary holds every uploaded image and file**.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your database configuration
# Start server
npm start
```

## 🔧 Environment Variables

Required variables in `.env`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/kas
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_FOLDER=keffi
MAX_UPLOAD_MB=10
JWT_SECRET=your_secure_random_string
JWT_EXPIRES_IN=8h
CORS_ORIGIN=http://localhost:5173
PORT=5000
NODE_ENV=development
```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/login` - Manager login (any seeded manager, matched by email)
- `GET /api/auth/me` - Get the signed-in manager (requires auth)
- `PUT /api/auth/settings` - Update the signed-in manager's settings (requires auth)

Every account in the `admins` collection is a real login. `/me` and `/settings`
resolve the manager from the JWT, so managers only ever read and edit their own
profile. Approving a reservation stamps the approving manager's signature.

### Reservations
- `GET /api/reservations` - Get all reservations (requires auth)
- `GET /api/reservations/:id` - Get reservation by ID or pass ID
- `POST /api/reservations` - Create new reservation
- `PATCH /api/reservations/:id/status` - Update reservation status (requires auth)
- `GET /api/reservations/check-conflict` - Check flat availability

### Flats
- `GET /api/flats` - Get all flats with live occupancy (public; the guest registration form uses it)
- `POST /api/flats` - Add new flat (requires auth)
- `PATCH /api/flats/:id` - Update flat (requires auth)

### Stats
- `GET /api/stats` - Get dashboard statistics (requires auth)
- `POST /api/stats/reset` - Reset all data (requires auth)

### Upload
- `POST /api/upload` - Upload a file to Cloudinary. Multipart field `file`, plus
  `kind` (`id-document` | `photo` | `signature` | `booking`) selecting the folder.
  Returns `{ fileUrl, publicId, resourceType, fileName, fileSize, mimetype }`.
- `DELETE /api/upload` - Delete an asset by `{ publicId, resourceType }`. Refuses
  ids outside the app's own folder; an asset attached to a saved reservation
  returns 409 unless the caller is an authenticated manager.

### Health
- `GET /api/health` - API health check

## 🗄️ Database Schema

### Collections
- `admins` - Administrator accounts
- `flats` - Apartment/suite inventory
- `reservations` - Guest bookings

Schemas live in `models/`, the connection helper in `db/`, and all data access
goes through `store/storage.js`. Collections, indexes and seed data are created
automatically on first run.

Data-model notes:
- `_id` holds the application-generated string ids (`res-<uuid>`, `flat-1`, `manager-001`),
  which are exposed to the API as `id`.
- Dates are stored as `YYYY-MM-DD` strings and times as `HH:MM` strings. Both sort
  lexicographically in chronological order, so availability range queries work directly.
- Flat-name matching uses an `en`/strength-2 collation for case-insensitive comparison.
- `reservations.flat` references `flats.name`. MongoDB has no foreign keys, so
  `storage.assertFlatExists()` rejects unknown flats and `storage.updateFlat()`
  propagates flat renames to existing reservations.

## 🖼️ File Storage (Cloudinary)

Cloudinary is the only place uploaded files live. Nothing is written to local
disk, and `server/uploads/` is no longer used or served.

**What gets uploaded**

| Content | Cloudinary folder | How it arrives |
|---|---|---|
| Guest ID documents | `<root>/id-documents` | `POST /api/upload` (`kind=id-document`) |
| Guest photos | `<root>/guest-photos` | `POST /api/upload` (`kind=photo`) |
| Guest signatures | `<root>/signatures` | uploaded image, or a drawn `data:` URI converted server-side |
| Manager signatures | `<root>/manager-signatures` | drawn in Settings, converted server-side |
| Airbnb booking screenshots | `<root>/booking-screenshots` | `POST /api/upload` (`kind=booking`) |

**How it works**

- The API secret is read from the environment in `services/cloudinary.js` and is
  never sent to the browser or returned by any route. The frontend only ever
  sees a `secure_url` and a `publicId`.
- Uploads are held in memory, checked against a MIME allowlist **and** verified
  by magic bytes, then streamed to Cloudinary. Cloudinary assigns the public id,
  so a hostile filename cannot steer the path.
- PDFs are stored as `raw`; everything else as `image`.
- Each stored URL is saved with its `publicId` and `resourceType`, which is what
  makes cleanup possible.
- **Cleanup**: replacing or clearing a file destroys the asset it superseded;
  `POST /api/stats/reset` destroys every referenced asset before dropping the
  rows. Deletes are best-effort and never fail the request that triggered them.
- Drawn signatures used to be stored inline as base64 `data:` URIs. They are now
  uploaded to Cloudinary. The one exception is the bundled default manager
  signature (an SVG shipped in `data/seedData.js`), which is not user content
  and stays inline.

**Limits and errors**

- `MAX_UPLOAD_MB` (default 10) - exceeding it returns **413**
- Disallowed type, or bytes that disagree with the declared type - **400**
- Content Cloudinary itself rejects as unprocessable - **400**
- Cloudinary unreachable - **502**; credentials missing - **503**

## 🔐 Security Features

- JWT authentication with configurable expiry
- Rate limiting on login attempts
- CORS configuration
- Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- Password hashing with bcrypt (12 rounds)
- Cloudinary API secret kept server-side; uploads validated by magic bytes
- Asset deletes restricted to the app's own Cloudinary folder
- Query injection prevention via schema-typed Mongoose models

## 🔄 Data Reset

The system includes a data reset function for periodic cleanup:

```bash
POST /api/stats/reset
```

This deletes all reservations, flats, and admins, then reseeds fresh data. Requires admin authentication.

## 📦 Scripts

```bash
npm start           # Start production server
npm run dev         # Start development server with hot reload
npm run reset       # Clear all data and reseed (same as POST /api/stats/reset)
npm run reset:full  # Drop collections, rebuild indexes, and reseed
```

## 🌐 Development

The server runs on port 5000 by default. In development mode, it uses file watching for automatic restarts.

API Health Check: http://localhost:5000/api/health
