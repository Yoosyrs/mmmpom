import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatDate } from '../lib/api.js';
import { useSession } from '../App.jsx';
import { Avatar, Badge, Empty, ErrorState, Loading, Notice, toast } from '../components/ui.jsx';

const LEVEL_LABEL = { aprendiendo: 'Aprendiendo', practicando: 'Practicando', avanzado: 'Avanzado' };

export default function Profile() {
  const { username } = useParams();
  const { user: me } = useSession();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    api
      .get(`/users/${username}`)
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((error) => setState({ loading: false, error, data: null }));
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.loading) return <div className="container page"><Loading label="Cargando perfil…" /></div>;
  if (state.error) return <div className="container page"><ErrorState error={state.error} onRetry={load} /></div>;

  const { private: isPrivate, user, stats, is_following: isFollowing, is_self: isSelf, skills, projects, certificates, courses } = state.data;

  if (isPrivate) {
    return (
      <div className="container page page-narrow">
        <div className="empty">
          <Avatar user={user} size={64} />
          <h1 className="mt-1">{user?.name || 'Perfil privado'}</h1>
          <p className="muted">Esta persona ha configurado su perfil como privado.</p>
        </div>
      </div>
    );
  }

  async function toggleFollow() {
    setBusy(true);
    try {
      const data = await api.post(`/users/${user.username}/follow`);
      toast(data.following ? 'Ahora sigues a esta persona.' : 'Has dejado de seguir.');
      load();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container page">
      <div className="card">
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
          <div className="row" style={{ gap: 16 }}>
            <Avatar user={user} size={84} />
            <div>
              <h1 className="mb-0">{user.name}</h1>
              <p className="muted small mt-0">@{user.username}{user.headline ? ` · ${user.headline}` : ''}</p>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {user.role === 'instructor' || user.instructor_status === 'approved' ? <Badge kind="premium">Instructor</Badge> : null}
                {user.plan === 'premium' ? <Badge kind="premium">Premium</Badge> : null}
                {user.location ? <span className="tiny muted">{user.location}</span> : null}
                {user.website ? <a className="tiny" href={user.website} target="_blank" rel="noopener noreferrer">Sitio web</a> : null}
              </div>
            </div>
          </div>
          <div className="row">
            {isSelf ? (
              <>
                <Link to="/configuracion" className="btn btn-ghost">Editar perfil</Link>
                <Link to="/panel" className="btn btn-primary">Mi panel</Link>
              </>
            ) : me ? (
              <button type="button" className={`btn ${isFollowing ? 'btn-ghost' : 'btn-primary'}`} onClick={toggleFollow} disabled={busy}>
                {isFollowing ? 'Siguiendo' : 'Seguir'}
              </button>
            ) : (
              <Link to="/entrar" className="btn btn-primary">Inicia sesión para seguir</Link>
            )}
          </div>
        </div>

        {user.bio ? <p className="mt-2" style={{ whiteSpace: 'pre-wrap' }}>{user.bio}</p> : <p className="muted mt-2">Sin biografía todavía.</p>}

        <div className="stats-row mt-2">
          <div className="kpi"><strong>{stats.followers}</strong><span className="tiny muted">seguidores</span></div>
          <div className="kpi"><strong>{stats.following}</strong><span className="tiny muted">siguiendo</span></div>
          <div className="kpi"><strong>{stats.projects}</strong><span className="tiny muted">proyectos</span></div>
          <div className="kpi"><strong>{stats.certificates}</strong><span className="tiny muted">certificados</span></div>
          <div className="kpi"><strong>{stats.courses}</strong><span className="tiny muted">cursos</span></div>
        </div>
      </div>

      {skills?.length ? (
        <section className="section">
          <h3>Habilidades</h3>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {skills.map((skill) => (
              <span key={skill.slug || skill.name} className="chip">
                {skill.name}
                <span className="tiny muted"> · {LEVEL_LABEL[skill.level] || skill.level}</span>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <h3>Proyectos publicados</h3>
        {projects?.length ? (
          <div className="grid grid-3">
            {projects.map((project) => (
              <article key={project.id} className="card">
                <Badge>{project.category_slug}</Badge>
                <h4 className="mt-1"><Link to={`/proyectos/${project.id}`}>{project.title}</Link></h4>
                <p className="muted small clamp-3">{project.description}</p>
              </article>
            ))}
          </div>
        ) : (
          <Empty title="Sin proyectos publicados">{isSelf ? 'Publica tu primer proyecto en el laboratorio.' : 'Esta persona aún no ha publicado proyectos.'}</Empty>
        )}
      </section>

      {courses?.length ? (
        <section className="section">
          <h3>Cursos que imparte</h3>
          <div className="grid grid-3">
            {courses.map((course) => (
              <article key={course.id || course.slug} className="card">
                <Badge kind="info">{course.category_slug}</Badge>
                <h4 className="mt-1"><Link to={`/cursos/${course.slug}`}>{course.title}</Link></h4>
                <p className="tiny muted">{course.lesson_count || 0} lecciones · {course.students || 0} estudiantes</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <h3>Certificados</h3>
        {certificates?.length ? (
          <div className="list">
            {certificates.map((certificate) => (
              <div key={certificate.code} className="list-item">
                <div>
                  <strong>{certificate.title}</strong>
                  <div className="tiny muted">Emitido el {formatDate(certificate.issued_at)} · {certificate.code}</div>
                </div>
                <Link to={`/verificar/${certificate.code}`} className="btn btn-ghost btn-sm">Verificar</Link>
              </div>
            ))}
          </div>
        ) : (
          <Notice kind="info">Todavía no hay certificados públicos en este perfil.</Notice>
        )}
      </section>
    </div>
  );
}
