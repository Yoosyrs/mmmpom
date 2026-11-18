import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, coverClass, formatDate, timeAgo } from '../lib/api.js';
import { useSession } from '../App.jsx';
import { Avatar, Badge, DemoBadge, ErrorState, Loading, Notice, toast } from '../components/ui.jsx';
import { authorOf } from './Community.jsx';
import { readFileAsDataUrl } from './Projects.jsx';

function humanSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    api
      .get(`/projects/${id}`)
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((error) => setState({ loading: false, error, data: null }));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.loading) return <div className="container page"><Loading label="Cargando proyecto…" /></div>;
  if (state.error) return <div className="container page"><ErrorState error={state.error} onRetry={load} /></div>;

  const { project, can_edit: canEdit } = state.data;
  const author = authorOf(project);

  async function react() {
    try {
      const data = await api.post('/reactions', { target_type: 'project', target_id: project.id, kind: 'like' });
      setState((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          project: {
            ...prev.data.project,
            reacted: data.reacted,
            reactions: (prev.data.project.reactions || 0) + (data.reacted ? 1 : -1),
          },
        },
      }));
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function addFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setBusy('files');
    try {
      const prepared = [];
      for (const file of files.slice(0, 4)) prepared.push(await readFileAsDataUrl(file));
      await api.post(`/projects/${project.id}/files`, { files: prepared });
      toast('Archivos añadidos.');
      load();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
      event.target.value = '';
    }
  }

  async function remove() {
    if (!window.confirm('¿Eliminar este proyecto de tu portafolio?')) return;
    setBusy('delete');
    try {
      await api.del(`/projects/${project.id}`);
      toast('Proyecto eliminado.');
      navigate('/proyectos');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="container page">
      <Link to="/proyectos" className="tiny muted">← Laboratorio</Link>

      <div className="grid mt-1" style={{ gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 24, alignItems: 'start' }}>
        <div className="stack">
          <div className={`${coverClass('galaxy')} project-cover-lg`} style={project.cover_url ? { backgroundImage: `url(${project.cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} />

          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {project.is_demo ? <DemoBadge show /> : null}
            <Badge>{project.category_slug}</Badge>
            {project.challenge ? <Badge kind="info">Desafío: {project.challenge.title || project.challenge}</Badge> : null}
          </div>

          <h1 className="mb-0">{project.title}</h1>
          <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{project.description}</p>

          <div className="row" style={{ gap: 8 }}>
            <button type="button" className={`btn btn-ghost btn-sm${project.reacted ? ' active' : ''}`} onClick={react} disabled={!user}>♥ {project.reactions || 0}</button>
            {project.link ? <a className="btn btn-ghost btn-sm" href={project.link} target="_blank" rel="noopener noreferrer">Abrir enlace</a> : null}
            {canEdit ? <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={busy === 'delete'}>Eliminar</button> : null}
          </div>

          <div className="card">
            <div className="row-between">
              <h3 className="mb-0">Archivos del proyecto</h3>
              {canEdit ? (
                <label className="btn btn-ghost btn-sm">
                  {busy === 'files' ? 'Subiendo…' : 'Añadir archivos'}
                  <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" onChange={addFiles} style={{ display: 'none' }} />
                </label>
              ) : null}
            </div>
            {project.files?.length ? (
              <div className="list mt-1">
                {project.files.map((file) => (
                  <div key={file.id} className="list-item">
                    <div>
                      <strong className="small">{file.filename}</strong>
                      <div className="tiny muted">{file.mime} · {humanSize(file.size)}</div>
                    </div>
                    <a className="btn btn-ghost btn-sm" href={file.url} target="_blank" rel="noopener noreferrer">Ver</a>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small mt-1">Este proyecto no tiene archivos adjuntos.</p>
            )}
          </div>
        </div>

        <aside className="stack">
          <div className="card">
            <div className="row" style={{ gap: 10 }}>
              <Avatar user={author} size={44} />
              <div>
                <Link to={`/perfil/${author.username}`}><strong>{author.name}</strong></Link>
                <div className="tiny muted">{author.headline || 'Creador en SKILLVERSE'}</div>
              </div>
            </div>
            <p className="tiny muted mt-1">Publicado el {formatDate(project.created_at)} · {timeAgo(project.created_at)}</p>
            <Link to={`/perfil/${author.username}`} className="btn btn-ghost btn-sm btn-block">Ver portafolio</Link>
          </div>
          <Notice kind="info">
            Los proyectos son públicos. No publiques datos personales sensibles ni material con derechos de autor.
          </Notice>
        </aside>
      </div>
    </div>
  );
}
