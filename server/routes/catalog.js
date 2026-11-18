import express from 'express';
import { all, get, insert, run, nowIso } from '../db.js';
import { newCertificateCode, requireAuth } from '../auth.js';
import { bad, escapeLike, pagination, text } from '../util.js';
import {
  COURSE_CARD_SELECT,
  certificateEligibility,
  courseAccess,
  courseCard,
  enrollmentFor,
  existingCertificate,
  findCourseBySlug,
  lessonsOf,
  progressFor,
  quizMeta,
  refreshEnrollment,
  resourcesOf,
} from '../services/courses.js';
import { PLANS } from '../plans.js';

const router = express.Router();

router.get('/categories', (_req, res) => {
  const categories = all('SELECT * FROM categories ORDER BY position ASC');
  const subs = all('SELECT * FROM subcategories ORDER BY position ASC');
  const counts = all(
    `SELECT category_slug, COUNT(*) AS total FROM courses WHERE status = 'published' GROUP BY category_slug`
  );
  const countMap = new Map(counts.map((row) => [row.category_slug, Number(row.total)]));
  res.json({
    categories: categories.map((category) => ({
      ...category,
      course_count: countMap.get(category.slug) || 0,
      subcategories: subs
        .filter((sub) => sub.category_slug === category.slug)
        .map((sub) => ({ ...sub })),
    })),
  });
});

router.get('/plans', (_req, res) => {
  res.json({ plans: PLANS });
});

router.get('/courses', (req, res) => {
  const { limit, offset } = pagination(req.query, 24, 60);
  const where = ["c.status = 'published'"];
  const params = [];

  const q = text(req.query.q, 120);
  if (q) {
    where.push('(c.title LIKE ? ESCAPE \'\\\' OR c.subtitle LIKE ? ESCAPE \'\\\' OR c.description LIKE ? ESCAPE \'\\\')');
    const like = `%${escapeLike(q)}%`;
    params.push(like, like, like);
  }
  if (req.query.category) {
    where.push('c.category_slug = ?');
    params.push(text(req.query.category, 60));
  }
  if (req.query.subcategory) {
    where.push('c.subcategory_slug = ?');
    params.push(text(req.query.subcategory, 60));
  }
  if (req.query.level) {
    where.push('c.level = ?');
    params.push(text(req.query.level, 30));
  }
  if (req.query.price === 'free') where.push('c.price_cents = 0');
  if (req.query.price === 'paid') where.push('c.price_cents > 0');
  if (req.query.premium === '1') where.push('c.is_premium = 1');

  const sortMap = {
    recientes: 'c.published_at DESC',
    populares: 'students DESC',
    cortos: 'c.duration_minutes ASC',
    largos: 'c.duration_minutes DESC',
  };
  const order = sortMap[req.query.sort] || sortMap.recientes;
  const clause = `WHERE ${where.join(' AND ')}`;

  const total = Number(get(`SELECT COUNT(*) AS total FROM courses c ${clause}`, params)?.total || 0);
  const rows = all(`${COURSE_CARD_SELECT} ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);

  res.json({
    total,
    limit,
    offset,
    courses: rows.map((row) => {
      const card = courseCard(row);
      if (!req.user) return card;
      const progress = progressFor(req.user.id, row.id);
      return { ...card, progress, enrolled: Boolean(enrollmentFor(req.user.id, row.id)) };
    }),
  });
});

router.get('/courses/:slug', (req, res, next) => {
  try {
    const row = findCourseBySlug(req.params.slug);
    if (!row) throw bad('Curso no encontrado.', 404);
    const access = courseAccess(req.user, row);
    if (row.status !== 'published' && !access.owner && !access.admin) {
      throw bad('Este curso todavía no está publicado.', 404);
    }
    const progress = req.user ? progressFor(req.user.id, row.id) : null;
    const certificate = req.user ? existingCertificate(req.user.id, row.id) : null;
    const lessons = lessonsOf(row.id, { withContent: access.canViewContent });
    const outline = lessons.map((lesson, index) => ({
      ...lesson,
      locked: !access.canViewContent && index > 0,
      preview: index === 0,
    }));

    res.json({
      course: courseCard(row),
      instructor: {
        id: row.instructor_id,
        username: row.instructor_username,
        name: row.instructor_name,
        avatar_url: row.instructor_avatar,
      },
      lessons: outline,
      resources: resourcesOf(row.id),
      quiz: quizMeta(row.id),
      access,
      progress,
      enrollment: req.user ? enrollmentFor(req.user.id, row.id) : null,
      certificate,
      eligibility: req.user ? certificateEligibility(req.user.id, row) : null,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/courses/:slug/enroll', requireAuth, (req, res, next) => {
  try {
    const row = findCourseBySlug(req.params.slug);
    if (!row || row.status !== 'published') throw bad('Curso no encontrado.', 404);

    const existing = enrollmentFor(req.user.id, row.id);
    if (existing) {
      return res.json({ enrolled: true, message: 'Ya estabas inscrito en este curso.', progress: progressFor(req.user.id, row.id) });
    }

    if (row.price_cents > 0) {
      const paid = get(
        "SELECT id FROM transactions WHERE user_id = ? AND kind = 'course' AND reference = ? AND status = 'paid' LIMIT 1",
        [req.user.id, row.slug]
      );
      if (!paid) {
        throw bad(
          'Este curso es de pago. El cobro se realiza con Stripe; cuando el sistema de pagos esté configurado podrás comprarlo desde la página del curso.',
          402
        );
      }
    }

    const firstLesson = get('SELECT id FROM lessons WHERE course_id = ? ORDER BY position ASC, id ASC LIMIT 1', [row.id]);
    insert('INSERT INTO enrollments (user_id, course_id, created_at, last_lesson_id) VALUES (?,?,?,?)', [
      req.user.id,
      row.id,
      nowIso(),
      firstLesson ? firstLesson.id : null,
    ]);
    res.status(201).json({
      enrolled: true,
      message: 'Inscripción confirmada. Tu progreso se guarda automáticamente.',
      progress: progressFor(req.user.id, row.id),
      next_lesson_id: firstLesson ? firstLesson.id : null,
    });
  } catch (error) {
    next(error);
  }
});

function lessonPayload(lessonId, user) {
  const lesson = get('SELECT * FROM lessons WHERE id = ?', [lessonId]);
  if (!lesson) throw bad('Lección no encontrada.', 404);
  const course = get(`${COURSE_CARD_SELECT} WHERE c.id = ?`, [lesson.course_id]);
  if (!course) throw bad('Curso no encontrado.', 404);
  const access = courseAccess(user, course);
  const first = get('SELECT id FROM lessons WHERE course_id = ? ORDER BY position ASC, id ASC LIMIT 1', [course.id]);
  const isPreview = first && Number(first.id) === Number(lesson.id);
  if (!access.canViewContent && !isPreview) {
    throw bad('Inscríbete al curso para ver esta lección.', 403);
  }
  const progress = user ? get('SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?', [user.id, lesson.id]) : null;
  const neighbors = all('SELECT id, title, position FROM lessons WHERE course_id = ? ORDER BY position ASC, id ASC', [course.id]);
  const index = neighbors.findIndex((item) => Number(item.id) === Number(lesson.id));
  return {
    lesson: { ...lesson, preview: isPreview },
    course: courseCard(course),
    access,
    completed: Boolean(progress?.completed),
    seconds: Number(progress?.seconds || 0),
    previous: index > 0 ? neighbors[index - 1] : null,
    next: index >= 0 && index < neighbors.length - 1 ? neighbors[index + 1] : null,
    resources: all('SELECT * FROM resources WHERE course_id = ? AND (lesson_id = ? OR lesson_id IS NULL)', [course.id, lesson.id]),
  };
}

router.get('/lessons/:id', (req, res, next) => {
  try {
    res.json(lessonPayload(req.params.id, req.user));
  } catch (error) {
    next(error);
  }
});

router.post('/lessons/:id/progress', requireAuth, (req, res, next) => {
  try {
    const lesson = get('SELECT * FROM lessons WHERE id = ?', [req.params.id]);
    if (!lesson) throw bad('Lección no encontrada.', 404);
    const course = get('SELECT * FROM courses WHERE id = ?', [lesson.course_id]);
    const access = courseAccess(req.user, course);
    if (!access.canViewContent) throw bad('Inscríbete al curso para guardar tu progreso.', 403);

    const completed = req.body?.completed ? 1 : 0;
    const seconds = Math.max(0, Math.min(Number(req.body?.seconds) || 0, 60 * 60 * 6));
    run(
      `INSERT INTO lesson_progress (user_id, lesson_id, course_id, completed, seconds, updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(user_id, lesson_id) DO UPDATE SET completed = excluded.completed, seconds = excluded.seconds, updated_at = excluded.updated_at`,
      [req.user.id, lesson.id, lesson.course_id, completed, seconds, nowIso()]
    );
    run('UPDATE enrollments SET last_lesson_id = ? WHERE user_id = ? AND course_id = ?', [lesson.id, req.user.id, lesson.course_id]);
    const progress = refreshEnrollment(req.user.id, lesson.course_id);
    res.json({ ok: true, progress, saved_at: nowIso() });
  } catch (error) {
    next(error);
  }
});

router.get('/quizzes/:id', requireAuth, (req, res, next) => {
  try {
    const quiz = get('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
    if (!quiz) throw bad('Evaluación no encontrada.', 404);
    const course = get('SELECT * FROM courses WHERE id = ?', [quiz.course_id]);
    const access = courseAccess(req.user, course);
    if (!access.canViewContent) throw bad('Inscríbete al curso para presentar la evaluación.', 403);
    const questions = all('SELECT id, position, prompt, options FROM quiz_questions WHERE quiz_id = ? ORDER BY position ASC, id ASC', [quiz.id]);
    const attempts = all('SELECT id, score, passed, created_at FROM quiz_attempts WHERE quiz_id = ? AND user_id = ? ORDER BY created_at DESC', [
      quiz.id,
      req.user.id,
    ]);
    res.json({
      quiz: { id: quiz.id, title: quiz.title, description: quiz.description, pass_score: quiz.pass_score },
      questions: questions.map((question) => ({
        id: question.id,
        position: question.position,
        prompt: question.prompt,
        options: JSON.parse(question.options),
      })),
      attempts,
      best_score: attempts.reduce((best, attempt) => Math.max(best, Number(attempt.score)), 0),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/quizzes/:id/attempt', requireAuth, (req, res, next) => {
  try {
    const quiz = get('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
    if (!quiz) throw bad('Evaluación no encontrada.', 404);
    const course = get('SELECT * FROM courses WHERE id = ?', [quiz.course_id]);
    const access = courseAccess(req.user, course);
    if (!access.canViewContent) throw bad('Inscríbete al curso para presentar la evaluación.', 403);

    const questions = all('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY position ASC, id ASC', [quiz.id]);
    if (!questions.length) throw bad('Esta evaluación todavía no tiene preguntas.', 400);
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    if (answers.length !== questions.length) throw bad('Responde todas las preguntas antes de enviar.');

    let correct = 0;
    const results = questions.map((question, index) => {
      const chosen = Number(answers[index]);
      const isCorrect = chosen === Number(question.correct_index);
      if (isCorrect) correct += 1;
      return {
        question_id: question.id,
        chosen,
        correct_index: Number(question.correct_index),
        correct: isCorrect,
        explanation: question.explanation,
      };
    });

    const score = Math.round((correct / questions.length) * 100);
    const passed = score >= Number(quiz.pass_score) ? 1 : 0;
    insert('INSERT INTO quiz_attempts (quiz_id, user_id, course_id, score, passed, answers, created_at) VALUES (?,?,?,?,?,?,?)', [
      quiz.id,
      req.user.id,
      quiz.course_id,
      score,
      passed,
      JSON.stringify(answers),
      nowIso(),
    ]);

    res.json({
      score,
      passed: Boolean(passed),
      pass_score: Number(quiz.pass_score),
      results,
      message: passed
        ? 'Evaluación aprobada. Ya puedes solicitar tu certificado si completaste todas las lecciones.'
        : `Necesitas ${quiz.pass_score}% para aprobar. Revisa las explicaciones e inténtalo de nuevo.`,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/courses/:slug/certificate', requireAuth, (req, res, next) => {
  try {
    const course = findCourseBySlug(req.params.slug);
    if (!course) throw bad('Curso no encontrado.', 404);
    const eligibility = certificateEligibility(req.user.id, course);
    if (!eligibility.eligible) throw bad(eligibility.reason, 400);

    const existing = existingCertificate(req.user.id, course.id);
    if (existing) return res.json({ certificate: existing, already_issued: true });

    let code = newCertificateCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clash = get('SELECT id FROM certificates WHERE code = ?', [code]);
      if (!clash) break;
      code = newCertificateCode();
    }
    const issuedAt = nowIso();
    insert(
      'INSERT INTO certificates (code, user_id, course_id, title, recipient_name, score, issued_at) VALUES (?,?,?,?,?,?,?)',
      [code, req.user.id, course.id, course.title, req.user.name, eligibility.score, issuedAt]
    );
    const certificate = get('SELECT * FROM certificates WHERE code = ?', [code]);
    res.status(201).json({ certificate });
  } catch (error) {
    next(error);
  }
});

router.get('/certificates/:code', (req, res, next) => {
  try {
    const certificate = get(
      `SELECT cert.*, c.slug AS course_slug, c.title AS course_title, c.level, c.duration_minutes,
              u.username AS recipient_username, i.name AS instructor_name, i.username AS instructor_username
       FROM certificates cert
       JOIN courses c ON c.id = cert.course_id
       JOIN users u ON u.id = cert.user_id
       JOIN users i ON i.id = c.instructor_id
       WHERE cert.code = ?`,
      [req.params.code.toUpperCase()]
    );
    if (!certificate) throw bad('No encontramos un certificado con ese identificador.', 404);
    res.json({
      certificate: {
        code: certificate.code,
        title: certificate.title,
        recipient_name: certificate.recipient_name,
        recipient_username: certificate.recipient_username,
        course_slug: certificate.course_slug,
        instructor_name: certificate.instructor_name,
        instructor_username: certificate.instructor_username,
        score: certificate.score,
        issued_at: certificate.issued_at,
        revoked: !!certificate.revoked,
        revoked_reason: certificate.revoked_reason,
        level: certificate.level,
        duration_minutes: certificate.duration_minutes,
        issuer: 'SKILLVERSE',
      },
      disclaimer:
        'SKILLVERSE emite certificados de finalización de sus propios cursos. No son títulos académicos oficiales ni acreditaciones de una institución educativa.',
      verify_url: `/verificar/${certificate.code}`,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me/dashboard', requireAuth, (req, res) => {
  const rows = all(
    `${COURSE_CARD_SELECT} JOIN enrollments e ON e.course_id = c.id WHERE e.user_id = ? ORDER BY e.created_at DESC`,
    [req.user.id]
  );
  const enrollments = rows.map((row) => ({
    course: courseCard(row),
    progress: progressFor(req.user.id, row.id),
  }));

  const totals = get(
    `SELECT
      (SELECT COUNT(*) FROM lesson_progress WHERE user_id = ? AND completed = 1) AS lessons_completed,
      (SELECT COALESCE(SUM(seconds),0) FROM lesson_progress WHERE user_id = ?) AS seconds,
      (SELECT COUNT(*) FROM certificates WHERE user_id = ? AND revoked = 0) AS certificates,
      (SELECT COUNT(*) FROM projects WHERE user_id = ?) AS projects,
      (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following`,
    [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
  );

  const enrolledIds = new Set(rows.map((row) => Number(row.id)));
  const recommended = all(`${COURSE_CARD_SELECT} WHERE c.status = 'published' ORDER BY students DESC, c.published_at DESC LIMIT 12`)
    .filter((row) => !enrolledIds.has(Number(row.id)))
    .slice(0, 4)
    .map(courseCard);

  const certificates = all('SELECT * FROM certificates WHERE user_id = ? ORDER BY issued_at DESC', [req.user.id]);
  const recentActivity = all(
    `SELECT lp.updated_at, lp.completed, l.title AS lesson_title, c.slug AS course_slug, c.title AS course_title
     FROM lesson_progress lp
     JOIN lessons l ON l.id = lp.lesson_id
     JOIN courses c ON c.id = lp.course_id
     WHERE lp.user_id = ? ORDER BY lp.updated_at DESC LIMIT 6`,
    [req.user.id]
  );

  res.json({
    enrollments,
    recommended,
    certificates,
    activity: recentActivity,
    totals: {
      lessons_completed: Number(totals.lessons_completed || 0),
      minutes: Math.round(Number(totals.seconds || 0) / 60),
      certificates: Number(totals.certificates || 0),
      projects: Number(totals.projects || 0),
      followers: Number(totals.followers || 0),
      following: Number(totals.following || 0),
    },
  });
});

export default router;
