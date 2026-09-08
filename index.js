import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config();

// Route and storage modules read environment variables at module load time (in
// particular, auth.js reads JWT_SECRET). Static imports are evaluated before
// this file's body, so load local modules only after the backend .env has been
// applied.
const [
  { isCloudinaryConfigured },
  { default: authRoutes },
  { default: flatRoutes },
  { default: reservationRoutes },
  { default: statsRoutes },
  { default: uploadRoutes },
  { storage }
] = await Promise.all([
  import('./services/cloudinary.js'),
  import('./routes/auth.js'),
  import('./routes/flats.js'),
  import('./routes/reservations.js'),
  import('./routes/stats.js'),
  import('./routes/upload.js'),
  import('./store/storage.js')
]);

const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(cors({
  origin(origin, callback) {
    // Allow all origins in development, if origin is empty (server-to-server/Postman), or if wildcard * is configured
    if (process.env.NODE_ENV === 'development' || !origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin not allowed by CORS.'));
  },
  credentials: true
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

app.use('/api/reservations', reservationRoutes);
app.use('/reservations', reservationRoutes);

app.use('/api/flats', flatRoutes);
app.use('/flats', flatRoutes);

app.use('/api/stats', statsRoutes);
app.use('/stats', statsRoutes);

app.use('/api/upload', uploadRoutes);
app.use('/upload', uploadRoutes);

const sendHealth = (req, res) => {
  res.json({
    status: 'online',
    app: 'KEFFI APARTMENT SUITES Guest Management System API',
    version: '1.0.0',
    fileStorage: isCloudinaryConfigured ? 'cloudinary' : 'unconfigured',
    timestamp: new Date().toISOString()
  });
};

app.get('/api/health', sendHealth);
app.get('/health', sendHealth);

// Root route for Vercel health check
app.get('/', (req, res) => {
  res.json({
    message: 'KEFFI APARTMENT SUITES Backend API',
    status: 'online',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth/*',
      reservations: '/api/reservations/*',
      flats: '/api/flats/*',
      stats: '/api/stats',
      upload: '/api/upload'
    }
  });
});

// Serve frontend build if dist exists
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(distPath));

// Catch-all for SPA client routing (prevent 404 on refresh when served together)
app.get('*', (req, res, next) => {
  const isApiRequest = 
    req.path.startsWith('/api') ||
    req.path.startsWith('/auth') ||
    req.path.startsWith('/reservations') ||
    req.path.startsWith('/flats') ||
    req.path.startsWith('/stats') ||
    req.path.startsWith('/upload') ||
    req.path.startsWith('/uploads') ||
    req.path.startsWith('/health');

  if (isApiRequest) {
    return next();
  }

  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      next();
    }
  });
});

app.use((err, req, res, next) => {
  void next;
  console.error('Unhandled API Error:', err);

  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        message: `File is too large. Maximum size is ${process.env.MAX_UPLOAD_MB || 10}MB.`
      });
    }
    return res.status(400).json({ message: err.message });
  }

  if (err.name === 'CloudinaryError') {
    return res.status(err.status || 502).json({ message: err.message });
  }

  // Errors that already carry a client-error status (e.g. a rejected upload
  // type) should surface as that status rather than a generic 500.
  if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ message: err.message });
  }

  if (err.message === 'Origin not allowed by CORS.') {
    return res.status(403).json({ message: err.message });
  }

  return res.status(500).json({
    message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
  });
});

// For Vercel serverless, we need to initialize storage before handling requests
let isStorageInitialized = false;

async function ensureStorageInitialized() {
  if (!isStorageInitialized) {
    await storage.init();
    isStorageInitialized = true;
  }
}

// Vercel serverless handler
export default async function handler(req, res) {
  await ensureStorageInitialized();
  return app(req, res);
}

// Local development server
async function startServer() {
  await storage.init();

  // Only start the server if not running in Vercel serverless environment
  if (process.env.VERCEL) {
    return;
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log('===================================================');
    console.log('  KEFFI APARTMENT SUITES BACKEND API RUNNING');
    console.log(`  Port: http://localhost:${PORT} / http://127.0.0.1:${PORT}`);
    console.log(`  API Health: http://localhost:${PORT}/api/health`);
    console.log('===================================================');
  });
}

startServer().catch(error => {
  console.error('Failed to start API server:', error.message);
  process.exit(1);
});
