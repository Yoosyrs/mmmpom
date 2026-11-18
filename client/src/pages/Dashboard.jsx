import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate, timeAgo } from '../lib/api.js';
import { useSession } from '../App.jsx';
import CourseCard from '../components/CourseCard.jsx';
import { Badge, Empty, ErrorState, Loading, Notice, Progress, SectionHead } from '../components/ui.jsx';

export default function Dashboard() {
  const { user } = useSession();
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let alive = true;
    api
      .get('/me/dashboard')
      .then((data) => alive && setState({ loading: false, error: null, data }))
      .catch((error) => alive && setState({ loading: false, error, data: null }));
    return () => {
      alive = false;
    };
  }, []);

  if (state.loading) return <div className="container page"><Loading label="Preparando tu panel…" /></div>;
  if (state.error) return <div className="container page"><ErrorState error={state.error} onRetry={() => window.location.reload()} /></div>;

  const { enrollments, recommended, certificates, activity, totals } = state.data;
  const inProgress = enrollments.filter((item) => (item.progress?.percent || 0) < 100);
  const finished = enrollments.filter((item) => (item.progress?.percent || 0) >= 100);

  return (
    <div className="container page">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="eyebrow">Mi panel</span>
          <h1 className="mb-0">Hola, {user?.name?.split(' ')[0]}</h1>
          <p className="muted">Tu progreso se guarda automáticamente en cada lección.</p>
        </div>
        <div className="row">
          <Link to="/catalogo" className="btn btn-primary">Explorar cursos</Link>
          <Link to="/proyectos" className="btn btn-ghost">Mis proyectos</Link>
        </div>
      </div>

      <div className="stats-row mt-2">
        <div className="kpi"><strong>{totals.lessons_completed}</strong><span className="muted tiny">lecciones completadas</span></div>
        <div className="kpi"><strong>{totals.minutes}</strong><span className="muted tiny">minutos de estudio</span></div>
        <div className="kpi"><strong>{totals.certificates}</strong><span className="muted tiny">certificados</span></div>
        <div className="kpi"><strong>{totals.projects}</strong><span className="muted tiny">proyectos publicados</span></div>
        <div className="kpi"><strong>{totals.followers}</strong><span className="muted tiny">seguidores</span></div>
      </div>

      <section className="section">
        <SectionHead eyebrow="Continuar" title="Cursos en curso" action={<Link to="/catalogo" className="btn btn-ghost btn-sm">Añadir otro</Link>}>
          {inProgress.length ? 'Retoma donde lo dejaste: tu avance ya está guardado.' : 'Todavía no tienes cursos en curso.'}
        </SectionHead>
        {inProgress.length ? (
          <div className="stack">
            {inProgress.map(({ course, progress }) => (
              <div key={course.id} className="card">
                <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <Link to={`/cursos/${course.slug}`}><strong>{course.title}</strong></Link>
                    <div className="tiny muted">{course.category_name || course.category_slug} · {course.lesson_count} lecciones</div>
                  </div>
                  <Link to={`/cursos/${course.slug}`} className="btn btn-primary btn-sm">Continuar</Link>
                </div>
                <div className="mt-1">
                  <Progress value={progress?.percent || 0} label={`${progress?.completed_lessons || 0}/${progress?.total_lessons || 0} lecciones`} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="Empieza tu primera habilidad"
            action={<Link to="/catalogo" className="btn btn-primary">Ver catálogo</Link>}
          >
            Elige un curso del catálogo y tu progreso aparecerá aquí automáticamente.
          </Empty>
        )}
      </section>

      {finished.length ? (
        <section className="section">
          <SectionHead eyebrow="Completados" title="Cursos terminados" />
          <div className="grid grid-3">
            {finished.map(({ course, progress }) => (
              <CourseCard key={course.id} course={course} progress={progress} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <SectionHead eyebrow="Certificados" title="Tus credenciales">
          Los certificados son verificables públicamente mediante su identificador.
        </SectionHead>
        {certificates.length ? (
          <div className="list">
            {certificates.map((certificate) => (
              <div key={certificate.id} className="list-item">
                <div>
                  <strong>{certificate.title}</strong>
                  <div className="tiny muted">Emitido el {formatDate(certificate.issued_at)} · {certificate.code}</div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <Badge kind={certificate.revoked ? 'danger' : 'ok'}>{certificate.revoked ? 'Revocado' : 'Válido'}</Badge>
                  <Link to={`/verificar/${certificate.code}`} className="btn btn-ghost btn-sm">Verificar</Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Aún sin certificados">
            Completa todas las lecciones y aprueba la evaluación de un curso para solicitar tu primer certificado.
          </Empty>
        )}
      </section>

      <section className="section">
        <SectionHead eyebrow="Actividad" title="Últimos avances" />
        {activity.length ? (
          <div className="list">
            {activity.map((item, index) => (
              <div key={`${item.updated_at}-${index}`} className="list-item">
                <div>
                  <Link to={`/cursos/${item.course_slug}`}>{item.course_title}</Link>
                  <div className="tiny muted">{item.lesson_title}</div>
                </div>
                <span className="tiny muted">
                  {item.completed ? 'Completada' : 'En progreso'} · {timeAgo(item.updated_at)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Sin actividad reciente">Cuando abras una lección, tu avance aparecerá aquí.</Empty>
        )}
      </section>

      <section className="section">
        <SectionHead eyebrow="Recomendado" title="Siguientes habilidades" />
        {recommended.length ? (
          <div className="grid grid-3">
            {recommended.map((course) => <CourseCard key={course.id} course={course} />)}
          </div>
        ) : (
          <Notice kind="info">Ya estás inscrito en todos los cursos publicados. Pronto habrá nuevas habilidades disponibles.</Notice>
        )}
      </section>
    </div>
  );
}
