import crypto from 'node:crypto';
import { all, get, insert, nowIso, run } from './db.js';
import { bad, nowIso as iso, sha256 } from './util.js';

const SESSION_DAYS = 30;
export const COOKIE_NAME = 'sv_session';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, salt, expected] = String(stored).split('$');
    if (scheme !== 'scrypt' || !salt || !expected) return false;
    const derived = crypto.scryptSync(password, salt, 64);
    const expectedBuffer = Buffer.from(expected, 'hex');
    return derived.length === expectedBuffer.length && crypto.timingSafeEqual(derived, expectedBuffer);
  } catch {
    return false;
  }
}

export { hashPassword, verifyPassword };

export function createSession(userId, userAgent = '') {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  insert('INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent) VALUES (?,?,?,?,?)', [
    sha256(token),
    userId,
    iso(),
    expires,
    String(userAgent).slice(0, 200),
  ]);
  return { token, expires };
}

export function destroySession(token) {
  if (!token) return;
  run('DELETE FROM sessions WHERE id = ?', [sha256(token)]);
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

export function sessionCookie(token, expires) {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${new Date(expires).toUTCString()}`,
  ];
  if (process.env.NODE_ENV === 'production') attrs.push('Secure');
  return attrs.join('; ');
}

export function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function userFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const row = get(
    `SELECT u.*, s.expires_at AS session_expires FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
    [sha256(token)]
  );
  if (!row) return null;
  if (new Date(row.session_expires).getTime() < Date.now()) {
    run('DELETE FROM sessions WHERE id = ?', [sha256(token)]);
    return null;
  }
  if (row.suspended) {
    const { password_hash, session_expires, ...rest } = row;
    return { ...rest, suspended: true, session_valid: false };
  }
  const { password_hash, session_expires, ...rest } = row;
  return { ...rest, suspended: false, session_valid: true };
}

export function attachUser(req, _res, next) {
  req.user = userFromRequest(req);
  if (req.user && !req.user.session_valid) {
    // Suspended accounts keep a session record but cannot act.
    req.user = null;
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(bad('Necesitas iniciar sesión para continuar.', 401));
  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(bad('Necesitas iniciar sesión para continuar.', 401));
    if (!roles.includes(req.user.role)) return next(bad('No tienes permisos para esta acción.', 403));
    next();
  };
}

export function requireInstructor(req, _res, next) {
  if (!req.user) return next(bad('Necesitas iniciar sesión para continuar.', 401));
  const allowed = req.user.role === 'admin' || (req.user.role === 'instructor' && req.user.instructor_status === 'approved');
  if (!allowed) return next(bad('Necesitas ser instructor aprobado para acceder al estudio de creación.', 403));
  next();
}

export function count(table, where = '', params = []) {
  const row = get(`SELECT COUNT(*) AS total FROM ${table} ${where}`, params);
  return row ? Number(row.total) : 0;
}

export function userStats(userId) {
  const followers = count('follows', 'WHERE following_id = ?', [userId]);
  const following = count('follows', 'WHERE follower_id = ?', [userId]);
  const projects = count('projects', 'WHERE user_id = ?', [userId]);
  const certificates = count('certificates', 'WHERE user_id = ? AND revoked = 0', [userId]);
  const enrolled = count('enrollments', 'WHERE user_id = ?', [userId]);
  return { followers, following, projects, certificates, enrolled };
}

export function issuedCertificates(userId) {
  return all('SELECT * FROM certificates WHERE user_id = ? AND revoked = 0 ORDER BY issued_at DESC', [userId]);
}

export function newCertificateCode() {
  return `SV-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

export { nowIso };
