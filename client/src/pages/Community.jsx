import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, timeAgo } from '../lib/api.js';
import { useSession } from '../App.jsx';
import { Avatar, Badge, Empty, ErrorState, Field, Loading, Notice, toast } from '../components/ui.jsx';

export function authorOf(item) {
  if (!item) return { name: 'Usuario', username: '' };
  if (item.author) return item.author;
  return { name: item.name || item.username || 'Usuario', username: item.username, avatar_url: item.avatar_url, headline: item.headline };
}

const KINDS = [
  { value: '', label: 'Todo' },
  { value: 'post', label: 'Publicaciones' },
  { value: 'pregunta', label: 'Preguntas' },
];

export default function Community() {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') || '';
  const sort = params.get('sort') || 'recientes';
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [form, setForm] = useState({ kind: 'post', title: '', body: '' });
  const [posting, setPosting] = useState(false);

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const query = new URLSearchParams();
    if (kind) query.set('kind', kind);
    query.set('sort', sort);
    api
      .get(`/posts?${query.toString()}`)
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((error) => setState({ loading: false, error, data: null }));
  }, [kind, sort]);

  useEffect(() => {
    load();
  }, [load]);

  function update(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  async function react(post) {
    try {
      const data = await api.post('/reactions', { target_type: 'post', target_id: post.id, kind: 'like' });
      setState((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          posts: prev.data.posts.map((item) =>
            item.id === post.id
              ? { ...item, reacted: data.reacted, reaction_count: (item.reaction_count || 0) + (data.reacted ? 1 : -1) }
              : item
          ),
        },
      }));
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function publish(event) {
    event.preventDefault();
    if (form.body.trim().length < 5) {
      toast('Escribe un mensaje un poco más largo.', 'error');
      return;
    }
    setPosting(true);
    try {
      const data = await api.post('/posts', {
        kind: form.kind,
        title: form.kind === 'pregunta' ? form.title.trim() : undefined,
        body: form.body.trim(),
      });
      toast('Publicado en la comunidad.');
      setForm({ kind: form.kind, title: '', body: '' });
      if (data.id) window.location.assign(`/comunidad/${data.id}`);
      else load();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="container page">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="eyebrow">Comunidad</span>
          <h1 className="mb-0">Aprender en compañía</h1>
          <p className="muted">Comparte avances, resuelve dudas y ayuda a otras personas.</p>
        </div>
        <div className="row">
          <Link to="/grupos" className="btn btn-ghost">Grupos</Link>
          <Link to="/desafios" className="btn btn-teal">Desafíos</Link>
        </div>
      </div>

      <div className="row-between mt-2" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="tabs">
          {KINDS.map((option) => (
            <button key={option.value || 'todo'} type="button" className={`tab${kind === option.value ? ' active' : ''}`} onClick={() => update('kind', option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <select value={sort} onChange={(event) => update('sort', event.target.value)} aria-label="Ordenar publicaciones">
          <option value="recientes">Más recientes</option>
          <option value="populares">Más populares</option>
        </select>
      </div>

      {user ? (
        <form className="card mt-2" onSubmit={publish}>
          <div className="row-between">
            <strong>Comparte algo</strong>
            <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} aria-label="Tipo de publicación">
              <option value="post">Publicación</option>
              <option value="pregunta">Pregunta</option>
            </select>
          </div>
          {form.kind === 'pregunta' ? (
            <div className="mt-1">
              <Field label="Título de la pregunta">
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="¿Cómo organizo mi primer portafolio?" required minLength={6} />
              </Field>
            </div>
          ) : null}
          <div className="mt-1">
            <Field label="Mensaje">
              <textarea rows={3} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="Cuenta qué estás aprendiendo o qué necesitas resolver…" required />
            </Field>
          </div>
          <div className="row-between mt-1">
            <span className="tiny muted">Sé respetuoso: las publicaciones pueden ser moderadas.</span>
            <button type="submit" className="btn btn-primary btn-sm" disabled={posting}>{posting ? 'Publicando…' : 'Publicar'}</button>
          </div>
        </form>
      ) : (
        <Notice kind="info">
          <Link to="/entrar">Inicia sesión</Link> para publicar, comentar y reaccionar.
        </Notice>
      )}

      {state.loading ? <Loading label="Cargando comunidad…" /> : null}
      {state.error ? <ErrorState error={state.error} onRetry={load} /> : null}

      {state.data ? (
        state.data.posts.length ? (
          <div className="stack mt-2">
            {state.data.posts.map((post) => {
              const author = authorOf(post);
              return (
                <article key={post.id} className="card">
                  <div className="row-between" style={{ alignItems: 'flex-start' }}>
                    <div className="row" style={{ gap: 10 }}>
                      <Avatar user={author} size={38} />
                      <div>
                        <Link to={`/perfil/${author.username}`}><strong>{author.name}</strong></Link>
                        <div className="tiny muted">
                          {timeAgo(post.created_at)}
                          {post.group_name ? <> · en <Link to={`/grupos/${post.group_slug}`}>{post.group_name}</Link></> : null}
                          {post.challenge_title ? <> · <Link to={`/desafios/${post.challenge_slug}`}>{post.challenge_title}</Link></> : null}
                        </div>
                      </div>
                    </div>
                    {post.kind === 'pregunta' ? <Badge kind="info">Pregunta</Badge> : null}
                  </div>

                  <h3 className="mt-1">
                    <Link to={`/comunidad/${post.id}`}>{post.title || (post.body || '').slice(0, 80)}</Link>
                  </h3>
                  <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>
                    {(post.body || '').slice(0, 400)}
                    {(post.body || '').length > 400 ? '…' : ''}
                  </p>

                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className={`btn btn-ghost btn-sm${post.reacted ? ' active' : ''}`} onClick={() => react(post)} disabled={!user}>
                      ♥ {post.reaction_count || 0}
                    </button>
                    <Link to={`/comunidad/${post.id}`} className="btn btn-ghost btn-sm">💬 {post.comment_count || 0}</Link>
                    <Link to={`/comunidad/${post.id}`} className="btn btn-ghost btn-sm">Abrir</Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty title="Todavía no hay publicaciones" action={user ? null : <Link to="/registro" className="btn btn-primary">Crear cuenta</Link>}>
            {kind === 'pregunta' ? 'Nadie ha hecho preguntas aún. Sé la primera persona.' : 'Comparte tu primer avance y abre la conversación.'}
          </Empty>
        )
      ) : null}
    </div>
  );
}
