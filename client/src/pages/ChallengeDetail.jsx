import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatDate } from '../lib/api.js';
import { useSession } from '../App.jsx';
import { Avatar, Badge, DemoBadge, Empty, ErrorState, Loading, Notice, toast } from '../components/ui.jsx';
import { authorOf } from './Community.jsx';

export default function ChallengeDetail() {
  const { slug } = useParams();
  const { user } = useSession();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    api
      .get(`/challenges/${slug}`)
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((error) => setState({ loading: false, error, data: null }));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.loading) return <div className="container page"><Loading label="Cargando desafío…" /></div>;
  if (state.error) return <div className="container page"><ErrorState error={state.error} onRetry={load} /></div>;

  const { challenge, entries } = state.data;

  async function react(project) {
    setBusy(`react-${project.id}`);
    try {
      const data = await api.post('/reactions', { target_type: 'project', target_id: project.id, kind: 'like' });
      setState((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          entries: prev.data.entries.map((item) =>
            item.id === project.id
              ? { ...item, reacted: data.reacted, reactions: (item.reactions || 0) + (data.reacted ? 1 : -1) }
              : item
          ),
        },
      }));
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="container page">
      <Link to="/desafios" className="tiny muted">← Desafíos</Link>

      <div className="row-between mt-1" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="row" style={{ gap: 6 }}>
            <Badge kind={challenge.status === 'activo' ? 'ok' : 'warn'}>{challenge.status || 'abierto'}</Badge>
            <span className="tiny muted">{entries.length} proyectos presentados</span>
          </div>
          <h1 className="mb-0">{challenge.title}</h1>
          {challenge.ends_at ? <p className="tiny muted">Cierra el {formatDate(challenge.ends_at)}</p> : null}
        </div>
        {user ? <Link to="/proyectos" className="btn btn-primary">Participar con un proyecto</Link> : <Link to="/registro" className="btn btn-primary">Crear cuenta para participar</Link>}
      </div>

      <div className="card mt-2">
        <h3>Enunciado</h3>
        <p style={{ whiteSpace: 'pre-wrap' }}>{challenge.description}</p>
        {challenge.brief ? (
          <>
            <h3>Requisitos</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{challenge.brief}</p>
          </>
        ) : null}
        <Notice kind="info">
          Publica tu proyecto en el laboratorio; el equipo lo vinculará a este desafío cuando corresponda.
        </Notice>
      </div>

      <section className="section">
        <h3>Proyectos presentados</h3>
        {entries.length ? (
          <div className="grid grid-3">
            {entries.map((project) => {
              const author = authorOf(project);
              return (
                <article key={project.id} className="card">
                  <div className="row" style={{ gap: 6 }}>
                    {project.is_demo ? <DemoBadge show /> : null}
                    <Badge>{project.category_slug}</Badge>
                  </div>
                  <h3 className="mt-1"><Link to={`/proyectos/${project.id}`}>{project.title}</Link></h3>
                  <p className="muted small clamp-3">{project.description}</p>
                  <div className="row-between">
                    <Link to={`/perfil/${author.username}`} className="row" style={{ gap: 6 }}>
                      <Avatar user={author} size={24} />
                      <span className="tiny muted">{author.name}</span>
                    </Link>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => react(project)} disabled={!user || busy === `react-${project.id}`}>
                      ♥ {project.reactions || 0}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty title="Todavía sin proyectos">Sé la primera persona en presentar un proyecto a este desafío.</Empty>
        )}
      </section>
    </div>
  );
}
