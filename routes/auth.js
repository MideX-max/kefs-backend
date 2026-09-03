import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { storage } from '../store/storage.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '8h';
const GUEST_ACCESS_PASSWORD = process.env.GUEST_ACCESS_PASSWORD;
const GUEST_TOKEN_TTL = process.env.GUEST_TOKEN_EXPIRES_IN || '2h';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required. Generate a long random value and set it in backend/.env.');
}

if (!GUEST_ACCESS_PASSWORD) {
  throw new Error('GUEST_ACCESS_PASSWORD is required. Set a strong guest-registration password in backend/.env.');
}

// Compared against when no account matches, so that an unknown email costs the
// same time as a wrong password and cannot be enumerated.
const DUMMY_HASH = bcrypt.hashSync('invalid-placeholder-password', 12);

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: 'Too many login attempts. Please wait and try again.'
});

const guestAccessLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: 'Too many guest access attempts. Please wait and try again.'
});

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Access token required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token.' });
    }

    req.user = user;
    return next();
  });
};

export const authenticateGuestToken = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Guest access token required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || user?.scope !== 'guest-registration') {
      return res.status(403).json({ message: 'Invalid or expired guest access token.' });
    }

    req.guestAccess = user;
    return next();
  });
};

function passwordsMatch(attempt, expected) {
  const attemptBuffer = Buffer.from(String(attempt || ''), 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return attemptBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(attemptBuffer, expectedBuffer);
}

function publicAdmin(admin) {
  const { passwordHash, ...adminData } = admin;
  return adminData;
}

router.post('/guest-access', guestAccessLimiter, asyncHandler(async (req, res) => {
  const { password } = req.body;

  if (!passwordsMatch(password, GUEST_ACCESS_PASSWORD)) {
    return res.status(401).json({ message: 'Incorrect access password.' });
  }

  const token = jwt.sign({ scope: 'guest-registration' }, JWT_SECRET, { expiresIn: GUEST_TOKEN_TTL });
  const decoded = jwt.decode(token);

  return res.json({
    message: 'Guest access granted.',
    token,
    expiresAt: decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null
  });
}));

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const admin = await storage.getAdminByEmail(email);
  const isPasswordValid = admin?.passwordHash
    ? await bcrypt.compare(String(password), admin.passwordHash)
    : await bcrypt.compare(String(password), DUMMY_HASH);

  if (!admin || !isPasswordValid) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const token = jwt.sign(
    { id: admin.id, email: admin.email, role: admin.role, name: admin.name },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );

  return res.json({
    message: 'Login successful',
    token,
    user: publicAdmin(admin)
  });
}));

router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  const admin = await storage.getAdminById(req.user.id);

  if (!admin) {
    return res.status(404).json({ message: 'Administrator account no longer exists.' });
  }

  return res.json(publicAdmin(admin));
}));

router.put('/settings', authenticateToken, asyncHandler(async (req, res) => {
  const updates = { ...req.body };

  if (updates.newPassword) {
    if (String(updates.newPassword).length < 10) {
      return res.status(400).json({ message: 'New password must be at least 10 characters.' });
    }

    updates.passwordHash = await bcrypt.hash(String(updates.newPassword), 12);
    delete updates.newPassword;
  }

  const updatedAdmin = await storage.updateAdmin(req.user.id, updates);

  if (!updatedAdmin) {
    return res.status(404).json({ message: 'Administrator account no longer exists.' });
  }

  return res.json({ message: 'Settings updated successfully', admin: publicAdmin(updatedAdmin) });
}));

export default router;
