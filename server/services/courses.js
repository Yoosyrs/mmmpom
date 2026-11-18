import { all, get, insert, run } from '../db.js';
import { nowIso } from '../util.js';

export const COURSE_CARD_SELECT = `
  SELECT c.*,
    u.username AS instructor_username,
    u.name AS instructor_name,
    u.avatar_url AS instructor_avatar,
    (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS students,
    (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count
  FROM courses c
  JOIN users u ON u.id = c.instructor_id
`;

export function courseCard(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    cover_gradient: row.cover_gradient,
    category_slug: row.category_slug,
    subcategory_slug: row.subcategory_slug,
    level: row.level,
    duration_minutes: row.duration_minutes,
    language: row.language,
    status: row.status,
    price_cents: row.price_cents,
    is_premium: !!row.is_premium,
    is_demo: !!row.is_demo,
    review_note: row.review_note || '',
    created_at: row.created_at,
    published_at: row.published_at,
    students: Number(row.students || 0),
    lesson_count: Number(row.lesson_count || 0),
    instructor: {
      id: row.instructor_id,
      username: row.instructor_username,
      name: row.instructor_name,
      avatar_url: row.instructor_avatar,
    },
  };
}

export function findCourseBySlug(slug) {
  return get(`${COURSE_CARD_SELECT} WHERE c.slug = ?`, [slug]);
}

export function findCourseById(id) {
  return get(`${COURSE_CARD_SELECT} WHERE c.id = ?`, [id]);
}

export function lessonsOf(courseId, { withContent = false } = {}) {
  const rows = all('SELECT * FROM lessons WHERE course_id = ? ORDER BY position ASC, id ASC', [courseId]);
  return rows.map((row) => ({
    id: row.id,
    position: row.position,
    title: row.title,
    summary: row.summary,
    type: row.type,
    duration_minutes: row.duration_minutes,
    video_url: row.video_url,
    ...(withContent ? { content: row.content } : {}),
  }));
}

export function resourcesOf(courseId) {
  return all('SELECT * FROM resources WHERE course_id = ? ORDER BY id ASC', [courseId]);
}

export function quizMeta(courseId) {
  const quiz = get('SELECT * FROM quizzes WHERE course_id = ? ORDER BY id ASC', [courseId]);
  if (!quiz) return null;
  const count = get('SELECT COUNT(*) AS total FROM quiz_questions WHERE quiz_id = ?', [quiz.id]);
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    pass_score: quiz.pass_score,
    question_count: Number(count?.total || 0),
  };
}

export function enrollmentFor(userId, courseId) {
  if (!userId) return null;
  return get('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?', [userId, courseId]);
}

export function progressFor(userId, courseId) {
  const totals = get(
    `SELECT (SELECT COUNT(*) FROM lessons WHERE course_id = ?) AS total,
            (SELECT COUNT(*) FROM lesson_progress WHERE user_id = ? AND course_id = ? AND completed = 1) AS completed`,
    [courseId, userId || 0, courseId]
  );
  const total = Number(totals?.total || 0);
  const completed = Number(totals?.completed || 0);
  return {
    total,
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
}

export function refreshEnrollment(userId, courseId) {
  const enrollment = enrollmentFor(userId, courseId);
  if (!enrollment) return null;
  const progress = progressFor(userId, courseId);
  const done = progress.total > 0 && progress.completed >= progress.total;
  run('UPDATE enrollments SET completed_at = ? WHERE id = ?', [done ? enrollment.completed_at || nowIso() : null, enrollment.id]);
  return progress;
}

export function hasPaidAccess(userId, course) {
  if (!course.price_cents) return true;
  const paid = get(
    `SELECT id FROM transactions WHERE user_id = ? AND kind = 'course' AND reference = ? AND status = 'paid' LIMIT 1`,
    [userId, course.slug]
  );
  return Boolean(paid);
}

export function courseAccess(user, course) {
  if (!user) return { enrolled: false, owner: false, admin: false, paid: false, canViewContent: false };
  const owner = course.instructor_id === user.id;
  const admin = user.role === 'admin';
  const enrolled = Boolean(enrollmentFor(user.id, course.id));
  const paid = hasPaidAccess(user.id, course);
  return {
    enrolled,
    owner,
    admin,
    paid,
    canViewContent: enrolled || owner || admin,
  };
}

export function certificateEligibility(userId, course) {
  const enrollment = enrollmentFor(userId, course.id);
  if (!enrollment) return { eligible: false, reason: 'Debes inscribirte al curso para obtener el certificado.' };
  const progress = progressFor(userId, course.id);
  if (progress.total === 0) return { eligible: false, reason: 'El curso todavía no tiene lecciones.' };
  if (progress.completed < progress.total) {
    return { eligible: false, reason: `Completa todas las lecciones (${progress.completed}/${progress.total}).` };
  }
  const quiz = get('SELECT * FROM quizzes WHERE course_id = ?', [course.id]);
  if (quiz) {
    const passed = get('SELECT id, score FROM quiz_attempts WHERE user_id = ? AND quiz_id = ? AND passed = 1 LIMIT 1', [userId, quiz.id]);
    if (!passed) return { eligible: false, reason: 'Aprueba la evaluación del curso para obtener el certificado.' };
    return { eligible: true, score: Number(passed.score), quizId: quiz.id };
  }
  return { eligible: true, score: null, quizId: null };
}

export function existingCertificate(userId, courseId) {
  return get('SELECT * FROM certificates WHERE user_id = ? AND course_id = ? AND revoked = 0', [userId, courseId]);
}
