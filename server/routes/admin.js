import express from 'express';
import { all, get, insert, run, nowIso } from '../db.js';
import { requireRole } from '../auth.js';
import { bad, pagination, text, toInt } from '../util.js';
import { COURSE_CARD_SELECT, courseCard } from '../services/courses.js';

const router = express.Router();
router.use(requireRole('admin'));

router.get('/overview', (_req, res) => {
  const totals = get(
    `SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE role = 'instructor') AS instructors,
      (SELECT COUNT(*) FROM users WHERE instructor_status = 'pending') AS pending_instructors,
      (SELECT COUNT(*) FROM courses) AS courses,
      (SELECT COUNT(*) FROM courses WHERE status = 'published') AS published_courses,
      (SELECT COUNT(*) FROM courses WHERE status = 'in_review') AS courses_in_review,
      (SELECT COUNT(*) FROM enrollments) AS enrollments,
      (SELECT COUNT(*) FROM certificates WHERE revoked = 0) AS certificates,
      (SELECT COUNT(*) FROM projects) AS projects,
      (SELECT COUNT(*) FROM posts) AS posts,
      (SELECT COUNT(*) FROM reports WHERE status = 'open') AS open_reports,
      (SELECT COUNT(*) FROM ads WHERE status = 'pending') AS pending_ads,
      (SELECT COUNT(*) FROM transactions WHERE status = 'paid') AS paid_transactions,
      (SELECT COALESCE(SUM(amount_cents),0) FROM transactions WHERE status = 'paid') AS gross_cents,
      (SELECT COALESCE(SUM(platform_fee_cents),0) FROM transactions WHERE status = 'paid') AS commission_cents,
      (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') AS active_subscriptions,
      (SELECT COUNT(*) FROM ai_messages) AS ai_messages`
  );
  res.json({
    totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Number(value || 0)])),
    recent_users: all('SELECT id, username, name, email, role, plan, created_at FROM users ORDER BY created_at DESC LIMIT 8'),
    pending_instructors: all(
      "SELECT id, username, name, email, instructor_application, instructor_applied_at FROM users WHERE instructor_status = 'pending' ORDER BY instructor_applied_at ASC"
    ),
    courses_in_review: all(
      `${COURSE_CARD_SELECT} WHERE c.status = 'in_review' ORDER BY c.updated_at ASC`
    ).map(courseCard),
  });
});

router.get('/users', (req, res) => {
  const { limit, offset } = pagination(req.query, 25, 100);
  const where = [];
  const params = [];
  if (req.query.role) {
    where.push('role = ?');
    params.push(text(req.query.role, 30));
  }
  if (req.query.q) {
    where.push('(name LIKE ? OR email LIKE ? OR username LIKE ?)');
    const like = `%${text(req.query.q, 80)}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  res.json({
    total: Number(get(`SELECT COUNT(*) AS total FROM users ${clause}`, params)?.total || 0),
    users: all(
      `SELECT id, username, name, email, role, plan, instructor_status, price_authorized, commission_rate, suspended, created_at
       FROM users ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ).map((user) => ({ ...user, suspended: !!user.suspended, price_authorized: !!user.price_authorized })),
  });
});

router.patch('/users/:id', (req, res, next) => {
  try {
    const user = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) throw bad('Usuario no encontrado.', 404);
    const updates = [];
    const params = [];

    if (req.body?.role !== undefined) {
      if (!['student', 'instructor', 'admin'].includes(req.body.role)) throw bad('Rol inválido.');
      if (user.role === 'admin' && req.body.role !== 'admin') {
        const admins = Number(get("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'")?.total || 0);
        if (admins <= 1) throw bad('No puedes quitar el rol al último administrador.');
      }
      updates.push('role = ?');
      params.push(req.body.role);
    }
    if (req.body?.suspended !== undefined) {
      if (user.id === req.user.id) throw bad('No puedes suspender tu propia cuenta.');
      updates.push('suspended = ?');
      params.push(req.body.suspended ? 1 : 0);
      if (req.body.suspended) run('DELETE FROM sessions WHERE user_id = ?', [user.id]);
    }
    if (req.body?.plan !== undefined) {
      if (!['free', 'premium', 'edu'].includes(req.body.plan)) throw bad('Plan inválido.');
      updates.push('plan = ?');
      params.push(req.body.plan);
    }
    if (req.body?.price_authorized !== undefined) {
      updates.push('price_authorized = ?');
      params.push(req.body.price_authorized ? 1 : 0);
    }
    if (req.body?.commission_rate !== undefined) {
      const rate = toInt(req.body.commission_rate, 20);
      if (rate < 0 || rate > 50) throw bad('La comisión debe estar entre 0 y 50 %.');
      updates.push('commission_rate = ?');
      params.push(rate);
    }
    if (req.body?.instructor_status !== undefined) {
      if (!['none', 'pending', 'approved', 'rejected'].includes(req.body.instructor_status)) throw bad('Estado de instructor inválido.');
      updates.push('instructor_status = ?');
      params.push(req.body.instructor_status);
    }
    if (!updates.length) throw bad('No hay cambios para guardar.');
    params.push(user.id);
    run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/users/:id', (req, res, next) => {
  try {
    const user = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) throw bad('Usuario no encontrado.', 404);
    if (user.id === req.user.id) throw bad('No puedes eliminar tu propia cuenta desde el panel.');
    if (user.role === 'admin') throw bad('No puedes eliminar otra cuenta administrativa desde aquí.');
    run('DELETE FROM users WHERE id = ?', [user.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/instructors', (_req, res) => {
  res.json({
    instructors: all(
      `SELECT id, username, name, email, role, instructor_status, price_authorized, commission_rate, instructor_application, instructor_applied_at,
        (SELECT COUNT(*) FROM courses c WHERE c.instructor_id = users.id) AS courses
       FROM users WHERE instructor_status <> 'none' OR role = 'instructor' ORDER BY instructor_applied_at DESC`
    ).map((user) => ({ ...user, price_authorized: !!user.price_authorized })),
  });
});

router.post('/instructors/:id/review', (req, res, next) => {
  try {
    const user = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) throw bad('Usuario no encontrado.', 404);
    const action = req.body?.action;
    if (!['approve', 'reject'].includes(action)) throw bad('Acción inválida.');

    if (action === 'approve') {
      run('UPDATE users SET role = ?, instructor_status = ? WHERE id = ?', ['instructor', 'approved', user.id]);
      return res.json({ ok: true, message: `${user.name} ahora es instructor aprobado.` });
    }
    run('UPDATE users SET instructor_status = ? WHERE id = ?', ['rejected', user.id]);
    res.json({ ok: true, message: 'Solicitud de instructor rechazada.' });
  } catch (error) {
    next(error);
  }
});

router.get('/courses', (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status) {
    where.push('c.status = ?');
    params.push(text(req.query.status, 30));
  }
  if (req.query.q) {
    where.push("c.title LIKE ?");
    params.push(`%${text(req.query.q, 80)}%`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  res.json({
    courses: all(`${COURSE_CARD_SELECT} ${clause} ORDER BY c.updated_at DESC LIMIT 200`, params).map((row) => ({
      ...courseCard(row),
      commission_rate: Number(get('SELECT commission_rate FROM users WHERE id = ?', [row.instructor_id])?.commission_rate || 20),
    })),
  });
});

router.post('/courses/:id/review', (req, res, next) => {
  try {
    const course = get('SELECT * FROM courses WHERE id = ?', [req.params.id]);
    if (!course) throw bad('Curso no encontrado.', 404);
    const action = req.body?.action;
    const note = text(req.body?.note, 500);
    if (action === 'approve') {
      run('UPDATE courses SET status = ?, published_at = ?, review_note = ?, updated_at = ? WHERE id = ?', [
        'published',
        course.published_at || nowIso(),
        note || 'Aprobado por administración.',
        nowIso(),
        course.id,
      ]);
      return res.json({ ok: true, message: 'Curso aprobado y publicado.' });
    }
    if (action === 'reject') {
      if (note.length < 10) throw bad('Explica al instructor por qué se rechaza (mínimo 10 caracteres).');
      run('UPDATE courses SET status = ?, review_note = ?, updated_at = ? WHERE id = ?', ['rejected', note, nowIso(), course.id]);
      return res.json({ ok: true, message: 'Curso rechazado con nota para el instructor.' });
    }
    if (action === 'unpublish') {
      run('UPDATE courses SET status = ?, review_note = ?, updated_at = ? WHERE id = ?', [
        'draft',
        note || 'Despublicado por administración.',
        nowIso(),
        course.id,
      ]);
      return res.json({ ok: true, message: 'Curso despublicado.' });
    }
    throw bad('Acción inválida.');
  } catch (error) {
    next(error);
  }
});

router.get('/transactions', (req, res) => {
  const { limit, offset } = pagination(req.query, 30, 100);
  const rows = all(
    `SELECT t.*, u.username, u.name AS user_name, i.name AS instructor_name, i.username AS instructor_username
     FROM transactions t JOIN users u ON u.id = t.user_id LEFT JOIN users i ON i.id = t.instructor_id
     ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  const totals = get(
    `SELECT COALESCE(SUM(amount_cents),0) AS gross, COALESCE(SUM(platform_fee_cents),0) AS fees,
      COUNT(*) AS total FROM transactions WHERE status = 'paid'`
  );
  res.json({
    transactions: rows,
    totals: { gross_cents: Number(totals.gross || 0), fee_cents: Number(totals.fees || 0), count: Number(totals.total || 0) },
  });
});

router.get('/certificates', (req, res) => {
  res.json({
    certificates: all(
      `SELECT cert.*, u.username, u.name AS user_name, c.slug AS course_slug
       FROM certificates cert JOIN users u ON u.id = cert.user_id JOIN courses c ON c.id = cert.course_id
       ORDER BY cert.issued_at DESC LIMIT 200`
    ).map((row) => ({ ...row, revoked: !!row.revoked })),
  });
});

router.post('/certificates/:code/revoke', (req, res, next) => {
  try {
    const certificate = get('SELECT * FROM certificates WHERE code = ?', [req.params.code.toUpperCase()]);
    if (!certificate) throw bad('Certificado no encontrado.', 404);
    const reason = text(req.body?.reason, 300);
    if (reason.length < 10) throw bad('Indica el motivo de la revocación (mínimo 10 caracteres).');
    run('UPDATE certificates SET revoked = 1, revoked_reason = ? WHERE id = ?', [reason, certificate.id]);
    res.json({ ok: true, message: 'Certificado revocado. La página pública mostrará el estado.' });
  } catch (error) {
    next(error);
  }
});

router.get('/reports', (req, res) => {
  const status = req.query.status === 'resolved' ? 'resolved' : req.query.status === 'all' ? null : 'open';
  res.json({
    reports: all(
      `SELECT r.*, u.username AS reporter_username FROM reports r JOIN users u ON u.id = r.reporter_id
       ${status ? 'WHERE r.status = ?' : ''} ORDER BY r.created_at DESC LIMIT 100`,
      status ? [status] : []
    ),
  });
});

router.post('/reports/:id/resolve', (req, res, next) => {
  try {
    const report = get('SELECT * FROM reports WHERE id = ?', [req.params.id]);
    if (!report) throw bad('Reporte no encontrado.', 404);
    run('UPDATE reports SET status = ?, resolved_at = ? WHERE id = ?', ['resolved', nowIso(), report.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/content', (_req, res) => {
  res.json({
    posts: all(
      `SELECT p.id, p.kind, p.title, p.body, p.created_at, u.username, u.name FROM posts p JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC LIMIT 50`
    ),
    projects: all(
      `SELECT p.id, p.title, p.created_at, u.username, u.name FROM projects p JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC LIMIT 50`
    ),
  });
});

router.delete('/posts/:id', (req, res) => {
  run('DELETE FROM posts WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

router.delete('/projects/:id', (req, res) => {
  run('DELETE FROM projects WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

router.get('/ads', (_req, res) => {
  res.json({ ads: all('SELECT * FROM ads ORDER BY created_at DESC LIMIT 100') });
});

router.post('/ads', (req, res, next) => {
  try {
    const title = text(req.body?.title, 120);
    const body = text(req.body?.body, 400);
    if (title.length < 4) throw bad('El anuncio necesita un título.');
    if (body.length < 10) throw bad('El anuncio necesita un texto.');
    const url = text(req.body?.url, 400);
    if (url && !/^https?:\/\//i.test(url)) throw bad('El enlace del anuncio debe ser http(s).');
    const id = insert('INSERT INTO ads (title, body, url, category_slug, status, created_at) VALUES (?,?,?,?,?,?)', [
      title,
      body,
      url,
      text(req.body?.category_slug, 60),
      'pending',
      nowIso(),
    ]);
    res.status(201).json({ ad: get('SELECT * FROM ads WHERE id = ?', [id]) });
  } catch (error) {
    next(error);
  }
});

router.patch('/ads/:id', (req, res, next) => {
  try {
    const ad = get('SELECT * FROM ads WHERE id = ?', [req.params.id]);
    if (!ad) throw bad('Anuncio no encontrado.', 404);
    const status = ['pending', 'approved', 'rejected', 'paused'].includes(req.body?.status) ? req.body.status : null;
    if (!status) throw bad('Estado inválido.');
    run('UPDATE ads SET status = ? WHERE id = ?', [status, ad.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/ads/:id', (req, res) => {
  run('DELETE FROM ads WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

router.get('/subscriptions', (_req, res) => {
  res.json({
    subscriptions: all(
      `SELECT s.*, u.username, u.name, u.email FROM subscriptions s JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT 200`
    ),
  });
});

router.get('/email-outbox', (_req, res) => {
  res.json({
    emails: all('SELECT id, to_email, subject, kind, status, created_at FROM email_outbox ORDER BY created_at DESC LIMIT 50'),
  });
});

router.get('/ai-usage', (_req, res) => {
  res.json({
    messages: Number(get('SELECT COUNT(*) AS total FROM ai_messages')?.total || 0),
    users: Number(get('SELECT COUNT(DISTINCT user_id) AS total FROM ai_messages')?.total || 0),
  });
});

export default router;
