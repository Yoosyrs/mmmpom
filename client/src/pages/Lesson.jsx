import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, embedUrl, formatDuration, LEVEL_LABEL } from '../lib/api.js';
import { useSession } from '../App.jsx';
import { Badge, Empty, ErrorState, Loading, Notice, Progress, toast } from '../components/ui.jsx';

export default function Lesson() {
  const { id } = useParams();
  const { user } = useSession();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState('');
  const [savedAt, setSavedAt] = useState(null);
  const secondsRef = useRef(0);
  const startRef = useRef(Date.now());

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    api
      .get(`/lessons/${id}`)
      .then((data) => {
        setState({ loading: false, error: null, data });
        setCompleted(Boolean(data.completed));
        secondsRef.current = Number(data.seconds || 0);
        startRef.current = Date.now();
      })
      .catch((error) => setState({ loading: false, error, data: null }));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const persist = useCallback(
    async (nextCompleted, { quiet = true } = {}) => {
      if (!state.data?.access?.canViewContent) return;
      const elapsed = Math.round((Date.now() - startRef.current) / 1000);
      const total = Math.min(secondsRef.current + Math.max(0, elapsed), 60 * 60 * 6);
      try {
        const data = await api.post(`/lessons/${id}/progress`, { completed: nextCompleted, seconds: total });
        secondsRef.current = total;
        startRef.current = Date.now();
        setSavedAt(data.saved_at);
        if (!quiet) toast('Progreso guardado.');
      } catch (error) {
        if (!quiet) toast(error.message, 'error');
      }
    },
    [id, state.data]
  );

  // Guardado automático del avance cada 20 s mientras la lección está abierta.
  useEffect(() => {
    if (!user || !state.data?.access?.canViewContent) return undefined;
    const timer = setInterval(() => persist(completed), 20000);
    const onHide = () => {
      if (document.visibilityState === 'hidden') persist(completed);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      persist(completed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist, completed, user]);

  if (state.loading) return <div className="container page"><Loading label="Abriendo lección…" /></div>;
  if (state.error) return <div className="container page"><ErrorState error={state.error} onRetry={load} /></div>;

  const { lesson, course, access, previous, next, resources } = state.data;
  const video = lesson.type === 'video' ? embedUrl(lesson.video_url) : null;

  async function toggleComplete() {
    const nextValue = !completed;
    setCompleted(nextValue);
    setSaving('progress');
    await persist(nextValue, { quiet: false });
    setSaving('');
  }

  return (
    <div className="container page">
      <div className="row-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Link to={`/cursos/${course.slug}`} className="tiny muted">← {course.title}</Link>
          <h1 className="mb-0">{lesson.title}</h1>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Badge>{LEVEL_LABEL[course.level] || course.level}</Badge>
            <Badge kind="info">{lesson.type === 'video' ? 'Video' : lesson.type === 'lectura' ? 'Lectura' : lesson.type === 'ejercicio' ? 'Ejercicio' : 'Lección'}</Badge>
            {lesson.duration_minutes ? <span className="muted small">{formatDuration(lesson.duration_minutes)}</span> : null}
            {lesson.preview ? <Badge kind="ok">Vista previa</Badge> : null}
          </div>
        </div>
        <div className="row">
          {user && access?.canViewContent ? (
            <button type="button" className={`btn ${completed ? 'btn-ghost' : 'btn-primary'}`} onClick={toggleComplete} disabled={saving === 'progress'}>
              {completed ? '✓ Completada' : 'Marcar como completada'}
            </button>
          ) : null}
        </div>
      </div>

      {!access?.canViewContent ? (
        <Notice kind="info">
          Esta lección es una vista previa. <Link to={`/cursos/${course.slug}`}>Inscríbete al curso</Link> para acceder a todo el contenido.
        </Notice>
      ) : null}

      <div className="grid mt-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 24, alignItems: 'start' }}>
        <div className="stack">
          {video ? (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ position: 'relative', paddingTop: '56.25%' }}>
                <iframe
                  src={video}
                  title={lesson.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                />
              </div>
            </div>
          ) : null}

          {lesson.content ? (
            <article className="card lesson-body">
              <div style={{ whiteSpace: 'pre-wrap' }}>{lesson.content}</div>
            </article>
          ) : (
            <Empty title="Contenido en preparación">El instructor todavía no ha añadido el texto de esta lección.</Empty>
          )}

          {resources?.length ? (
            <div className="card">
              <h3>Material de esta lección</h3>
              <div className="list">
                {resources.map((resource) => (
                  <div key={resource.id} className="list-item">
                    <span>{resource.title}</span>
                    {resource.url ? <a className="btn btn-ghost btn-sm" href={resource.url} target="_blank" rel="noopener noreferrer">Abrir</a> : <span className="tiny muted">Sin enlace</span>}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="row-between card">
            {previous ? <Link className="btn btn-ghost btn-sm" to={`/lecciones/${previous.id}`}>← {previous.title}</Link> : <span />}
            {next ? <Link className="btn btn-primary btn-sm" to={`/lecciones/${next.id}`}>{next.title} →</Link> : <Link className="btn btn-teal btn-sm" to={`/cursos/${course.slug}`}>Volver al curso</Link>}
          </div>

          <p className="tiny muted">
            {savedAt ? `Avance guardado automáticamente a las ${new Date(savedAt).toLocaleTimeString('es-ES')}.` : 'El avance se guarda automáticamente mientras avanzas.'}
          </p>
        </div>

        <aside className="stack">
          <div className="card">
            <strong>Tu avance</strong>
            <div className="mt-1">
              <Progress value={state.data.progress?.percent ?? 0} />
            </div>
            <p className="tiny muted mt-1">
              {state.data.progress?.completed_lessons ?? 0} de {state.data.progress?.total_lessons ?? 0} lecciones completadas.
            </p>
            <Link to={`/cursos/${course.slug}`} className="btn btn-ghost btn-sm btn-block">Ver el curso completo</Link>
          </div>
          <div className="card">
            <strong>Otras lecciones</strong>
            <div className="stack-sm mt-1">
              <Link className="small" to={`/lecciones/${lesson.id}`}>· {lesson.title}</Link>
              {previous ? <Link className="small muted" to={`/lecciones/${previous.id}`}>← {previous.title}</Link> : null}
              {next ? <Link className="small muted" to={`/lecciones/${next.id}`}>{next.title} →</Link> : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
