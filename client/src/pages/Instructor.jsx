import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate, formatDuration, formatPrice, LEVELS, LEVEL_LABEL, timeAgo } from '../lib/api.js';
import { useSession } from '../App.jsx';
import { Avatar, Badge, Empty, ErrorState, Field, Loading, Modal, Notice, Progress, toast } from '../components/ui.jsx';

const STATUS_LABEL = {
  draft: 'Borrador',
  in_review: 'En revisión',
  published: 'Publicado',
  rejected: 'Rechazado',
  archived: 'Archivado',
};

const STATUS_KIND = {
  draft: '',
  in_review: 'warn',
  published: 'ok',
  rejected: 'danger',
  archived: '',
};

const CATEGORIES = [
  { slug: 'tecnologia', name: 'Tecnología' },
  { slug: 'diseno', name: 'Diseño' },
  { slug: 'negocios', name: 'Negocios' },
  { slug: 'contenido', name: 'Creación de contenido' },
  { slug: 'practicas', name: 'Habilidades prácticas' },
];

const EMPTY_COURSE = {
  title: '',
  subtitle: '',
  description: '',
  category_slug: 'tecnologia',
  level: 'principiante',
  duration_minutes: 60,
  cover_gradient: 'aurora',
  is_premium: false,
  price_cents: 0,
};

const EMPTY_LESSON = { title: '', type: 'texto', content: '', video_url: '', summary: '', position: 0 };
const EMPTY_RESOURCE = { title: '', url: '', kind: 'enlace' };
const EMPTY_QUESTION = { prompt: '', options: ['', '', '', ''], correct_index: 0, explanation: '' };

export default function Instructor() {
  const { capabilities, user } = useSession();
  const [overview, setOverview] = useState({ loading: true, error: null, data: null });
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(EMPTY_COURSE);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(() => {
    setOverview((prev) => ({ ...prev, loading: true, error: null }));
    api
      .get('/instructor/overview')
      .then((data) => setOverview({ loading: false, error: null, data }))
      .catch((error) => setOverview({ loading: false, error, data: null }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (overview.loading) return <div className="container page"><Loading label="Cargando tu panel de instructor…" /></div>;
  if (overview.error) return <div className="container page"><ErrorState error={overview.error} onRetry={load} /></div>;

  const { instructor, totals, courses, recent_enrollments: recentEnrollments } = overview.data;

  if (editingId) {
    return <CourseEditor id={editingId} onBack={() => { setEditingId(null); load(); }} />;
  }

  async function createCourse(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api.post('/instructor/courses', {
        ...draft,
        duration_minutes: Number(draft.duration_minutes) || 60,
        price_cents: draft.is_premium ? Number(draft.price_cents) || 0 : 0,
      });
      toast('Curso creado como borrador. Añade lecciones y envíalo a revisión.');
      setCreating(false);
      setDraft(EMPTY_COURSE);
      load();
      if (data.course?.id) setEditingId(data.course.id);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const priceAllowed = instructor.price_authorized;

  return (
    <div className="container page">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="eyebrow">Panel de instructor</span>
          <h1 className="mb-0">Tus cursos</h1>
          <p className="muted small mt-0">
            Comisión de plataforma: {Math.round((instructor.commission_rate || 0) * 100)}% · Estado: {STATUS_LABEL[instructor.status] || instructor.status}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>Crear curso</button>
      </div>

      {!priceAllowed ? (
        <Notice kind="info">
          Puedes publicar cursos gratuitos ahora mismo. Para fijar precios necesitas autorización de administración;
          solicítala con el detalle de tu experiencia y se revisará antes de habilitar cobros.
        </Notice>
      ) : (
        <Notice kind="ok">Tu cuenta tiene autorización para publicar cursos de pago. Cada curso comercial pasa por revisión antes de publicarse.</Notice>
      )}

      <div className="stats-row mt-2">
        <div className="kpi"><strong>{totals.courses}</strong><span className="tiny muted">cursos</span></div>
        <div className="kpi"><strong>{totals.published}</strong><span className="tiny muted">publicados</span></div>
        <div className="kpi"><strong>{totals.students}</strong><span className="tiny muted">estudiantes</span></div>
        <div className="kpi"><strong>{totals.lessons}</strong><span className="tiny muted">lecciones</span></div>
        <div className="kpi"><strong>{formatPrice(totals.gross_cents)}</strong><span className="tiny muted">ventas brutas</span></div>
        <div className="kpi"><strong>{formatPrice(totals.net_cents)}</strong><span className="tiny muted">tus ingresos</span></div>
      </div>

      <section className="section">
        <h3>Cursos</h3>
        {courses?.length ? (
          <div className="list">
            {courses.map((course) => (
              <div key={course.id} className="list-item">
                <div>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <strong>{course.title}</strong>
                    <Badge kind={STATUS_KIND[course.status]}>{STATUS_LABEL[course.status] || course.status}</Badge>
                    {course.is_premium ? <Badge kind="premium">De pago</Badge> : <Badge kind="free">Gratuito</Badge>}
                  </div>
                  <div className="tiny muted">
                    {course.category_name || course.category_slug} · {course.lesson_count || 0} lecciones · {course.students || 0} estudiantes
                    {course.review_note ? ` · Nota de revisión: ${course.review_note}` : ''}
                  </div>
                </div>
                <div className="row">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingId(course.id)}>Editar</button>
                  {course.status === 'published' ? (
                    <Link to={`/cursos/${course.slug}`} className="btn btn-ghost btn-sm">Ver público</Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Todavía no tienes cursos" action={<button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>Crear el primero</button>}>
            Un curso necesita título, descripción, al menos una lección y una evaluación para enviarse a revisión.
          </Empty>
        )}
      </section>

      <section className="section">
        <h3>Últimas inscripciones</h3>
        {recentEnrollments?.length ? (
          <div className="list">
            {recentEnrollments.map((row, index) => (
              <div key={`${row.username}-${index}`} className="list-item">
                <div className="row">
                  <Avatar user={row} size={32} />
                  <div>
                    <strong>{row.name || row.username}</strong>
                    <div className="tiny muted">{row.course_title} · {timeAgo(row.created_at)}</div>
                  </div>
                </div>
                <Link to={`/perfil/${row.username}`} className="btn btn-ghost btn-sm">Perfil</Link>
              </div>
            ))}
          </div>
        ) : (
          <Notice kind="info">Aún no hay inscripciones. Publica un curso gratuito para empezar.</Notice>
        )}
      </section>

      {creating ? (
        <Modal title="Crear curso" onClose={() => setCreating(false)}>
          <form className="stack" onSubmit={createCourse}>
            <Field label="Título">
              <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required minLength={6} maxLength={120} />
            </Field>
            <Field label="Subtítulo">
              <input value={draft.subtitle} onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })} maxLength={160} />
            </Field>
            <Field label="Descripción">
              <textarea rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} required minLength={30} />
            </Field>
            <div className="grid grid-2">
              <Field label="Categoría">
                <select value={draft.category_slug} onChange={(event) => setDraft({ ...draft, category_slug: event.target.value })}>
                  {CATEGORIES.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
                </select>
              </Field>
              <Field label="Nivel">
                <select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value })}>
                  {LEVELS.map((level) => <option key={level} value={level}>{LEVEL_LABEL[level]}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-2">
              <Field label="Duración estimada (minutos)">
                <input type="number" min={5} max={6000} value={draft.duration_minutes} onChange={(event) => setDraft({ ...draft, duration_minutes: event.target.value })} />
              </Field>
              <Field label="Portada">
                <select value={draft.cover_gradient} onChange={(event) => setDraft({ ...draft, cover_gradient: event.target.value })}>
                  <option value="aurora">Aurora</option>
                  <option value="nebula">Nebulosa</option>
                  <option value="candy">Candy</option>
                  <option value="teal">Turquesa</option>
                  <option value="violet">Violeta</option>
                </select>
              </Field>
            </div>
            {priceAllowed ? (
              <div className="grid grid-2">
                <Field label="¿Curso de pago?">
                  <select value={draft.is_premium ? 'yes' : 'no'} onChange={(event) => setDraft({ ...draft, is_premium: event.target.value === 'yes' })}>
                    <option value="no">Gratuito</option>
                    <option value="yes">De pago</option>
                  </select>
                </Field>
                {draft.is_premium ? (
                  <Field label="Precio en centavos" hint="Ejemplo: 4900 = 49,00">
                    <input type="number" min={100} value={draft.price_cents} onChange={(event) => setDraft({ ...draft, price_cents: event.target.value })} />
                  </Field>
                ) : null}
              </div>
            ) : null}
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creando…' : 'Crear borrador'}</button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function CourseEditor({ id, onBack }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [tab, setTab] = useState('contenido');
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState(null);
  const [lessonDraft, setLessonDraft] = useState(EMPTY_LESSON);
  const [resourceDraft, setResourceDraft] = useState(EMPTY_RESOURCE);
  const [questions, setQuestions] = useState([EMPTY_QUESTION]);
  const [passScore, setPassScore] = useState(70);
  const [students, setStudents] = useState([]);

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    api
      .get(`/instructor/courses/${id}`)
      .then((data) => {
        setState({ loading: false, error: null, data });
        setForm({
          title: data.course.title,
          subtitle: data.course.subtitle || '',
          description: data.course.description,
          category_slug: data.course.category_slug,
          level: data.course.level,
          duration_minutes: data.course.duration_minutes,
          cover_gradient: data.course.cover_gradient || 'aurora',
          is_premium: !!data.course.is_premium,
          price_cents: data.course.price_cents || 0,
        });
        setPassScore(data.quiz?.pass_score || 70);
        if (data.quiz_questions?.length) {
          setQuestions(
            data.quiz_questions.map((question) => ({
              prompt: question.prompt,
              options: question.options,
              correct_index: question.correct_index,
              explanation: question.explanation || '',
            }))
          );
        }
      })
      .catch((error) => setState({ loading: false, error, data: null }));
    api.get(`/instructor/courses/${id}/students`).then((data) => setStudents(data.students || [])).catch(() => setStudents([]));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.loading) return <div className="container page"><Loading label="Cargando curso…" /></div>;
  if (state.error) return <div className="container page"><ErrorState error={state.error} onRetry={load} /></div>;

  const { course, lessons, resources, quiz } = state.data;
  const locked = course.status === 'in_review';

  async function saveCourse(event) {
    event.preventDefault();
    setBusy('course');
    try {
      await api.put(`/instructor/courses/${id}`, {
        ...form,
        duration_minutes: Number(form.duration_minutes) || 60,
        price_cents: form.is_premium ? Number(form.price_cents) || 0 : 0,
      });
      toast('Curso actualizado.');
      load();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function addLesson(event) {
    event.preventDefault();
    setBusy('lesson');
    try {
      await api.post(`/instructor/courses/${id}/lessons`, {
        ...lessonDraft,
        position: Number(lessonDraft.position) || lessons.length + 1,
      });
      setLessonDraft(EMPTY_LESSON);
      toast('Lección añadida.');
      load();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function deleteLesson(lessonId) {
    if (!window.confirm('¿Eliminar esta lección?')) return;
    try {
      await api.del(`/instructor/lessons/${lessonId}`);
      toast('Lección eliminada.');
      load();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function addResource(event) {
    event.preventDefault();
    setBusy('resource');
    try {
      await api.post(`/instructor/courses/${id}/resources`, resourceDraft);
      setResourceDraft(EMPTY_RESOURCE);
      toast('Recurso añadido.');
      load();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function deleteResource(resourceId) {
    try {
      await api.del(`/instructor/resources/${resourceId}`);
      toast('Recurso eliminado.');
      load();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function saveQuiz(event) {
    event.preventDefault();
    setBusy('quiz');
    try {
      await api.put(`/instructor/courses/${id}/quiz`, { pass_score: Number(passScore) || 70, questions });
      toast('Evaluación guardada.');
      load();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function submitForReview() {
    setBusy('submit');
    try {
      const data = await api.post(`/instructor/courses/${id}/submit`);
      toast(data.message || 'Curso enviado a revisión.');
      load();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function archive() {
    if (!window.confirm('Archivar este curso lo ocultará del catálogo. ¿Continuar?')) return;
    setBusy('archive');
    try {
      await api.post(`/instructor/courses/${id}/archive`);
      toast('Curso archivado.');
      load();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  function updateQuestion(index, patch) {
    setQuestions((prev) => prev.map((question, position) => (position === index ? { ...question, ...patch } : question)));
  }

  function updateOption(questionIndex, optionIndex, value) {
    setQuestions((prev) =>
      prev.map((question, position) =>
        position === questionIndex
          ? { ...question, options: question.options.map((option, idx) => (idx === optionIndex ? value : option)) }
          : question
      )
    );
  }

  return (
    <div className="container page">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>← Volver al panel</button>
      <div className="row-between mt-1" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="eyebrow">Editor de curso</span>
          <h1 className="mb-0">{course.title}</h1>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <Badge kind={STATUS_KIND[course.status]}>{STATUS_LABEL[course.status] || course.status}</Badge>
            <span className="tiny muted">{lessons.length} lecciones · {formatDuration(course.duration_minutes)}</span>
          </div>
        </div>
        <div className="row">
          {course.status === 'published' ? <Link to={`/cursos/${course.slug}`} className="btn btn-ghost btn-sm">Ver público</Link> : null}
          {['draft', 'rejected'].includes(course.status) ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={submitForReview} disabled={busy === 'submit' || locked}>
              {busy === 'submit' ? 'Enviando…' : 'Enviar a revisión'}
            </button>
          ) : null}
          {course.status !== 'archived' ? (
            <button type="button" className="btn btn-danger btn-sm" onClick={archive} disabled={busy === 'archive'}>Archivar</button>
          ) : null}
        </div>
      </div>

      {course.status === 'in_review' ? (
        <Notice kind="info">Tu curso está en revisión por administración. Puedes seguir preparando lecciones, pero no se publicará hasta la aprobación.</Notice>
      ) : null}
      {course.status === 'rejected' && course.review_note ? (
        <Notice kind="error">Revisión: {course.review_note}</Notice>
      ) : null}

      <div className="tabs mt-2">
        {[
          ['contenido', 'Contenido'],
          ['lecciones', `Lecciones (${lessons.length})`],
          ['recursos', `Recursos (${resources.length})`],
          ['evaluacion', quiz ? 'Evaluación' : 'Evaluación'],
          ['estudiantes', `Estudiantes (${students.length})`],
        ].map(([value, label]) => (
          <button key={value} type="button" className={`tab${tab === value ? ' active' : ''}`} onClick={() => setTab(value)}>{label}</button>
        ))}
      </div>

      {tab === 'contenido' && form ? (
        <form className="card mt-1" onSubmit={saveCourse}>
          <div className="stack">
            <Field label="Título">
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required minLength={6} />
            </Field>
            <Field label="Subtítulo">
              <input value={form.subtitle} onChange={(event) => setForm({ ...form, subtitle: event.target.value })} />
            </Field>
            <Field label="Descripción">
              <textarea rows={5} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required minLength={30} />
            </Field>
            <div className="grid grid-2">
              <Field label="Categoría">
                <select value={form.category_slug} onChange={(event) => setForm({ ...form, category_slug: event.target.value })}>
                  {CATEGORIES.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
                </select>
              </Field>
              <Field label="Nivel">
                <select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })}>
                  {LEVELS.map((level) => <option key={level} value={level}>{LEVEL_LABEL[level]}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-2">
              <Field label="Duración (minutos)">
                <input type="number" min={5} value={form.duration_minutes} onChange={(event) => setForm({ ...form, duration_minutes: event.target.value })} />
              </Field>
              <Field label="Portada">
                <select value={form.cover_gradient} onChange={(event) => setForm({ ...form, cover_gradient: event.target.value })}>
                  <option value="aurora">Aurora</option>
                  <option value="nebula">Nebulosa</option>
                  <option value="candy">Candy</option>
                  <option value="teal">Turquesa</option>
                  <option value="violet">Violeta</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-2">
              <Field label="Modalidad">
                <select value={form.is_premium ? 'yes' : 'no'} onChange={(event) => setForm({ ...form, is_premium: event.target.value === 'yes' })}>
                  <option value="no">Gratuito</option>
                  <option value="yes">De pago</option>
                </select>
              </Field>
              {form.is_premium ? (
                <Field label="Precio (centavos)">
                  <input type="number" min={100} value={form.price_cents} onChange={(event) => setForm({ ...form, price_cents: event.target.value })} />
                </Field>
              ) : null}
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy === 'course'}>{busy === 'course' ? 'Guardando…' : 'Guardar contenido'}</button>
          </div>
        </form>
      ) : null}

      {tab === 'lecciones' ? (
        <>
          <form className="card mt-1" onSubmit={addLesson}>
            <h3 className="mt-0">Nueva lección</h3>
            <div className="grid grid-2">
              <Field label="Título">
                <input value={lessonDraft.title} onChange={(event) => setLessonDraft({ ...lessonDraft, title: event.target.value })} required minLength={3} />
              </Field>
              <Field label="Tipo">
                <select value={lessonDraft.type} onChange={(event) => setLessonDraft({ ...lessonDraft, type: event.target.value })}>
                  <option value="texto">Texto</option>
                  <option value="video">Video</option>
                  <option value="practica">Práctica</option>
                </select>
              </Field>
            </div>
            <Field label="Resumen">
              <input value={lessonDraft.summary} onChange={(event) => setLessonDraft({ ...lessonDraft, summary: event.target.value })} maxLength={240} />
            </Field>
            {lessonDraft.type === 'video' ? (
              <Field label="URL del video" hint="YouTube, Vimeo o un archivo MP4 con URL https.">
                <input value={lessonDraft.video_url} onChange={(event) => setLessonDraft({ ...lessonDraft, video_url: event.target.value })} placeholder="https://…" />
              </Field>
            ) : null}
            <Field label="Contenido" hint="Texto de la lección, instrucciones del ejercicio o guion del video.">
              <textarea rows={6} value={lessonDraft.content} onChange={(event) => setLessonDraft({ ...lessonDraft, content: event.target.value })} />
            </Field>
            <button type="submit" className="btn btn-primary" disabled={busy === 'lesson'}>{busy === 'lesson' ? 'Añadiendo…' : 'Añadir lección'}</button>
          </form>

          {lessons.length ? (
            <div className="list mt-2">
              {lessons.map((lesson, index) => (
                <div key={lesson.id} className="list-item">
                  <div>
                    <strong>{index + 1}. {lesson.title}</strong>
                    <div className="tiny muted">{lesson.type} · {formatDuration(lesson.duration_minutes || 0)}{lesson.summary ? ` · ${lesson.summary}` : ''}</div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteLesson(lesson.id)}>Eliminar</button>
                </div>
              ))}
            </div>
          ) : (
            <Notice kind="info">Añade al menos una lección antes de enviar el curso a revisión.</Notice>
          )}
        </>
      ) : null}

      {tab === 'recursos' ? (
        <>
          <form className="card mt-1" onSubmit={addResource}>
            <h3 className="mt-0">Nuevo recurso</h3>
            <div className="grid grid-3">
              <Field label="Título">
                <input value={resourceDraft.title} onChange={(event) => setResourceDraft({ ...resourceDraft, title: event.target.value })} required minLength={3} />
              </Field>
              <Field label="URL">
                <input value={resourceDraft.url} onChange={(event) => setResourceDraft({ ...resourceDraft, url: event.target.value })} placeholder="https://…" required />
              </Field>
              <Field label="Tipo">
                <select value={resourceDraft.kind} onChange={(event) => setResourceDraft({ ...resourceDraft, kind: event.target.value })}>
                  <option value="enlace">Enlace</option>
                  <option value="plantilla">Plantilla</option>
                  <option value="documento">Documento</option>
                  <option value="herramienta">Herramienta</option>
                </select>
              </Field>
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy === 'resource'}>Añadir recurso</button>
          </form>

          {resources.length ? (
            <div className="list mt-2">
              {resources.map((resource) => (
                <div key={resource.id} className="list-item">
                  <div>
                    <strong>{resource.title}</strong>
                    <div className="tiny muted"><a href={resource.url} target="_blank" rel="noopener noreferrer">{resource.url}</a></div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteResource(resource.id)}>Eliminar</button>
                </div>
              ))}
            </div>
          ) : (
            <Notice kind="info">Los recursos complementarios aparecen en la página del curso para estudiantes inscritos.</Notice>
          )}
        </>
      ) : null}

      {tab === 'evaluacion' ? (
        <form className="card mt-1" onSubmit={saveQuiz}>
          <Field label="Nota mínima para aprobar (%)">
            <input type="number" min={1} max={100} value={passScore} onChange={(event) => setPassScore(event.target.value)} />
          </Field>

          {questions.map((question, index) => (
            <div key={index} className="card mt-1" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="row-between">
                <strong>Pregunta {index + 1}</strong>
                {questions.length > 1 ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuestions((prev) => prev.filter((_, position) => position !== index))}>Quitar</button>
                ) : null}
              </div>
              <Field label="Enunciado">
                <input value={question.prompt} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} required />
              </Field>
              <div className="stack-sm">
                {question.options.map((option, optionIndex) => (
                  <label key={optionIndex} className="row" style={{ gap: 8 }}>
                    <input
                      type="radio"
                      name={`correct-${index}`}
                      checked={question.correct_index === optionIndex}
                      onChange={() => updateQuestion(index, { correct_index: optionIndex })}
                      aria-label={`Marcar opción ${optionIndex + 1} como correcta`}
                    />
                    <input value={option} onChange={(event) => updateOption(index, optionIndex, event.target.value)} placeholder={`Opción ${optionIndex + 1}`} required />
                  </label>
                ))}
              </div>
              <Field label="Explicación de la respuesta">
                <input value={question.explanation} onChange={(event) => updateQuestion(index, { explanation: event.target.value })} />
              </Field>
            </div>
          ))}

          <div className="row mt-1">
            <button type="button" className="btn btn-ghost" onClick={() => setQuestions((prev) => [...prev, { ...EMPTY_QUESTION, options: ['', '', '', ''] }])}>
              Añadir pregunta
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy === 'quiz'}>{busy === 'quiz' ? 'Guardando…' : 'Guardar evaluación'}</button>
          </div>
        </form>
      ) : null}

      {tab === 'estudiantes' ? (
        students.length ? (
          <div className="list mt-1">
            {students.map((student) => (
              <div key={student.id} className="list-item">
                <div className="row">
                  <Avatar user={student} size={32} />
                  <div>
                    <strong>{student.name}</strong>
                    <div className="tiny muted">@{student.username} · desde {formatDate(student.created_at)}</div>
                  </div>
                </div>
                <div style={{ minWidth: 140 }}>
                  <Progress value={student.progress?.percent || 0} label={`${student.progress?.percent || 0}%`} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Sin estudiantes todavía">Comparte tu curso cuando esté publicado.</Empty>
        )
      ) : null}
    </div>
  );
}
