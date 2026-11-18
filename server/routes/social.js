import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { all, get, insert, run, nowIso } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { UPLOAD_DIR } from '../db.js';
import {
  bad,
  dataUrlToBuffer,
  escapeLike,
  pagination,
  publicUserCard,
  rateLimit,
  slugify,
  text,
  toInt,
} from '../util.js';
import { COURSE_CARD_SELECT, courseCard } from '../services/courses.js';
import { planById } from '../plans.js';

const router = express.Router();

const ALLOWED_UPLOADS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
};

function postCard(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    created_at: row.created_at,
    is_demo: !!row.is_demo,
    group: row.group_slug ? { slug: row.group_slug, name: row.group_name } : null,
    challenge: row.challenge_slug ? { slug: row.challenge_slug, title: row.challenge_title } : null,
    author: {
      id: row.user_id,
      username: row.username,
      name: row.name,
      avatar_url: row.avatar_url,
      headline: row.headline,
      role: row.role,
    },
    comments: Number(row.comment_count || 0),
    reactions: Number(row.reaction_count || 0),
    solved: !!row.accepted_comment_id,
  };
}

const POST_SELECT = `
  SELECT p.*, u.username, u.name, u.avatar_url, u.headline, u.role,
    g.slug AS group_slug, g.name AS group_name,
    ch.slug AS challenge_slug, ch.title AS challenge_title,
    (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
    (SELECT COUNT(*) FROM reactions r WHERE r.target_type = 'post' AND r.target_id = p.id) AS reaction_count,
    (SELECT c.id FROM comments c WHERE c.post_id = p.id AND c.accepted = 1 LIMIT 1) AS accepted_comment_id
  FROM posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN groups g ON g.id = p.group_id
  LEFT JOIN challenges ch ON ch.id = p.challenge_id
`;

router.get('/posts', (req, res) => {
  const { limit, offset } = pagination(req.query, 15, 50);
  const where = [];
  const params = [];
  if (req.query.kind === 'pregunta') where.push("p.kind = 'pregunta'");
  if (req.query.kind === 'post') where.push("p.kind = 'post'");
  if (req.query.group) {
    where.push('g.slug = ?');
    params.push(text(req.query.group, 80));
  }
  if (req.query.challenge) {
    where.push('ch.slug = ?');
    params.push(text(req.query.challenge, 80));
  }
  if (req.query.author) {
    where.push('u.username = ?');
    params.push(text(req.query.author, 60));
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = all(`${POST_SELECT} ${clause} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const total = Number(get(`SELECT COUNT(*) AS total FROM posts p LEFT JOIN groups g ON g.id = p.group_id LEFT JOIN challenges ch ON ch.id = p.challenge_id ${clause}`, params)?.total || 0);
  const reacted = new Set();
  if (req.user) {
    for (const row of all('SELECT target_id FROM reactions WHERE user_id = ? AND target_type = ?', [req.user.id, 'post'])) {
      reacted.add(Number(row.target_id));
    }
  }
  res.json({
    total,
    posts: rows.map((row) => ({ ...postCard(row), reacted: reacted.has(Number(row.id)) })),
  });
});

router.post('/posts', requireAuth, (req, res, next) => {
  try {
    const limit = rateLimit(`post:${req.user.id}`, { limit: 12, windowMs: 10 * 60_000 });
    if (!limit.ok) throw bad('Publicas muy rápido. Espera unos minutos.', 429);

    const kind = req.body?.kind === 'pregunta' ? 'pregunta' : 'post';
    const body = text(req.body?.body, 4000);
    const title = text(req.body?.title, 160);
    if (body.length < 3) throw bad('Escribe al menos unas palabras.');
    if (kind === 'pregunta' && title.length < 5) throw bad('Las preguntas necesitan un título claro.');

    let groupId = null;
    if (req.body?.group_slug) {
      const group = get('SELECT * FROM groups WHERE slug = ?', [text(req.body.group_slug, 80)]);
      if (!group) throw bad('El grupo no existe.', 404);
      const member = get('SELECT 1 AS ok FROM group_members WHERE group_id = ? AND user_id = ?', [group.id, req.user.id]);
      if (!member) throw bad('Únete al grupo antes de publicar en él.', 403);
      groupId = group.id;
    }
    let challengeId = null;
    if (req.body?.challenge_slug) {
      const challenge = get('SELECT * FROM challenges WHERE slug = ?', [text(req.body.challenge_slug, 80)]);
      if (challenge) challengeId = challenge.id;
    }

    const id = insert('INSERT INTO posts (user_id, kind, title, body, group_id, challenge_id, created_at) VALUES (?,?,?,?,?,?,?)', [
      req.user.id,
      kind,
      title,
      body,
      groupId,
      challengeId,
      nowIso(),
    ]);
    const row = get(`${POST_SELECT} WHERE p.id = ?`, [id]);
    res.status(201).json({ post: postCard(row) });
  } catch (error) {
    next(error);
  }
});

router.get('/posts/:id', (req, res, next) => {
  try {
    const row = get(`${POST_SELECT} WHERE p.id = ?`, [req.params.id]);
    if (!row) throw bad('Publicación no encontrada.', 404);
    const comments = all(
      `SELECT c.*, u.username, u.name, u.avatar_url
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ? ORDER BY c.created_at ASC`,
      [row.id]
    );
    const reacted = req.user
      ? Boolean(get('SELECT 1 AS ok FROM reactions WHERE user_id = ? AND target_type = ? AND target_id = ?', [req.user.id, 'post', row.id]))
      : false;
    res.json({
      post: { ...postCard(row), reacted },
      comments: comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        created_at: comment.created_at,
        parent_id: comment.parent_id,
        accepted: !!comment.accepted,
        author: {
          id: comment.user_id,
          username: comment.username,
          name: comment.name,
          avatar_url: comment.avatar_url,
        },
      })),
      can_moderate: Boolean(req.user && (req.user.id === row.user_id || req.user.role === 'admin')),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/posts/:id/comments', requireAuth, (req, res, next) => {
  try {
    const limit = rateLimit(`comment:${req.user.id}`, { limit: 30, windowMs: 10 * 60_000 });
    if (!limit.ok) throw bad('Demasiados comentarios seguidos. Espera un momento.', 429);
    const post = get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    if (!post) throw bad('Publicación no encontrada.', 404);
    const body = text(req.body?.body, 2000);
    if (body.length < 2) throw bad('Escribe tu respuesta.');

    let parentId = null;
    if (req.body?.parent_id) {
      const parent = get('SELECT id FROM comments WHERE id = ? AND post_id = ?', [req.body.parent_id, post.id]);
      if (!parent) throw bad('El comentario al que respondes no existe.', 404);
      parentId = parent.id;
    }

    const id = insert('INSERT INTO comments (post_id, user_id, parent_id, body, created_at) VALUES (?,?,?,?,?)', [
      post.id,
      req.user.id,
      parentId,
      body,
      nowIso(),
    ]);
    const comment = get('SELECT * FROM comments WHERE id = ?', [id]);
    res.status(201).json({
      comment: {
        ...comment,
        accepted: !!comment.accepted,
        author: { id: req.user.id, username: req.user.username, name: req.user.name, avatar_url: req.user.avatar_url },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/comments/:id/accept', requireAuth, (req, res, next) => {
  try {
    const comment = get('SELECT * FROM comments WHERE id = ?', [req.params.id]);
    if (!comment) throw bad('Comentario no encontrado.', 404);
    const post = get('SELECT * FROM posts WHERE id = ?', [comment.post_id]);
    if (!post) throw bad('Publicación no encontrada.', 404);
    if (post.user_id !== req.user.id && req.user.role !== 'admin') {
      throw bad('Solo quien hizo la pregunta puede marcar la mejor respuesta.', 403);
    }
    run('UPDATE comments SET accepted = 0 WHERE post_id = ?', [post.id]);
    run('UPDATE comments SET accepted = 1 WHERE id = ?', [comment.id]);
    res.json({ ok: true, message: 'Respuesta aceptada como solución.' });
  } catch (error) {
    next(error);
  }
});

router.post('/reactions', requireAuth, (req, res, next) => {
  try {
    const targetType = ['post', 'comment', 'project'].includes(req.body?.target_type) ? req.body.target_type : null;
    if (!targetType) throw bad('Tipo de reacción inválido.');
    const targetId = toInt(req.body?.target_id, 0);
    const table = targetType === 'post' ? 'posts' : targetType === 'comment' ? 'comments' : 'projects';
    const target = get(`SELECT id FROM ${table} WHERE id = ?`, [targetId]);
    if (!target) throw bad('El contenido ya no existe.', 404);

    const existing = get('SELECT * FROM reactions WHERE user_id = ? AND target_type = ? AND target_id = ?', [
      req.user.id,
      targetType,
      targetId,
    ]);
    if (existing) {
      run('DELETE FROM reactions WHERE user_id = ? AND target_type = ? AND target_id = ?', [req.user.id, targetType, targetId]);
      return res.json({ reacted: false });
    }
    run('INSERT INTO reactions (user_id, target_type, target_id, kind, created_at) VALUES (?,?,?,?,?)', [
      req.user.id,
      targetType,
      targetId,
      'like',
      nowIso(),
    ]);
    res.json({ reacted: true });
  } catch (error) {
    next(error);
  }
});

router.get('/groups', (_req, res) => {
  const groups = all(
    `SELECT g.*, u.username AS owner_username, u.name AS owner_name,
      (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS members,
      (SELECT COUNT(*) FROM posts p WHERE p.group_id = g.id) AS posts
     FROM groups g JOIN users u ON u.id = g.owner_id ORDER BY members DESC, g.created_at DESC`
  );
  res.json({ groups });
});

router.post('/groups', requireAuth, (req, res, next) => {
  try {
    const name = text(req.body?.name, 80);
    const description = text(req.body?.description, 500);
    if (name.length < 3) throw bad('El nombre del grupo debe tener al menos 3 caracteres.');
    const category = get('SELECT slug FROM categories WHERE slug = ?', [text(req.body?.category_slug, 60)]);
    if (!category) throw bad('Elige una categoría válida.');
    const base = slugify(name);
    let slug = base;
    let suffix = 0;
    while (get('SELECT id FROM groups WHERE slug = ?', [slug])) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
    const id = insert('INSERT INTO groups (slug, name, description, category_slug, owner_id, created_at) VALUES (?,?,?,?,?,?)', [
      slug,
      name,
      description,
      category.slug,
      req.user.id,
      nowIso(),
    ]);
    run('INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?)', [id, req.user.id, 'admin', nowIso()]);
    res.status(201).json({ group: get('SELECT * FROM groups WHERE id = ?', [id]) });
  } catch (error) {
    next(error);
  }
});

router.get('/groups/:slug', (req, res, next) => {
  try {
    const group = get(
      `SELECT g.*, u.username AS owner_username, u.name AS owner_name,
        (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS members
       FROM groups g JOIN users u ON u.id = g.owner_id WHERE g.slug = ?`,
      [req.params.slug]
    );
    if (!group) throw bad('Grupo no encontrado.', 404);
    const members = all(
      `SELECT u.id, u.username, u.name, u.avatar_url, m.role, m.joined_at
       FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY m.joined_at ASC LIMIT 50`,
      [group.id]
    );
    const isMember = req.user ? Boolean(get('SELECT 1 AS ok FROM group_members WHERE group_id = ? AND user_id = ?', [group.id, req.user.id])) : false;
    res.json({ group: { ...group, is_member: isMember }, members });
  } catch (error) {
    next(error);
  }
});

router.post('/groups/:slug/membership', requireAuth, (req, res, next) => {
  try {
    const group = get('SELECT * FROM groups WHERE slug = ?', [req.params.slug]);
    if (!group) throw bad('Grupo no encontrado.', 404);
    const action = req.body?.action === 'leave' ? 'leave' : 'join';
    if (action === 'leave') {
      if (group.owner_id === req.user.id) throw bad('El creador no puede abandonar su propio grupo.');
      run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [group.id, req.user.id]);
      return res.json({ is_member: false });
    }
    const exists = get('SELECT 1 AS ok FROM group_members WHERE group_id = ? AND user_id = ?', [group.id, req.user.id]);
    if (!exists) {
      run('INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?)', [group.id, req.user.id, 'miembro', nowIso()]);
    }
    res.json({ is_member: true });
  } catch (error) {
    next(error);
  }
});

router.get('/challenges', (_req, res) => {
  const challenges = all(
    `SELECT ch.*, (SELECT COUNT(*) FROM projects p WHERE p.challenge_id = ch.id) AS entries
     FROM challenges ch ORDER BY CASE WHEN ch.status = 'activo' THEN 0 ELSE 1 END, ch.created_at DESC`
  );
  res.json({ challenges });
});

router.get('/challenges/:slug', (req, res, next) => {
  try {
    const challenge = get('SELECT * FROM challenges WHERE slug = ?', [req.params.slug]);
    if (!challenge) throw bad('Desafío no encontrado.', 404);
    const entries = all(
      `SELECT p.*, u.username, u.name, u.avatar_url,
        (SELECT COUNT(*) FROM reactions r WHERE r.target_type = 'project' AND r.target_id = p.id) AS reactions
       FROM projects p JOIN users u ON u.id = p.user_id
       WHERE p.challenge_id = ? ORDER BY p.created_at DESC LIMIT 30`,
      [challenge.id]
    );
    res.json({ challenge, entries });
  } catch (error) {
    next(error);
  }
});

function projectPayload(row, viewer) {
  const files = all('SELECT id, filename, mime, size, stored_name FROM project_files WHERE project_id = ? ORDER BY id', [row.id]);
  const reacted = viewer
    ? Boolean(get('SELECT 1 AS ok FROM reactions WHERE user_id = ? AND target_type = ? AND target_id = ?', [viewer.id, 'project', row.id]))
    : false;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category_slug: row.category_slug,
    link: row.link,
    cover_url: row.cover_url,
    created_at: row.created_at,
    is_demo: !!row.is_demo,
    challenge: row.challenge_slug ? { slug: row.challenge_slug, title: row.challenge_title } : null,
    author: {
      id: row.user_id,
      username: row.username,
      name: row.name,
      avatar_url: row.avatar_url,
      headline: row.headline,
    },
    reactions: Number(row.reaction_count || 0),
    reacted,
    files: files.map((file) => ({
      id: file.id,
      filename: file.filename,
      mime: file.mime,
      size: file.size,
      url: `/uploads/${file.stored_name}`,
    })),
  };
}

const PROJECT_SELECT = `
  SELECT p.*, u.username, u.name, u.avatar_url, u.headline,
    ch.slug AS challenge_slug, ch.title AS challenge_title,
    (SELECT COUNT(*) FROM reactions r WHERE r.target_type = 'project' AND r.target_id = p.id) AS reaction_count
  FROM projects p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN challenges ch ON ch.id = p.challenge_id
`;

router.get('/projects', (req, res) => {
  const { limit, offset } = pagination(req.query, 18, 48);
  const where = ["u.privacy_projects = 'public'"];
  const params = [];
  if (req.query.category) {
    where.push('p.category_slug = ?');
    params.push(text(req.query.category, 60));
  }
  if (req.query.q) {
    where.push("(p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')");
    const like = `%${escapeLike(text(req.query.q, 120))}%`;
    params.push(like, like);
  }
  const clause = `WHERE ${where.join(' AND ')}`;
  const total = Number(
    get(`SELECT COUNT(*) AS total FROM projects p JOIN users u ON u.id = p.user_id ${clause}`, params)?.total || 0
  );
  const rows = all(`${PROJECT_SELECT} ${clause} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ total, projects: rows.map((row) => projectPayload(row, req.user)) });
});

router.get('/projects/:id', (req, res, next) => {
  try {
    const row = get(`${PROJECT_SELECT} WHERE p.id = ?`, [req.params.id]);
    if (!row) throw bad('Proyecto no encontrado.', 404);
    const owner = req.user && (req.user.id === row.user_id || req.user.role === 'admin');
    const privacy = get('SELECT privacy_projects FROM users WHERE id = ?', [row.user_id]);
    if (privacy?.privacy_projects === 'private' && !owner) {
      throw bad('Este portafolio es privado.', 403);
    }
    res.json({ project: projectPayload(row, req.user), can_edit: Boolean(owner) });
  } catch (error) {
    next(error);
  }
});

router.post('/projects', requireAuth, (req, res, next) => {
  try {
    const limit = rateLimit(`project:${req.user.id}`, { limit: 10, windowMs: 30 * 60_000 });
    if (!limit.ok) throw bad('Has creado varios proyectos seguidos. Espera unos minutos.', 429);

    const title = text(req.body?.title, 140);
    const description = text(req.body?.description, 3000);
    if (title.length < 4) throw bad('El título del proyecto debe tener al menos 4 caracteres.');
    if (description.length < 20) throw bad('Describe tu proyecto (mínimo 20 caracteres) para que otros puedan entenderlo.');

    const category = get('SELECT slug FROM categories WHERE slug = ?', [text(req.body?.category_slug, 60)]);
    if (!category) throw bad('Elige una categoría válida.');

    const link = text(req.body?.link, 400);
    if (link && !/^https?:\/\//i.test(link)) throw bad('El enlace del proyecto debe comenzar con http:// o https://');

    const plan = planById(req.user.plan);
    const maxFiles = plan.limits.project_files;
    const incoming = Array.isArray(req.body?.files) ? req.body.files.slice(0, maxFiles) : [];
    if (Array.isArray(req.body?.files) && req.body.files.length > maxFiles) {
      throw bad(`Tu plan ${plan.name} permite ${maxFiles} archivos por proyecto.`);
    }

    let cover = '';
    if (req.body?.cover) {
      const { mime, buffer } = dataUrlToBuffer(req.body.cover, 2 * 1024 * 1024);
      if (!ALLOWED_UPLOADS[mime] || !mime.startsWith('image/')) throw bad('La portada debe ser una imagen PNG, JPEG, WebP o GIF.');
      cover = `data:${mime};base64,${buffer.toString('base64')}`;
    }

    let challengeId = null;
    if (req.body?.challenge_slug) {
      const challenge = get('SELECT id FROM challenges WHERE slug = ?', [text(req.body.challenge_slug, 80)]);
      if (challenge) challengeId = challenge.id;
    }

    const projectId = insert(
      'INSERT INTO projects (user_id, title, description, category_slug, link, cover_url, challenge_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [req.user.id, title, description, category.slug, link, cover, challengeId, nowIso()]
    );

    const stored = [];
    for (const file of incoming) {
      const { mime, buffer } = dataUrlToBuffer(file?.dataUrl, 4 * 1024 * 1024);
      const extension = ALLOWED_UPLOADS[mime];
      if (!extension) throw bad('Solo se permiten imágenes, PDF, TXT, Markdown o CSV.');
      const safeName = `${crypto.randomBytes(12).toString('hex')}.${extension}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, safeName), buffer);
      stored.push({ safeName, mime, size: buffer.length, filename: text(file?.filename, 120) || `archivo.${extension}` });
    }
    for (const file of stored) {
      insert('INSERT INTO project_files (project_id, filename, mime, size, stored_name, created_at) VALUES (?,?,?,?,?,?)', [
        projectId,
        file.filename,
        file.mime,
        file.size,
        file.safeName,
        nowIso(),
      ]);
    }

    const row = get(`${PROJECT_SELECT} WHERE p.id = ?`, [projectId]);
    res.status(201).json({ project: projectPayload(row, req.user) });
  } catch (error) {
    next(error);
  }
});

router.post('/projects/:id/files', requireAuth, (req, res, next) => {
  try {
    const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!project) throw bad('Proyecto no encontrado.', 404);
    if (project.user_id !== req.user.id && req.user.role !== 'admin') throw bad('No puedes modificar este proyecto.', 403);
    const plan = planById(req.user.plan);
    const count = Number(get('SELECT COUNT(*) AS total FROM project_files WHERE project_id = ?', [project.id])?.total || 0);
    if (count >= plan.limits.project_files) throw bad(`Tu plan ${plan.name} permite ${plan.limits.project_files} archivos por proyecto.`);

    const { mime, buffer } = dataUrlToBuffer(req.body?.dataUrl, 4 * 1024 * 1024);
    const extension = ALLOWED_UPLOADS[mime];
    if (!extension) throw bad('Solo se permiten imágenes, PDF, TXT, Markdown o CSV.');
    const safeName = `${crypto.randomBytes(12).toString('hex')}.${extension}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, safeName), buffer);
    const id = insert('INSERT INTO project_files (project_id, filename, mime, size, stored_name, created_at) VALUES (?,?,?,?,?,?)', [
      project.id,
      text(req.body?.filename, 120) || `archivo.${extension}`,
      mime,
      buffer.length,
      safeName,
      nowIso(),
    ]);
    res.status(201).json({ file: { id, url: `/uploads/${safeName}`, mime, size: buffer.length } });
  } catch (error) {
    next(error);
  }
});

router.delete('/projects/:id', requireAuth, (req, res, next) => {
  try {
    const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!project) throw bad('Proyecto no encontrado.', 404);
    if (project.user_id !== req.user.id && req.user.role !== 'admin') throw bad('No puedes eliminar este proyecto.', 403);
    run('DELETE FROM projects WHERE id = ?', [project.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/users/:username', (req, res, next) => {
  try {
    const user = get('SELECT * FROM users WHERE username = ?', [req.params.username]);
    if (!user) throw bad('Perfil no encontrado.', 404);
    const isSelf = req.user && req.user.id === user.id;
    const isAdmin = req.user && req.user.role === 'admin';
    const stats = {
      followers: Number(get('SELECT COUNT(*) AS total FROM follows WHERE following_id = ?', [user.id])?.total || 0),
      following: Number(get('SELECT COUNT(*) AS total FROM follows WHERE follower_id = ?', [user.id])?.total || 0),
      projects: Number(get('SELECT COUNT(*) AS total FROM projects WHERE user_id = ?', [user.id])?.total || 0),
      certificates: Number(get('SELECT COUNT(*) AS total FROM certificates WHERE user_id = ? AND revoked = 0', [user.id])?.total || 0),
      courses: Number(get("SELECT COUNT(*) AS total FROM courses WHERE instructor_id = ? AND status = 'published'", [user.id])?.total || 0),
    };
    const isFollowing = req.user
      ? Boolean(get('SELECT 1 AS ok FROM follows WHERE follower_id = ? AND following_id = ?', [req.user.id, user.id]))
      : false;

    if (user.privacy_profile === 'private' && !isSelf && !isAdmin) {
      return res.json({
        private: true,
        user: { username: user.username, name: user.name, avatar_url: user.avatar_url, privacy_profile: 'private' },
        stats: { followers: stats.followers },
        is_following: isFollowing,
      });
    }

    const skills = all(
      `SELECT s.name, s.slug, s.category_slug, us.level, us.source FROM user_skills us JOIN skills s ON s.id = us.skill_id
       WHERE us.user_id = ? ORDER BY us.created_at DESC`,
      [user.id]
    );
    const projects = all(
      `${PROJECT_SELECT} WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT 12`,
      [user.id]
    ).map((row) => projectPayload(row, req.user));
    const certificates =
      user.privacy_certificates === 'public' || isSelf || isAdmin
        ? all('SELECT code, title, issued_at, score, revoked FROM certificates WHERE user_id = ? ORDER BY issued_at DESC', [user.id])
        : [];
    const courses = all(`${COURSE_CARD_SELECT} WHERE c.instructor_id = ? AND c.status = 'published' ORDER BY c.published_at DESC`, [user.id]).map(
      courseCard
    );

    res.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        bio: user.bio,
        headline: user.headline,
        avatar_url: user.avatar_url,
        location: user.location,
        website: user.website,
        role: user.role,
        instructor_status: user.instructor_status,
        plan: user.plan,
        created_at: user.created_at,
        privacy_profile: user.privacy_profile,
        privacy_projects: user.privacy_projects,
        privacy_certificates: user.privacy_certificates,
      },
      stats,
      is_following: isFollowing,
      is_self: Boolean(isSelf),
      skills,
      projects,
      certificates,
      courses,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/users/:username/follow', requireAuth, (req, res, next) => {
  try {
    const target = get('SELECT * FROM users WHERE username = ?', [req.params.username]);
    if (!target) throw bad('Perfil no encontrado.', 404);
    if (target.id === req.user.id) throw bad('No puedes seguirte a ti mismo.');
    const existing = get('SELECT 1 AS ok FROM follows WHERE follower_id = ? AND following_id = ?', [req.user.id, target.id]);
    if (existing) {
      run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [req.user.id, target.id]);
      return res.json({ following: false });
    }
    run('INSERT INTO follows (follower_id, following_id, created_at) VALUES (?,?,?)', [req.user.id, target.id, nowIso()]);
    res.json({ following: true });
  } catch (error) {
    next(error);
  }
});

router.put('/me/skills', requireAuth, (req, res, next) => {
  try {
    const name = text(req.body?.name, 60);
    const level = ['aprendiendo', 'practicando', 'avanzado'].includes(req.body?.level) ? req.body.level : 'aprendiendo';
    if (name.length < 2) throw bad('Escribe el nombre de la habilidad.');
    const slug = slugify(name);
    let skill = get('SELECT * FROM skills WHERE slug = ?', [slug]);
    if (!skill) {
      const category = get('SELECT slug FROM categories WHERE slug = ?', [text(req.body?.category_slug, 60)]);
      const id = insert('INSERT INTO skills (slug, name, category_slug) VALUES (?,?,?)', [slug, name, category?.slug || 'tecnologia']);
      skill = get('SELECT * FROM skills WHERE id = ?', [id]);
    }
    run(
      `INSERT INTO user_skills (user_id, skill_id, level, source, created_at) VALUES (?,?,?,?,?)
       ON CONFLICT(user_id, skill_id) DO UPDATE SET level = excluded.level`,
      [req.user.id, skill.id, level, 'manual', nowIso()]
    );
    res.json({ ok: true, skill: { name: skill.name, slug: skill.slug, level } });
  } catch (error) {
    next(error);
  }
});

router.delete('/me/skills/:slug', requireAuth, (req, res, next) => {
  const skill = get('SELECT * FROM skills WHERE slug = ?', [req.params.slug]);
  if (!skill) return res.status(404).json({ error: 'Habilidad no encontrada.' });
  run('DELETE FROM user_skills WHERE user_id = ? AND skill_id = ?', [req.user.id, skill.id]);
  res.json({ ok: true });
});

router.get('/search', (req, res) => {
  const q = text(req.query.q, 120);
  if (q.length < 2) return res.json({ courses: [], users: [], projects: [], posts: [] });
  const like = `%${escapeLike(q)}%`;
  res.json({
    courses: all(
      `${COURSE_CARD_SELECT} WHERE c.status = 'published' AND (c.title LIKE ? ESCAPE '\\' OR c.subtitle LIKE ? ESCAPE '\\') ORDER BY students DESC LIMIT 8`,
      [like, like]
    ).map(courseCard),
    users: all(
      `SELECT id, username, name, avatar_url, headline FROM users
       WHERE privacy_profile = 'public' AND (name LIKE ? ESCAPE '\\' OR username LIKE ? ESCAPE '\\' OR headline LIKE ? ESCAPE '\\') LIMIT 8`,
      [like, like, like]
    ).map(publicUserCard),
    projects: all(
      `${PROJECT_SELECT} WHERE (p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\') ORDER BY p.created_at DESC LIMIT 8`,
      [like, like]
    ).map((row) => projectPayload(row, req.user)),
    posts: all(`${POST_SELECT} WHERE (p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\') ORDER BY p.created_at DESC LIMIT 8`, [like, like]).map(
      postCard
    ),
  });
});

router.post('/reports', requireAuth, (req, res, next) => {
  try {
    const targetType = ['post', 'comment', 'project', 'user', 'course'].includes(req.body?.target_type) ? req.body.target_type : null;
    if (!targetType) throw bad('Tipo de reporte inválido.');
    const reason = text(req.body?.reason, 200);
    if (reason.length < 5) throw bad('Explica brevemente el motivo del reporte.');
    insert('INSERT INTO reports (reporter_id, target_type, target_id, reason, details, created_at) VALUES (?,?,?,?,?,?)', [
      req.user.id,
      targetType,
      toInt(req.body?.target_id, 0),
      reason,
      text(req.body?.details, 1000),
      nowIso(),
    ]);
    res.status(201).json({ ok: true, message: 'Reporte recibido. El equipo de moderación lo revisará.' });
  } catch (error) {
    next(error);
  }
});

export default router;
