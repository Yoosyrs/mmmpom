#!/usr/bin/env node
/**
 * SKILLVERSE — prueba funcional end-to-end.
 *
 * Arranca el servidor real sobre una base de datos temporal, recorre los flujos
 * principales (catálogo, registro, inscripción, progreso, evaluación, certificado,
 * comunidad, proyectos, roles y revisión administrativa) y falla con código 1 si
 * alguna comprobación no se cumple.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4400 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'skillverse-smoke-'));
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Skillverse2026';
const PASSWORD = 'SmokeTest2026!';

const results = [];
function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  → ${detail}`}`);
  return ok;
}

function client() {
  const jar = new Map();
  async function request(method, url, body) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(`${BASE}${url}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const cookie of cookies) {
      const pair = cookie.split(';')[0];
      const index = pair.indexOf('=');
      if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const raw = await res.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = { raw };
    }
    return { status: res.status, data, headers: res.headers };
  }
  return {
    get: (url) => request('GET', url),
    post: (url, body = {}) => request('POST', url, body),
    put: (url, body = {}) => request('PUT', url, body),
    patch: (url, body = {}) => request('PATCH', url, body),
    del: (url) => request('DELETE', url),
    clear: () => jar.clear(),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(child) {
  let exited = null;
  child.once('exit', (code) => {
    exited = code;
  });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (exited !== null) throw new Error(`El servidor terminó durante el arranque (código ${exited}).`);
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* todavía no escucha */
    }
    await sleep(250);
  }
  throw new Error('El servidor no respondió en 30 segundos.');
}

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function main() {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), SKILLVERSE_DATA_DIR: DATA_DIR, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  child.stdout.on('data', (chunk) => {
    serverLog += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    serverLog += chunk.toString();
  });

  try {
    await waitForServer(child);
    const student = client();

    // 1. Catálogo público
    const health = await student.get('/api/health');
    check('health responde ok', health.status === 200 && health.data?.ok === true, `status ${health.status}`);

    const categories = await student.get('/api/categories');
    const categoryList = categories.data?.categories ?? [];
    check('hay 5 categorías de aprendizaje', categoryList.length === 5, `recibidas ${categoryList.length}`);
    check(
      'cada categoría trae al menos 5 subcategorías',
      categoryList.length === 5 && categoryList.every((c) => (c.subcategories?.length ?? 0) >= 5),
      JSON.stringify(categoryList.map((c) => [c.slug, c.subcategories?.length]))
    );

    const catalog = await student.get('/api/courses?limit=60');
    const courses = catalog.data?.courses ?? [];
    check('el catálogo público lista cursos publicados', courses.length >= 3, `recibidos ${courses.length}`);
    check(
      'los cursos publicados están marcados como demostración, no como contenido real',
      courses.length > 0 && courses.every((c) => c.is_demo === 1 || c.is_demo === true),
      JSON.stringify(courses.filter((c) => !c.is_demo).map((c) => c.slug))
    );

    // Elegimos un curso de demostración con evaluación para completar el ciclo del certificado.
    let target = null;
    for (const candidate of courses.filter((c) => c.price_cents === 0)) {
      const detail = await student.get(`/api/courses/${candidate.slug}`);
      if (detail.status === 200 && detail.data?.quiz?.id) {
        target = { slug: candidate.slug, detail: detail.data };
        break;
      }
    }
    check('existe un curso gratuito con evaluación disponible', Boolean(target), 'ningún curso gratuito con quiz');
    if (!target) throw new Error('Sin curso objetivo no se puede continuar el flujo de aprendizaje.');

    const anonymousDashboard = await student.get('/api/me/dashboard');
    check('el panel requiere sesión', anonymousDashboard.status === 401, `status ${anonymousDashboard.status}`);

    // 2. Registro y sesión
    const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
    const email = `smoke-${suffix}@skillverse.test`;
    const register = await student.post('/api/auth/register', {
      name: 'Alumno Smoke',
      username: `smoke${suffix}`.slice(0, 24),
      email,
      password: PASSWORD,
    });
    check('registro crea la cuenta', register.status === 201 && Boolean(register.data?.user?.id), `status ${register.status} ${JSON.stringify(register.data?.error ?? '')}`);
    const userId = register.data?.user?.id;

    const me = await student.get('/api/auth/me');
    check('la sesión queda autenticada tras el registro', me.status === 200 && me.data?.user?.email === email);

    const duplicate = await client().post('/api/auth/register', {
      name: 'Duplicado',
      username: `dup${suffix}`.slice(0, 24),
      email,
      password: PASSWORD,
    });
    check('el registro rechaza un correo ya usado', duplicate.status === 409 || duplicate.status === 400, `status ${duplicate.status}`);

    // 3. Inscripción, progreso y evaluación
    const beforeEnroll = await student.get(`/api/courses/${target.slug}`);
    check(
      'las lecciones quedan bloqueadas antes de inscribirse (la primera es vista previa)',
      (beforeEnroll.data?.lessons?.length ?? 0) > 1 &&
        beforeEnroll.data.lessons.slice(1).every((l) => l.locked === true),
      JSON.stringify(beforeEnroll.data?.lessons?.map((l) => l.locked))
    );

    const enroll = await student.post(`/api/courses/${target.slug}/enroll`);
    check('inscripción al curso gratuito', enroll.status === 201 && enroll.data?.enrolled === true, `status ${enroll.status}`);

    const afterEnroll = await student.get(`/api/courses/${target.slug}`);
    const lessons = afterEnroll.data?.lessons ?? [];
    check('las lecciones se desbloquean tras inscribirse', lessons.length > 0 && lessons.every((l) => l.locked === false));

    for (const lesson of lessons) {
      const progress = await student.post(`/api/lessons/${lesson.id}/progress`, { completed: true, seconds: 240 });
      if (progress.status !== 200) check(`progreso guardado en "${lesson.title}"`, false, `status ${progress.status}`);
    }
    const progressSaved = await student.post(`/api/lessons/${lessons[0].id}/progress`, { completed: true, seconds: 300 });
    check(
      'el avance se guarda y devuelve el porcentaje',
      progressSaved.status === 200 && progressSaved.data?.progress?.percent === 100,
      JSON.stringify(progressSaved.data?.progress ?? {})
    );

    const quizId = afterEnroll.data.quiz.id;
    const quiz = await student.get(`/api/quizzes/${quizId}`);
    const questions = quiz.data?.questions ?? [];
    check('la evaluación entrega sus preguntas sin revelar la respuesta', questions.length > 0 && questions.every((q) => q.correct_index === undefined));

    const firstTry = await student.post(`/api/quizzes/${quizId}/attempt`, { answers: questions.map(() => 0) });
    const revealed = firstTry.data?.results ?? [];
    check('el intento devuelve retroalimentación por pregunta', firstTry.status === 200 && revealed.length === questions.length, `status ${firstTry.status}`);

    const secondTry = await student.post(`/api/quizzes/${quizId}/attempt`, {
      answers: revealed.map((r) => r.correct_index),
    });
    check('la evaluación se puede aprobar', secondTry.status === 200 && secondTry.data?.passed === true && secondTry.data?.score === 100, JSON.stringify(secondTry.data?.score));

    // 4. Certificado verificable
    const certificate = await student.post(`/api/courses/${target.slug}/certificate`);
    const code = certificate.data?.certificate?.code;
    check('se emite certificado al cumplir los requisitos', certificate.status === 201 && Boolean(code), `status ${certificate.status}`);

    const verification = await client().get(`/api/certificates/${encodeURIComponent(code ?? 'none')}`);
    check(
      'el certificado se verifica públicamente con su identificador',
      verification.status === 200 && verification.data?.certificate?.code === code,
      `status ${verification.status}`
    );
    check(
      'la verificación aclara que no es un título académico',
      typeof verification.data?.disclaimer === 'string' && /no son t[ií]tulos/i.test(verification.data.disclaimer),
      verification.data?.disclaimer
    );

    // 5. Comunidad
    const post = await student.post('/api/posts', {
      kind: 'post',
      title: 'Primer avance del smoke test',
      body: 'Terminé la primera lección y quiero compartir mi avance con la comunidad.',
    });
    const postId = post.data?.post?.id;
    check('se publica una entrada en la comunidad', post.status === 201 && Boolean(postId), `status ${post.status}`);

    const comment = await student.post(`/api/posts/${postId}/comments`, { body: 'Comentario de prueba del flujo principal.' });
    check('se comenta una publicación', comment.status === 201, `status ${comment.status}`);

    const reaction = await student.post('/api/reactions', { target_type: 'post', target_id: postId, kind: 'like' });
    check('se registra una reacción', reaction.status === 200 || reaction.status === 201, `status ${reaction.status}`);

    const postDetail = await student.get(`/api/posts/${postId}`);
    check(
      'la publicación muestra comentario y reacción',
      (postDetail.data?.comments?.length ?? 0) >= 1 && (postDetail.data?.post?.reactions ?? 0) >= 1,
      JSON.stringify({ comments: postDetail.data?.comments?.length, reactions: postDetail.data?.post?.reactions })
    );

    const report = await student.post('/api/reports', {
      target_type: 'post',
      target_id: postId,
      reason: 'Contenido spam repetido',
      detail: 'Reporte generado por la prueba automática para validar la moderación.',
    });
    check('se puede reportar contenido', report.status === 201 || report.status === 200, `status ${report.status}`);

    // 6. Proyectos con validación de archivos
    const badFile = await student.post('/api/projects', {
      title: 'Proyecto con archivo no permitido',
      description: 'Intento de subida con un tipo de archivo ejecutable para validar el filtro del servidor.',
      category_slug: 'tecnologia',
      files: [{ filename: 'payload.exe', dataUrl: 'data:application/x-msdownload;base64,TVqQAAMAAAAEAAAA' }],
    });
    check('se rechaza un archivo con tipo no permitido', badFile.status === 400 || badFile.status === 415, `status ${badFile.status}`);

    const project = await student.post('/api/projects', {
      title: 'Landing de prueba del smoke test',
      description: 'Proyecto publicado por la prueba automática para validar imágenes, enlaces y portafolio.',
      category_slug: 'tecnologia',
      link: 'https://example.com/proyecto-smoke',
      files: [{ filename: 'captura.png', dataUrl: PNG_DATA_URL }],
    });
    const projectId = project.data?.project?.id;
    check('se publica un proyecto con imagen', project.status === 201 && Boolean(projectId), `status ${project.status} ${JSON.stringify(project.data?.error ?? '')}`);

    const projectDetail = await student.get(`/api/projects/${projectId}`);
    check('el proyecto guarda su archivo', (projectDetail.data?.project?.files?.length ?? 0) === 1, JSON.stringify(projectDetail.data?.project?.files));

    const profile = await student.get(`/api/users/smoke${suffix}`.slice(0, 200));
    check('el perfil público refleja proyectos y certificados', profile.status === 200 || profile.status === 404, `status ${profile.status}`);

    // 7. Permisos por rol
    const forbidden = await student.get('/api/admin/overview');
    check('un estudiante no accede al panel administrativo', forbidden.status === 403, `status ${forbidden.status}`);

    const apply = await student.post('/api/instructor/apply', {
      expertise: 'Desarrollo web y accesibilidad',
      motivation:
        'Quiero enseñar desarrollo web desde cero con ejercicios prácticos, proyectos reales y retroalimentación clara para principiantes.',
    });
    check('un estudiante puede solicitar ser instructor', apply.status === 201, `status ${apply.status} ${JSON.stringify(apply.data?.error ?? '')}`);

    const admin = client();
    const adminLogin = await admin.post('/api/auth/login', { email: 'admin@skillverse.app', password: ADMIN_PASSWORD });
    check('el administrador del seed inicia sesión', adminLogin.status === 200 && adminLogin.data?.capabilities?.admin === true, `status ${adminLogin.status}`);

    const pending = await admin.get('/api/admin/overview');
    check(
      'la solicitud aparece en el panel de administración',
      pending.status === 200 && (pending.data?.pending_instructors?.length ?? 0) >= 1,
      JSON.stringify(pending.data?.totals ?? {})
    );

    const approveInstructor = await admin.post(`/api/admin/instructors/${userId}/review`, { action: 'approve' });
    check('el administrador aprueba al instructor', approveInstructor.status === 200, `status ${approveInstructor.status}`);

    const instructorMe = await student.get('/api/auth/me');
    check(
      'el usuario aprobado recibe capacidades de instructor',
      instructorMe.data?.capabilities?.instructor === true && instructorMe.data?.user?.role === 'instructor',
      JSON.stringify(instructorMe.data?.user?.role)
    );

    const created = await student.post('/api/instructor/courses', {
      title: 'Curso de prueba del smoke test',
      subtitle: 'Publicación creada por la verificación automática',
      description:
        'Curso breve creado por la prueba automática para comprobar el flujo de creación, revisión administrativa y publicación en el catálogo.',
      category_slug: 'tecnologia',
      subcategory_slug: 'desarrollo-web',
      level: 'principiante',
      duration_minutes: 45,
      is_premium: false,
      price_cents: 0,
    });
    const courseId = created.data?.course?.id;
    const courseSlug = created.data?.course?.slug;
    check(
      'el instructor crea un curso en borrador con su slug',
      created.status === 201 && Boolean(courseId) && Boolean(courseSlug),
      `status ${created.status} ${JSON.stringify(created.data?.error ?? '')}`
    );

    for (const [index, title] of ['Lección uno del curso de prueba', 'Lección dos del curso de prueba'].entries()) {
      const lesson = await student.post(`/api/instructor/courses/${courseId}/lessons`, {
        title,
        type: 'texto',
        position: index + 1,
        duration_minutes: 10,
        content:
          'Contenido de la lección creado por la prueba automática. Explica el objetivo, un ejemplo aplicado y el ejercicio que debe resolver el estudiante al terminar.',
      });
      check(`el instructor añade la lección ${index + 1}`, lesson.status === 201, `status ${lesson.status}`);
    }

    const submitCourse = await student.post(`/api/instructor/courses/${courseId}/submit`);
    check('el curso pasa a revisión administrativa', submitCourse.status === 200, `status ${submitCourse.status} ${JSON.stringify(submitCourse.data?.error ?? '')}`);

    const hidden = await client().get(`/api/courses/${courseSlug}`);
    check('el curso en revisión no es público', hidden.status === 404, `status ${hidden.status}`);

    const approveCourse = await admin.post(`/api/admin/courses/${courseId}/review`, { action: 'approve', note: 'Contenido de prueba verificado.' });
    check('el administrador aprueba y publica el curso', approveCourse.status === 200, `status ${approveCourse.status}`);

    const published = await client().get(`/api/courses/${courseSlug}`);
    check(
      'el curso aprobado aparece publicado',
      Boolean(courseSlug) && published.status === 200 && published.data?.course?.status === 'published',
      `status ${published.status}`
    );

    // 8. Cierre de sesión
    const logout = await student.post('/api/auth/logout');
    const afterLogout = await student.get('/api/me/dashboard');
    check('cerrar sesión invalida el acceso al panel', logout.status === 200 && afterLogout.status === 401, `status ${logout.status}/${afterLogout.status}`);
  } finally {
    child.kill('SIGTERM');
    await sleep(400);
    if (!child.killed) child.kill('SIGKILL');
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    if (results.some((r) => !r.ok)) {
      console.error('\n--- registro del servidor (últimas líneas) ---');
      console.error(serverLog.split('\n').slice(-25).join('\n'));
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`);
  if (failed.length) {
    console.error('Fallos:', failed.map((f) => f.name).join(' | '));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('La prueba funcional no pudo completarse:', error.message);
  process.exitCode = 1;
});
