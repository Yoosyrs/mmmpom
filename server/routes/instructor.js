import express from 'express';
import { all, get, insert, run, nowIso, tx } from '../db.js';
import { requireAuth, requireInstructor } from '../auth.js';
import { bad, text, toInt } from '../util.js';
import { COURSE_CARD_SELECT, courseCard, lessonsOf, quizMeta, resourcesOf, progressFor } from '../services/courses.js';
import { COMMISSION_RATE } from '../plans.js';

const router = express.Router();

const LEVELS = ['principiante', 'intermedio', 'avanzado'];
const GRADIENTS = ['aurora', 'sunset', 'ocean', 'violet', 'mint', 'ember'];

router.post('/apply', requireAuth, (req, res, next) => {
  try {
    if (req.user.role === 'admin') throw bad('La cuenta administrativa ya puede crear cursos.');
    if (req.user.instructor_status === 'pending') throw bad('Tu solicitud ya está en revisión.');
    if (req.user.role === 'instructor' && req.user.instructor_status === 'approved') {
      throw bad('Ya eres instructor aprobado.');
    }
    const motivation = text(req.body?.motivation, 1500);
    const expertise = text(req.body?.expertise, 600);
    if (motivation.length < 40) throw bad('Cuéntanos con más detalle qué enseñarás (mínimo 40 caracteres).');
    if (expertise.length < 10) throw bad('Describe tu experiencia o especialidad.');

    run('UPDATE users SET instructor_status = ?, instructor_application = ?, instructor_applied_at = ? WHERE id = ?', [
      'pending',
      `${expertise}\n\n${motivation}`,
      nowIso(),
      req.user.id,
    ]);
    res.status(201).json({
      ok: true,
      message: 'Solicitud enviada. Un administrador revisará tu perfil antes de habilitar la publicación de cursos.',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/overview', requireInstructor, (req, res) => {
  const courses = all(`${COURSE_CARD_SELECT} WHERE c.instructor_id = ? ORDER BY c.updated_at DESC`, [req.user.id]).map(courseCard);
  const revenue = get(
    `SELECT COALESCE(SUM(amount_cents),0) AS gross, COALESCE(SUM(platform_fee_cents),0) AS fees
     FROM transactions WHERE instructor_id = ? AND status = 'paid'`,
    [req.user.id]
  );
  const students = get(
    `SELECT COUNT(DISTINCT e.user_id) AS total FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.instructor_id = ?`,
    [req.user.id]
  );
  const lessons = get(
    `SELECT COUNT(*) AS total FROM lessons l JOIN courses c ON c.id = l.course_id WHERE c.instructor_id = ?`,
    [req.user.id]
  );
  const recent = all(
    `SELECT e.created_at, u.username, u.name, u.avatar_url, c.title AS course_title, c.slug AS course_slug
     FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id
     WHERE c.instructor_id = ? ORDER BY e.created_at DESC LIMIT 8`,
    [req.user.id]
  );
  const commissionRate = Number(req.user.commission_rate || COMMISSION_RATE);
  const gross = Number(revenue.gross || 0);
  const fees = Number(revenue.fees || 0);

  res.json({
    instructor: {
      commission_rate: commissionRate,
      price_authorized: !!req.user.price_authorized,
      status: req.user.instructor_status,
    },
    totals: {
      courses: courses.length,
      published: courses.filter((course) => course.status === 'published').length,
      students: Number(students.total || 0),
      lessons: Number(lessons.total || 0),
      gross_cents: gross,
      net_cents: gross - fees,
      platform_fee_cents: fees,
    },
    courses,
    recent_enrollments: recent,
  });
});

function ownCourse(req) {
  const course = get('SELECT * FROM courses WHERE id = ?', [req.params.id]);
  if (!course) throw bad('Curso no encontrado.', 404);
  if (course.instructor_id !== req.user.id && req.user.role !== 'admin') {
    throw bad('Este curso no te pertenece.', 403);
  }
  return course;
}

router.get('/courses/:id', requireInstructor, (req, res, next) => {
  try {
    const course = ownCourse(req);
    const lessons = all('SELECT * FROM lessons WHERE course_id = ? ORDER BY position ASC, id ASC', [course.id]);
    res.json({
      course: courseCard(get(`${COURSE_CARD_SELECT} WHERE c.id = ?`, [course.id])),
      lessons,
      resources: resourcesOf(course.id),
      quiz: quizMeta(course.id),
      quiz_questions: all(
        `SELECT q.* FROM quiz_questions q JOIN quizzes z ON z.id = q.quiz_id WHERE z.course_id = ? ORDER BY q.position ASC`,
        [course.id]
      ).map((question) => ({ ...question, options: JSON.parse(question.options) })),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/courses', requireInstructor, (req, res, next) => {
  try {
    const title = text(req.body?.title, 140);
    if (title.length < 6) throw bad('El título debe tener al menos 6 caracteres.');
    const category = get('SELECT slug FROM categories WHERE slug = ?', [text(req.body?.category_slug, 60)]);
    if (!category) throw bad('Elige una categoría.');
    const subcategory = get('SELECT slug FROM subcategories WHERE slug = ? AND category_slug = ?', [
      text(req.body?.subcategory_slug, 60),
      category.slug,
    ]);
    if (!subcategory) throw bad('Elige una habilidad dentro de la categoría.');

    const level = LEVELS.includes(req.body?.level) ? req.body.level : 'principiante';
    const base = `${title}-${Date.now().toString(36)}`;
    const slug = base
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70);

    const id = insert(
      `INSERT INTO courses (slug, title, subtitle, description, cover_gradient, category_slug, subcategory_slug, level,
        duration_minutes, instructor_id, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        slug,
        title,
        text(req.body?.subtitle, 180),
        text(req.body?.description, 4000),
        GRADIENTS.includes(req.body?.cover_gradient) ? req.body.cover_gradient : 'aurora',
        category.slug,
        subcategory.slug,
        level,
        Math.max(toInt(req.body?.duration_minutes, 0), 0),
        req.user.id,
        'draft',
        nowIso(),
        nowIso(),
      ]
    );
    const row = get(`${COURSE_CARD_SELECT} WHERE c.id = ?`, [id]);
    res.status(201).json({ course: courseCard(row) });
  } catch (error) {
    next(error);
  }
});

router.put('/courses/:id', requireInstructor, (req, res, next) => {
  try {
    const course = ownCourse(req);
    if (course.status === 'in_review') throw bad('El curso está en revisión administrativa; no puedes editarlo ahora.');

    const updates = [];
    const params = [];
    if (req.body?.title !== undefined) {
      const title = text(req.body.title, 140);
      if (title.length < 6) throw bad('El título debe tener al menos 6 caracteres.');
      updates.push('title = ?');
      params.push(title);
    }
    if (req.body?.subtitle !== undefined) {
      updates.push('subtitle = ?');
      params.push(text(req.body.subtitle, 180));
    }
    if (req.body?.description !== undefined) {
      updates.push('description = ?');
      params.push(text(req.body.description, 4000));
    }
    if (req.body?.level !== undefined) {
      if (!LEVELS.includes(req.body.level)) throw bad('Nivel inválido.');
      updates.push('level = ?');
      params.push(req.body.level);
    }
    if (req.body?.cover_gradient !== undefined) {
      if (!GRADIENTS.includes(req.body.cover_gradient)) throw bad('Portada inválida.');
      updates.push('cover_gradient = ?');
      params.push(req.body.cover_gradient);
    }
    if (req.body?.category_slug !== undefined || req.body?.subcategory_slug !== undefined) {
      const categorySlug = text(req.body?.category_slug, 60) || course.category_slug;
      const subSlug = text(req.body?.subcategory_slug, 60) || course.subcategory_slug;
      const category = get('SELECT slug FROM categories WHERE slug = ?', [categorySlug]);
      const sub = get('SELECT slug FROM subcategories WHERE slug = ? AND category_slug = ?', [subSlug, categorySlug]);
      if (!category || !sub) throw bad('Categoría o habilidad inválida.');
      updates.push('category_slug = ?', 'subcategory_slug = ?');
      params.push(category.slug, sub.slug);
    }
    if (req.body?.price_cents !== undefined) {
      const price = Math.max(toInt(req.body.price_cents, 0), 0);
      if (price > 0 && !req.user.price_authorized && req.user.role !== 'admin') {
        throw bad('Para vender un curso necesitas autorización de precio. Solicítala al equipo de SKILLVERSE.', 403);
      }
      if (price > 0 && (price < 100 || price > 50000)) throw bad('El precio debe estar entre 1 € y 500 €.');
      updates.push('price_cents = ?');
      params.push(price);
    }
    if (req.body?.is_premium !== undefined) {
      if (req.user.role !== 'admin') throw bad('Solo el equipo de SKILLVERSE marca cursos como Premium.', 403);
      updates.push('is_premium = ?');
      params.push(req.body.is_premium ? 1 : 0);
    }
    if (req.body?.duration_minutes !== undefined) {
      updates.push('duration_minutes = ?');
      params.push(Math.max(toInt(req.body.duration_minutes, 0), 0));
    }

    if (!updates.length) throw bad('No hay cambios para guardar.');
    updates.push('updated_at = ?');
    params.push(nowIso(), course.id);
    run(`UPDATE courses SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ course: courseCard(get(`${COURSE_CARD_SELECT} WHERE c.id = ?`, [course.id])) });
  } catch (error) {
    next(error);
  }
});

router.delete('/courses/:id', requireInstructor, (req, res, next) => {
  try {
    const course = ownCourse(req);
    if (course.status === 'published' && Number(get('SELECT COUNT(*) AS total FROM enrollments WHERE course_id = ?', [course.id])?.total || 0) > 0) {
      throw bad('No puedes eliminar un curso publicado con estudiantes inscritos. Archívalo o contacta al equipo.');
    }
    run('DELETE FROM courses WHERE id = ?', [course.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/courses/:id/lessons', requireInstructor, (req, res, next) => {
  try {
    const course = ownCourse(req);
    if (course.status === 'in_review') throw bad('El curso está en revisión y no admite cambios.');
    const title = text(req.body?.title, 140);
    if (title.length < 3) throw bad('La lección necesita un título.');
    const type = ['texto', 'video', 'practica'].includes(req.body?.type) ? req.body.type : 'texto';
    const position = toInt(req.body?.position, 0) || Number(get('SELECT COUNT(*) AS total FROM lessons WHERE course_id = ?', [course.id])?.total || 0) + 1;
    const id = insert(
      'INSERT INTO lessons (course_id, position, title, summary, type, content, video_url, duration_minutes, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [
        course.id,
        position,
        title,
        text(req.body?.summary, 300),
        type,
        text(req.body?.content, 20000),
        text(req.body?.video_url, 400),
        Math.max(toInt(req.body?.duration_minutes, 10), 1),
        nowIso(),
      ]
    );
    run('UPDATE courses SET updated_at = ? WHERE id = ?', [nowIso(), course.id]);
    res.status(201).json({ lesson: get('SELECT * FROM lessons WHERE id = ?', [id]) });
  } catch (error) {
    next(error);
  }
});

router.put('/lessons/:id', requireInstructor, (req, res, next) => {
  try {
    const lesson = get('SELECT * FROM lessons WHERE id = ?', [req.params.id]);
    if (!lesson) throw bad('Lección no encontrada.', 404);
    const course = get('SELECT * FROM courses WHERE id = ?', [lesson.course_id]);
    if (course.instructor_id !== req.user.id && req.user.role !== 'admin') throw bad('Esta lección no te pertenece.', 403);
    if (course.status === 'in_review') throw bad('El curso está en revisión y no admite cambios.');

    const updates = [];
    const params = [];
    if (req.body?.title !== undefined) {
      const title = text(req.body.title, 140);
      if (title.length < 3) throw bad('La lección necesita un título.');
      updates.push('title = ?');
      params.push(title);
    }
    if (req.body?.summary !== undefined) {
      updates.push('summary = ?');
      params.push(text(req.body.summary, 300));
    }
    if (req.body?.content !== undefined) {
      updates.push('content = ?');
      params.push(text(req.body.content, 20000));
    }
    if (req.body?.video_url !== undefined) {
      const url = text(req.body.video_url, 400);
      if (url && !/^https?:\/\//i.test(url)) throw bad('El video debe ser un enlace http(s).');
      updates.push('video_url = ?');
      params.push(url);
    }
    if (req.body?.duration_minutes !== undefined) {
      updates.push('duration_minutes = ?');
      params.push(Math.max(toInt(req.body.duration_minutes, 10), 1));
    }
    if (req.body?.position !== undefined) {
      updates.push('position = ?');
      params.push(Math.max(toInt(req.body.position, 1), 1));
    }
    if (req.body?.type !== undefined) {
      if (!['texto', 'video', 'practica'].includes(req.body.type)) throw bad('Tipo de lección inválido.');
      updates.push('type = ?');
      params.push(req.body.type);
    }
    if (!updates.length) throw bad('No hay cambios para guardar.');
    params.push(lesson.id);
    run(`UPDATE lessons SET ${updates.join(', ')} WHERE id = ?`, params);
    run('UPDATE courses SET updated_at = ? WHERE id = ?', [nowIso(), course.id]);
    res.json({ lesson: get('SELECT * FROM lessons WHERE id = ?', [lesson.id]) });
  } catch (error) {
    next(error);
  }
});

router.delete('/lessons/:id', requireInstructor, (req, res, next) => {
  try {
    const lesson = get('SELECT * FROM lessons WHERE id = ?', [req.params.id]);
    if (!lesson) throw bad('Lección no encontrada.', 404);
    const course = get('SELECT * FROM courses WHERE id = ?', [lesson.course_id]);
    if (course.instructor_id !== req.user.id && req.user.role !== 'admin') throw bad('Esta lección no te pertenece.', 403);
    run('DELETE FROM lessons WHERE id = ?', [lesson.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/courses/:id/resources', requireInstructor, (req, res, next) => {
  try {
    const course = ownCourse(req);
    const title = text(req.body?.title, 140);
    const url = text(req.body?.url, 500);
    if (title.length < 3) throw bad('El recurso necesita un título.');
    if (!/^https?:\/\//i.test(url)) throw bad('El recurso debe ser un enlace http(s) válido.');
    const lessonId = req.body?.lesson_id ? toInt(req.body.lesson_id, 0) : null;
    const id = insert('INSERT INTO resources (course_id, lesson_id, title, url, kind, created_at) VALUES (?,?,?,?,?,?)', [
      course.id,
      lessonId,
      title,
      url,
      text(req.body?.kind, 40) || 'enlace',
      nowIso(),
    ]);
    res.status(201).json({ resource: get('SELECT * FROM resources WHERE id = ?', [id]) });
  } catch (error) {
    next(error);
  }
});

router.delete('/resources/:id', requireInstructor, (req, res, next) => {
  try {
    const resource = get('SELECT * FROM resources WHERE id = ?', [req.params.id]);
    if (!resource) throw bad('Recurso no encontrado.', 404);
    const course = get('SELECT * FROM courses WHERE id = ?', [resource.course_id]);
    if (course.instructor_id !== req.user.id && req.user.role !== 'admin') throw bad('Este recurso no te pertenece.', 403);
    run('DELETE FROM resources WHERE id = ?', [resource.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.put('/courses/:id/quiz', requireInstructor, (req, res, next) => {
  try {
    const course = ownCourse(req);
    const questions = Array.isArray(req.body?.questions) ? req.body.questions : [];
    if (!questions.length) throw bad('Añade al menos una pregunta.');
    if (questions.length > 30) throw bad('Máximo 30 preguntas por evaluación.');

    const cleaned = questions.map((question, index) => {
      const prompt = text(question?.prompt, 500);
      const options = Array.isArray(question?.options) ? question.options.map((option) => text(option, 240)).filter(Boolean) : [];
      const correct = toInt(question?.correct_index, -1);
      if (prompt.length < 5) throw bad(`La pregunta ${index + 1} necesita un enunciado.`);
      if (options.length < 2) throw bad(`La pregunta ${index + 1} necesita al menos dos opciones.`);
      if (correct < 0 || correct >= options.length) throw bad(`Marca la respuesta correcta de la pregunta ${index + 1}.`);
      return { prompt, options, correct, explanation: text(question?.explanation, 500) };
    });

    tx(() => {
      const existing = get('SELECT * FROM quizzes WHERE course_id = ?', [course.id]);
      if (existing) {
        run('DELETE FROM quiz_questions WHERE quiz_id = ?', [existing.id]);
        run('DELETE FROM quiz_attempts WHERE quiz_id = ?', [existing.id]);
        run('DELETE FROM quizzes WHERE id = ?', [existing.id]);
      }
      const quizId = insert('INSERT INTO quizzes (course_id, title, description, pass_score, created_at) VALUES (?,?,?,?,?)', [
        course.id,
        text(req.body?.title, 160) || 'Evaluación final',
        text(req.body?.description, 500),
        Math.min(Math.max(toInt(req.body?.pass_score, 70), 50), 100),
        nowIso(),
      ]);
      cleaned.forEach((question, index) => {
        insert('INSERT INTO quiz_questions (quiz_id, position, prompt, options, correct_index, explanation) VALUES (?,?,?,?,?,?)', [
          quizId,
          index + 1,
          question.prompt,
          JSON.stringify(question.options),
          question.correct,
          question.explanation,
        ]);
      });
    });

    res.json({ quiz: quizMeta(course.id) });
  } catch (error) {
    next(error);
  }
});

router.post('/courses/:id/submit', requireInstructor, (req, res, next) => {
  try {
    const course = ownCourse(req);
    const lessons = lessonsOf(course.id, { withContent: true });
    if (lessons.length < 2) throw bad('Necesitas al menos dos lecciones antes de publicar.');
    if (lessons.some((lesson) => lesson.content.trim().length < 40)) {
      throw bad('Cada lección necesita contenido real (mínimo 40 caracteres).');
    }
    if (text(course.description, 4000).length < 60) throw bad('La descripción del curso debe tener al menos 60 caracteres.');

    if (course.price_cents > 0) {
      run('UPDATE courses SET status = ?, review_note = ?, updated_at = ? WHERE id = ?', [
        'in_review',
        'Curso comercial enviado a revisión administrativa.',
        nowIso(),
        course.id,
      ]);
      return res.json({
        status: 'in_review',
        message: 'Curso comercial enviado a revisión. Un administrador debe aprobarlo antes de publicarse.',
      });
    }

    run('UPDATE courses SET status = ?, published_at = ?, updated_at = ?, review_note = ? WHERE id = ?', [
      'published',
      nowIso(),
      nowIso(),
      'Publicación gratuita de instructor aprobado.',
      course.id,
    ]);
    res.json({ status: 'published', message: 'Curso gratuito publicado. Ya aparece en el catálogo.' });
  } catch (error) {
    next(error);
  }
});

router.post('/courses/:id/archive', requireInstructor, (req, res, next) => {
  try {
    const course = ownCourse(req);
    run('UPDATE courses SET status = ?, updated_at = ? WHERE id = ?', ['archived', nowIso(), course.id]);
    res.json({ ok: true, message: 'Curso archivado. Los estudiantes conservan su acceso.' });
  } catch (error) {
    next(error);
  }
});

router.get('/courses/:id/students', requireInstructor, (req, res, next) => {
  try {
    const course = ownCourse(req);
    const rows = all(
      `SELECT u.id, u.username, u.name, u.avatar_url, e.created_at, e.last_lesson_id, e.completed_at
       FROM enrollments e JOIN users u ON u.id = e.user_id WHERE e.course_id = ? ORDER BY e.created_at DESC`,
      [course.id]
    );
    res.json({
      students: rows.map((row) => ({
        ...row,
        progress: progressFor(row.id, course.id),
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
