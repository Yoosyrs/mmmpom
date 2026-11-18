import express from 'express';
import { get, insert, run, all } from '../db.js';
import {
  COOKIE_NAME,
  createSession,
  destroySession,
  hashPassword,
  parseCookies,
  requireAuth,
  sessionCookie,
  clearCookie,
  userStats,
  verifyPassword,
} from '../auth.js';
import {
  bad,
  dataUrlToBuffer,
  emailValid,
  nowIso,
  passwordProblem,
  rateLimit,
  randomToken,
  sanitizeUser,
  sha256,
  slugify,
  text,
} from '../util.js';
import { appUrl, emailConfigured, sendEmail } from '../services/email.js';

const router = express.Router();

function uniqueUsername(base, excludeId = null) {
  const seed = slugify(base) || 'aprendiz';
  let candidate = seed.slice(0, 24);
  let suffix = 0;
  while (true) {
    const row = excludeId
      ? get('SELECT id FROM users WHERE username = ? AND id <> ?', [candidate, excludeId])
      : get('SELECT id FROM users WHERE username = ?', [candidate]);
    if (!row) return candidate;
    suffix += 1;
    candidate = `${seed.slice(0, 20)}-${suffix}`;
  }
}

function sessionPayload(user) {
  const stats = userStats(user.id);
  return {
    user: sanitizeUser(user),
    stats,
    capabilities: {
      instructor: user.role === 'instructor' || user.role === 'admin',
      approvedInstructor: user.role === 'admin' || (user.role === 'instructor' && user.instructor_status === 'approved'),
      priceAuthorization: !!user.price_authorized,
      admin: user.role === 'admin',
      premium: user.plan === 'premium',
    },
  };
}

function validAvatar(dataUrl) {
  const { mime, buffer } = dataUrlToBuffer(dataUrl, 400 * 1024);
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
    throw bad('La fotografía debe ser PNG, JPEG o WebP.');
  }
  if (buffer.length < 64) throw bad('La imagen parece estar vacía.');
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

router.post('/register', async (req, res, next) => {
  try {
    const limit = rateLimit(`register:${req.ip}`, { limit: 8, windowMs: 10 * 60_000 });
    if (!limit.ok) throw bad('Demasiados intentos de registro. Espera unos minutos.', 429);

    const name = text(req.body?.name, 80);
    const email = text(req.body?.email, 160).toLowerCase();
    const password = req.body?.password;

    if (name.length < 2) throw bad('Escribe tu nombre (mínimo 2 caracteres).');
    if (!emailValid(email)) throw bad('El correo electrónico no es válido.');
    const problem = passwordProblem(password);
    if (problem) throw bad(problem);
    if (get('SELECT id FROM users WHERE email = ?', [email])) throw bad('Ya existe una cuenta con ese correo.', 409);

    const username = uniqueUsername(req.body?.username || name || email.split('@')[0]);
    const createdAt = nowIso();
    const userId = insert(
      `INSERT INTO users (email, username, name, password_hash, role, created_at) VALUES (?,?,?,?,?,?)`,
      [email, username, name, hashPassword(password), 'student', createdAt]
    );

    const { token, expires } = createSession(userId, req.headers['user-agent']);
    res.setHeader('Set-Cookie', sessionCookie(token, expires));

    await sendEmail({
      to: email,
      subject: 'Bienvenido a SKILLVERSE',
      body: `Hola ${name}:\n\nTu cuenta de SKILLVERSE está lista. Puedes explorar el catálogo, inscribirte a cursos gratuitos y publicar proyectos en el Laboratorio.\n\nTu nombre de usuario público es @${username}.\n\nAprende algo. Conviértete en algo.\n\n— Equipo SKILLVERSE`,
      kind: 'bienvenida',
    });

    const user = get('SELECT * FROM users WHERE id = ?', [userId]);
    res.status(201).json(sessionPayload(user));
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const limit = rateLimit(`login:${req.ip}`, { limit: 12, windowMs: 5 * 60_000 });
    if (!limit.ok) throw bad('Demasiados intentos. Espera unos minutos antes de volver a probar.', 429);

    const email = text(req.body?.email, 160).toLowerCase();
    const password = req.body?.password;
    if (!email || !password) throw bad('Escribe tu correo y contraseña.');

    const user = get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw bad('Correo o contraseña incorrectos.', 401);
    }
    if (user.suspended) throw bad('Esta cuenta está suspendida. Contacta a soporte desde el panel de administración.', 403);

    run('DELETE FROM sessions WHERE expires_at < ?', [nowIso()]);
    const { token, expires } = createSession(user.id, req.headers['user-agent']);
    res.setHeader('Set-Cookie', sessionCookie(token, expires));
    res.json(sessionPayload(user));
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie || '');
  destroySession(cookies[COOKIE_NAME]);
  res.setHeader('Set-Cookie', clearCookie());
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null, stats: null, capabilities: null });
  res.json(sessionPayload(req.user));
});

router.patch('/me', requireAuth, (req, res, next) => {
  try {
    const user = req.user;
    const updates = [];
    const params = [];

    if (req.body?.name !== undefined) {
      const name = text(req.body.name, 80);
      if (name.length < 2) throw bad('El nombre debe tener al menos 2 caracteres.');
      updates.push('name = ?');
      params.push(name);
    }
    if (req.body?.username !== undefined) {
      const username = uniqueUsername(req.body.username, user.id);
      updates.push('username = ?');
      params.push(username);
    }
    if (req.body?.bio !== undefined) {
      updates.push('bio = ?');
      params.push(text(req.body.bio, 800));
    }
    if (req.body?.headline !== undefined) {
      updates.push('headline = ?');
      params.push(text(req.body.headline, 120));
    }
    if (req.body?.location !== undefined) {
      updates.push('location = ?');
      params.push(text(req.body.location, 80));
    }
    if (req.body?.website !== undefined) {
      const website = text(req.body.website, 200);
      if (website && !/^https?:\/\//i.test(website)) throw bad('El sitio web debe comenzar con http:// o https://');
      updates.push('website = ?');
      params.push(website);
    }
    if (req.body?.avatar_url !== undefined) {
      const avatar = req.body.avatar_url ? validAvatar(req.body.avatar_url) : '';
      updates.push('avatar_url = ?');
      params.push(avatar);
    }
    for (const [field, column] of [
      ['privacy_profile', 'privacy_profile'],
      ['privacy_projects', 'privacy_projects'],
      ['privacy_certificates', 'privacy_certificates'],
    ]) {
      if (req.body?.[field] !== undefined) {
        const value = req.body[field] === 'private' ? 'private' : 'public';
        updates.push(`${column} = ?`);
        params.push(value);
      }
    }

    if (!updates.length) throw bad('No hay cambios para guardar.');
    params.push(user.id);
    run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    const updated = get('SELECT * FROM users WHERE id = ?', [user.id]);
    res.json(sessionPayload(updated));
  } catch (error) {
    next(error);
  }
});

router.post('/password', requireAuth, (req, res, next) => {
  try {
    const current = req.body?.current_password;
    const nextPassword = req.body?.new_password;
    if (!verifyPassword(current || '', req.user.password_hash || '')) {
      const fresh = get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
      if (!fresh || !verifyPassword(current || '', fresh.password_hash)) throw bad('La contraseña actual no es correcta.', 401);
    }
    const problem = passwordProblem(nextPassword);
    if (problem) throw bad(problem);
    run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(nextPassword), req.user.id]);
    run('DELETE FROM sessions WHERE user_id = ?', [req.user.id]);
    const { token, expires } = createSession(req.user.id, req.headers['user-agent']);
    res.setHeader('Set-Cookie', sessionCookie(token, expires));
    res.json({ ok: true, message: 'Contraseña actualizada. Las demás sesiones se cerraron.' });
  } catch (error) {
    next(error);
  }
});

router.post('/forgot', async (req, res, next) => {
  try {
    const limit = rateLimit(`forgot:${req.ip}`, { limit: 6, windowMs: 15 * 60_000 });
    if (!limit.ok) throw bad('Demasiadas solicitudes. Espera unos minutos.', 429);

    const email = text(req.body?.email, 160).toLowerCase();
    if (!emailValid(email)) throw bad('El correo electrónico no es válido.');

    const user = get('SELECT * FROM users WHERE email = ?', [email]);
    let delivery = { delivered: false, reason: 'account_not_found' };

    if (user) {
      const token = randomToken(24);
      insert('INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) VALUES (?,?,?,?)', [
        user.id,
        sha256(token),
        new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        nowIso(),
      ]);
      const link = `${appUrl(req)}/restablecer?token=${token}`;
      delivery = await sendEmail({
        to: email,
        subject: 'Recupera tu contraseña de SKILLVERSE',
        body: `Hola ${user.name}:\n\nRecibimos una solicitud para restablecer tu contraseña. El enlace es válido durante 60 minutos:\n\n${link}\n\nSi no fuiste tú, ignora este mensaje.\n\n— SKILLVERSE`,
        kind: 'recuperacion',
      });
    }

    res.json({
      ok: true,
      message:
        'Si el correo está registrado, enviamos un enlace de recuperación válido durante 60 minutos. Revisa también la carpeta de spam.',
      delivery: emailConfigured()
        ? delivery.delivered
          ? 'enviado'
          : 'no_entregado'
        : 'sin_proveedor_de_email',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/reset', (req, res, next) => {
  try {
    const token = text(req.body?.token, 200);
    const password = req.body?.password;
    if (!token) throw bad('El enlace de recuperación no es válido.');
    const problem = passwordProblem(password);
    if (problem) throw bad(problem);

    const record = get('SELECT * FROM password_resets WHERE token_hash = ?', [sha256(token)]);
    if (!record || record.used_at) throw bad('El enlace de recuperación no es válido o ya fue utilizado.', 400);
    if (new Date(record.expires_at).getTime() < Date.now()) throw bad('El enlace de recuperación expiró. Solicita uno nuevo.', 400);

    run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), record.user_id]);
    run('UPDATE password_resets SET used_at = ? WHERE id = ?', [nowIso(), record.id]);
    run('DELETE FROM sessions WHERE user_id = ?', [record.user_id]);
    res.json({ ok: true, message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  } catch (error) {
    next(error);
  }
});

router.delete('/me', requireAuth, (req, res, next) => {
  try {
    const password = req.body?.password;
    const fresh = get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!fresh || !verifyPassword(password || '', fresh.password_hash)) throw bad('Confirma tu contraseña para eliminar la cuenta.', 401);
    if (req.user.role === 'admin' && Number(get("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'")?.total) <= 1) {
      throw bad('No puedes eliminar la última cuenta administrativa.');
    }
    run('DELETE FROM users WHERE id = ?', [req.user.id]);
    res.setHeader('Set-Cookie', clearCookie());
    res.json({ ok: true, message: 'Cuenta eliminada junto con sus datos asociados.' });
  } catch (error) {
    next(error);
  }
});

export default router;
