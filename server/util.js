import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const bad = (message, status = 400) => new HttpError(status, message);

export function nowIso() {
  return new Date().toISOString();
}

export function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function emailValid(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.trim());
}

export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (!/[a-zA-Z]/.test(password)) return 'La contraseña debe incluir al menos una letra.';
  if (!/[0-9]/.test(password)) return 'La contraseña debe incluir al menos un número.';
  if (password.length > 200) return 'La contraseña es demasiado larga.';
  return null;
}

export function text(value, max = 4000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
}

export function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function bool(value) {
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

export function sanitizeUser(row) {
  if (!row) return null;
  const { password_hash, ...rest } = row;
  return {
    ...rest,
    suspended: !!rest.suspended,
  };
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function pagination(query, defaultLimit = 20, maxLimit = 60) {
  const limit = Math.min(Math.max(toInt(query.limit, defaultLimit), 1), maxLimit);
  const offset = Math.max(toInt(query.offset, 0), 0);
  return { limit, offset };
}

export function escapeLike(value) {
  return String(value || '').replace(/[%_]/g, (m) => `\\${m}`);
}

// Simple in-memory rate limiter (per process). Protects auth, uploads and AI calls.
const buckets = new Map();
export function rateLimit(key, { limit = 12, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((bucket.reset - now) / 1000) };
  }
  return { ok: true, remaining: limit - bucket.count };
}

export function publicUserCard(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    avatar_url: row.avatar_url,
    headline: row.headline,
    role: row.role,
    instructor_status: row.instructor_status,
  };
}

export function dataUrlToBuffer(dataUrl, maxBytes) {
  if (typeof dataUrl !== 'string') throw bad('Archivo inválido.');
  const match = /^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!match) throw bad('El archivo debe enviarse como data URL base64.');
  const mime = match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length) throw bad('El archivo está vacío.');
  if (buffer.length > maxBytes) throw bad(`El archivo supera el máximo de ${Math.round(maxBytes / (1024 * 1024))} MB.`);
  return { mime, buffer };
}
