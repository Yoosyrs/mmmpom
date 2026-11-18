import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, coverClass, formatDate, formatDuration, formatPrice, iconFor, LEVEL_LABEL, timeAgo } from '../lib/api.js';
import { useSession } from '../App.jsx';
import AdSlot from '../components/AdSlot.jsx';
import { Avatar, Badge, DemoBadge, Empty, ErrorState, Loading, Notice, Progress, toast } from '../components/ui.jsx';

function Quiz({ quizId, passScore }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get(`/quizzes/${quizId}`)
      .then((data) => {
        if (!alive) return;
        setState({ loading: false, error: null, data });
        setAnswers(new Array(data.questions.length).fill(-1));
      })
      .catch((error) => alive && setState({ loading: false, error, data: null }));
    return () => {
      alive = false;
    };
  }, [quizId]);

  if (state.loading) return <Loading label="Cargando evaluación…" />;
  if (state.error) return <Notice kind="error">{state.error.message}</Notice>;
  if (!state.data?.questions?.length) {
    return <Empty title="Evaluación en preparación">Este curso todavía no tiene preguntas publicadas.</Empty>;
  }

  const { quiz, questions, best_score: bestScore } = state.data;

  async function submit() {
    if (answers.some((value) => value < 0)) {
      toast('Responde todas las preguntas antes de enviar.', 'error');
      return;
    }
    setSending(true);
    try {
      const data = await api.post(`/quizzes/${quizId}/attempt`, { answers });
      setResult(data);
      toast(data.passed ? 'Evaluación aprobada.' : 'Inténtalo de nuevo: revisa las explicaciones.', data.passed ? 'ok' : 'error');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <h3 className="mb-0">{quiz.title}</h3>
          <p className="muted small mt-0">{quiz.description}</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Badge kind="info">Aprueba con {quiz.pass_score}%</Badge>
          {bestScore ? <Badge kind={bestScore >= quiz.pass_score ? 'ok' : 'warn'}>Mejor: {bestScore}%</Badge> : null}
        </div>
      </div>

      {questions.map((question, index) => {
        const outcome = result?.results?.[index];
        return (
          <div key={question.id} className="card">
            <div className="row-between">
              <strong>{index + 1}. {question.prompt}</strong>
              {outcome ? <Badge kind={outcome.correct ? 'ok' : 'danger'}>{outcome.correct ? 'Correcta' : 'Incorrecta'}</Badge> : null}
            </div>
            <div className="stack-sm mt-1">
              {question.options.map((option, optionIndex) => {
                const selected = answers[index] === optionIndex;
                const isRight = outcome && outcome.correct_index === optionIndex;
                return (
                  <button
                    key={`${question.id}-${optionIndex}`}
                    type="button"
                    className={`quiz-option${selected ? ' selected' : ''}${isRight ? ' correct' : ''}`}
                    onClick={() => {
                      const next = [...answers];
                      next[index] = optionIndex;
                      setAnswers(next);
                    }}
                    disabled={Boolean(result)}
                  >
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
            {outcome?.explanation ? <p className="small muted mt-1">Explicación: {outcome.explanation}</p> : null}
          </div>
        );
      })}

      {result ? (
        <Notice kind={result.passed ? 'ok' : 'error'}>
          {result.message} Puntuación: {result.score}%.
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => { setResult(null); setAnswers(new Array(questions.length).fill(-1)); }}>
            Volver a intentar
          </button>
        </Notice>
      ) : (
        <button type="button" className="btn btn-primary" onClick={submit} disabled={sending}>
          {sending ? 'Enviando…' : 'Enviar respuestas'}
        </button>
      )}
      <p className="tiny muted">Puntuación mínima para aprobar: {passScore ?? quiz.pass_score}%.</p>
    </div>
  );
}

export default function Course() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, refresh } = useSession();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [tab, setTab] = useState('contenido');
  const [busy, setBusy] = useState('');

  function load() {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    api
      .get(`/courses/${slug}`)
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((error) => setState({ loading: false, error, data: null }));
  }

  useEffect(() => {
    load();
  }, [slug]);

  if (state.loading) return <div className="container page"><Loading label="Cargando curso…" /></div>;
  if (state.error) return <div className="container page"><ErrorState error={state.error} onRetry={load} /></div>;

  const { course, instructor, lessons, resources, quiz, access, progress, enrollment, certificate, eligibility } = state.data;
  const canView = access?.canViewContent;
  const firstLesson = lessons[0];
  const resumeLesson = progress?.last_lesson_id
    ? lessons.find((lesson) => Number(lesson.id) === Number(progress.last_lesson_id))
    : null;

  async function enroll() {
    setBusy('enroll');
    try {
      const data = await api.post(`/courses/${slug}/enroll`);
      toast(data.message || 'Inscripción confirmada.');
      await refresh();
      if (data.next_lesson_id) navigate(`/lecciones/${data.next_lesson_id}`);
      else load();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function buy() {
    setBusy('buy');
    try {
      const data = await api.post(`/checkout/course/${slug}`);
      if (data.checkout_url) {
        window.location.assign(data.checkout_url);
        return;
      }
      toast(data.message || 'Solicitud registrada.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function requestCertificate() {
    setBusy('certificate');
    try {
      const data = await api.post(`/courses/${slug}/certificate`);
      toast(data.already_issued ? 'Ya tenías este certificado.' : 'Certificado emitido. ¡Felicidades!');
      load();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  return (
    <div>
      <section className={`${coverClass(course.cover_gradient)} course-hero`}>
        <div className="container">
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {course.is_demo ? <DemoBadge show /> : null}
            <Badge>{LEVEL_LABEL[course.level] || course.level}</Badge>
            <Badge kind="info">{course.category_name || course.category_slug}</Badge>
            {course.is_premium ? <Badge kind="premium">Premium</Badge> : null}
            {course.price_cents > 0 ? <Badge kind="warn">{formatPrice(course.price_cents)}</Badge> : <Badge kind="free">Gratis</Badge>}
          </div>
          <h1 className="mt-1">{course.title}</h1>
          <p className="hero-sub">{course.subtitle || course.description}</p>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <Link to={`/perfil/${instructor?.username || course.instructor_username}`} className="row" style={{ gap: 8 }}>
              <Avatar user={{ name: instructor?.name || 'Equipo SKILLVERSE', avatar_url: instructor?.avatar_url }} size={32} />
              <span className="small">Por {instructor?.name || 'Equipo SKILLVERSE'}</span>
            </Link>
            <span className="muted small">{lessons.length} lecciones</span>
            <span className="muted small">{formatDuration(course.duration_minutes)}</span>
            <span className="muted small">{course.students ?? 0} estudiantes</span>
            {course.published_at ? <span className="muted small">Publicado {timeAgo(course.published_at)}</span> : null}
          </div>
        </div>
      </section>

      <div className="container page">
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 24, alignItems: 'start' }}>
          <div>
            <div className="tabs">
              <button type="button" className={`tab${tab === 'contenido' ? ' active' : ''}`} onClick={() => setTab('contenido')}>Contenido</button>
              <button type="button" className={`tab${tab === 'recursos' ? ' active' : ''}`} onClick={() => setTab('recursos')}>Recursos ({resources.length})</button>
              <button type="button" className={`tab${tab === 'evaluacion' ? ' active' : ''}`} onClick={() => setTab('evaluacion')}>Evaluación</button>
              <button type="button" className={`tab${tab === 'detalles' ? ' active' : ''}`} onClick={() => setTab('detalles')}>Detalles</button>
            </div>

            {tab === 'contenido' ? (
              <div className="stack">
                {lessons.length ? (
                  <div className="list">
                    {lessons.map((lesson, index) => {
                      const locked = lesson.locked;
                      return (
                        <div key={lesson.id} className="list-item lesson-item">
                          <div>
                            <span className="badge">{index + 1}</span>{' '}
                            {locked ? (
                              <span>{lesson.title} <span className="tiny muted">— inscríbete para desbloquear</span></span>
                            ) : (
                              <Link to={`/lecciones/${lesson.id}`}>{lesson.title}</Link>
                            )}
                            {lesson.preview ? <span className="badge badge-ok" style={{ marginLeft: 8 }}>Vista previa</span> : null}
                            {lesson.summary ? <p className="muted tiny mt-0">{lesson.summary}</p> : null}
                          </div>
                          <span className="muted tiny">
                            {lesson.type === 'video' ? 'Video' : lesson.type === 'lectura' ? 'Lectura' : lesson.type === 'ejercicio' ? 'Ejercicio' : 'Lección'}
                            {lesson.duration_minutes ? ` · ${formatDuration(lesson.duration_minutes)}` : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <Empty title="Curso sin lecciones publicadas">El instructor todavía está preparando el contenido.</Empty>
                )}
              </div>
            ) : null}

            {tab === 'recursos' ? (
              resources.length ? (
                <div className="list">
                  {resources.map((resource) => (
                    <div key={resource.id} className="list-item">
                      <div>
                        <strong>{resource.title}</strong>
                        <div className="tiny muted">{resource.kind || 'material'}</div>
                      </div>
                      {resource.url ? (
                        <a className="btn btn-ghost btn-sm" href={resource.url} target="_blank" rel="noopener noreferrer">Abrir</a>
                      ) : (
                        <span className="tiny muted">Sin enlace</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty title="Sin material complementario">Este curso no tiene recursos adjuntos todavía.</Empty>
              )
            ) : null}

            {tab === 'evaluacion' ? (
              quiz ? (
                canView && user ? (
                  <Quiz quizId={quiz.id} passScore={quiz.pass_score} />
                ) : (
                  <Notice kind="info">Inicia sesión e inscríbete para presentar la evaluación de este curso.</Notice>
                )
              ) : (
                <Empty title="Sin evaluación">Este curso se certifica solo con la finalización de sus lecciones.</Empty>
              )
            ) : null}

            {tab === 'detalles' ? (
              <div className="card">
                <h3>Sobre este curso</h3>
                <p style={{ whiteSpace: 'pre-wrap' }}>{course.description}</p>
                <div className="list mt-2">
                  <div className="list-item"><span className="muted small">Nivel</span><span>{LEVEL_LABEL[course.level] || course.level}</span></div>
                  <div className="list-item"><span className="muted small">Duración estimada</span><span>{formatDuration(course.duration_minutes)}</span></div>
                  <div className="list-item"><span className="muted small">Categoría</span><span>{course.category_name || course.category_slug}</span></div>
                  <div className="list-item"><span className="muted small">Instructor</span><span>{instructor?.name || 'Equipo SKILLVERSE'}</span></div>
                </div>
                <p className="tiny muted mt-2">
                  Los certificados de SKILLVERSE acreditan la finalización de este curso en la plataforma y no equivalen a un título académico oficial.
                </p>
              </div>
            ) : null}
          </div>

          <aside className="stack">
            <div className="card">
              {user && enrollment ? (
                <>
                  <Progress value={progress?.percent || 0} label="Tu progreso" />
                  <p className="tiny muted mt-1">
                    {progress?.completed_lessons || 0} de {progress?.total_lessons || lessons.length} lecciones completadas
                  </p>
                  <Link to={`/lecciones/${resumeLesson?.id || firstLesson?.id}`} className="btn btn-primary btn-block">
                    {progress?.percent ? 'Continuar aprendiendo' : 'Empezar el curso'}
                  </Link>
                </>
              ) : canView ? (
                <>
                  <h3 className="mb-0">{course.price_cents > 0 ? formatPrice(course.price_cents) : 'Acceso gratuito'}</h3>
                  <p className="muted small mt-0">
                    {course.price_cents > 0
                      ? 'La compra se procesa con Stripe. La inscripción se activa al confirmarse el pago.'
                      : 'Inscríbete para guardar tu progreso automáticamente.'}
                  </p>
                  {course.price_cents > 0 ? (
                    <button type="button" className="btn btn-primary btn-block" onClick={buy} disabled={busy === 'buy'}>
                      {busy === 'buy' ? 'Abriendo pago…' : 'Comprar curso'}
                    </button>
                  ) : (
                    <button type="button" className="btn btn-primary btn-block" onClick={enroll} disabled={busy === 'enroll'}>
                      {busy === 'enroll' ? 'Inscribiendo…' : 'Inscribirme gratis'}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <h3 className="mb-0">Vista previa limitada</h3>
                  <p className="muted small mt-0">{access?.reason || 'Este curso requiere inscripción para ver todas las lecciones.'}</p>
                  <Link to={user ? '/precios' : '/registro'} className="btn btn-primary btn-block">
                    {user ? 'Ver planes' : 'Crear cuenta gratis'}
                  </Link>
                </>
              )}
            </div>

            <div className="card">
              <div className="row-between">
                <strong>Certificado</strong>
                <Badge kind="premium">Verificable</Badge>
              </div>
              {certificate ? (
                <div className="stack-sm mt-1">
                  <p className="small muted mt-0">Emitido el {formatDate(certificate.issued_at)} con identificador {certificate.code}.</p>
                  <Link to={`/verificar/${certificate.code}`} className="btn btn-ghost btn-sm">Ver certificado</Link>
                </div>
              ) : (
                <div className="stack-sm mt-1">
                  <p className="small muted mt-0">
                    Completa todas las lecciones{quiz ? ` y aprueba la evaluación (mínimo ${quiz.pass_score}%)` : ''} para solicitar tu certificado.
                  </p>
                  {eligibility?.eligible ? (
                    <button type="button" className="btn btn-teal btn-sm" onClick={requestCertificate} disabled={busy === 'certificate'}>
                      {busy === 'certificate' ? 'Emitiendo…' : 'Solicitar certificado'}
                    </button>
                  ) : (
                    <span className="tiny muted">{eligibility?.message || 'Aún no cumples los requisitos.'}</span>
                  )}
                </div>
              )}
            </div>

            <AdSlot category={course.category_slug} />
          </aside>
        </div>
      </div>
    </div>
  );
}
