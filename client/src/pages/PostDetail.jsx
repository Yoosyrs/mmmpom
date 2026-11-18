import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, timeAgo } from '../lib/api.js';
import { useSession } from '../App.jsx';
import { Avatar, Badge, Empty, ErrorState, Field, Loading, Notice, toast } from '../components/ui.jsx';
import { authorOf } from './Community.jsx';

export default function PostDetail() {
  const { id } = useParams();
  const { user } = useSession();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [comment, setComment] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    api
      .get(`/posts/${id}`)
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((error) => setState({ loading: false, error, data: null }));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.loading) return <div className="container page"><Loading label="Cargando conversación…" /></div>;
  if (state.error) return <div className="container page"><ErrorState error={state.error} onRetry={load} /></div>;

  const { post, comments } = state.data;
  const author = authorOf(post);
  const isAuthor = user && (post.author?.username === user.username || post.username === user.username);

  async function react() {
    try {
      const data = await api.post('/reactions', { target_type: 'post', target_id: post.id, kind: 'like' });
      setState((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          post: { ...prev.data.post, reacted: data.reacted, reaction_count: (prev.data.post.reaction_count || 0) + (data.reacted ? 1 : -1) },
        },
      }));
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function sendComment(event) {
    event.preventDefault();
    if (comment.trim().length < 2) return;
    setBusy('comment');
    try {
      await api.post(`/posts/${post.id}/comments`, { body: comment.trim(), parent_id: replyTo || undefined });
      setComment('');
      setReplyTo(null);
      toast('Comentario publicado.');
      load();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function accept(commentId) {
    setBusy(`accept-${commentId}`);
    try {
      await api.post(`/comments/${commentId}/accept`);
      toast('Respuesta aceptada como solución.');
      load();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function report() {
    const reason = window.prompt('¿Por qué quieres reportar esta publicación? (mínimo 5 caracteres)');
    if (!reason) return;
    try {
      await api.post('/reports', { target_type: 'post', target_id: post.id, reason });
      toast('Reporte enviado al equipo de moderación.');
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  return (
    <div className="container page page-narrow">
      <Link to="/comunidad" className="tiny muted">← Comunidad</Link>

      <article className="card mt-1">
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div className="row" style={{ gap: 10 }}>
            <Avatar user={author} size={42} />
            <div>
              <Link to={`/perfil/${author.username}`}><strong>{author.name}</strong></Link>
              <div className="tiny muted">
                {timeAgo(post.created_at)}
                {post.group_name ? <> · en <Link to={`/grupos/${post.group_slug}`}>{post.group_name}</Link></> : null}
                {post.challenge_title ? <> · <Link to={`/desafios/${post.challenge_slug}`}>{post.challenge_title}</Link></> : null}
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {post.kind === 'pregunta' ? <Badge kind="info">Pregunta</Badge> : null}
            {user ? <button type="button" className="btn btn-ghost btn-sm" onClick={report}>Reportar</button> : null}
          </div>
        </div>

        {post.title ? <h1>{post.title}</h1> : null}
        <p style={{ whiteSpace: 'pre-wrap' }}>{post.body}</p>

        <div className="row" style={{ gap: 8 }}>
          <button type="button" className={`btn btn-ghost btn-sm${post.reacted ? ' active' : ''}`} onClick={react} disabled={!user}>
            ♥ {post.reaction_count || 0}
          </button>
          <span className="btn btn-ghost btn-sm">💬 {comments.length}</span>
        </div>
      </article>

      <section className="section">
        <h3>Respuestas ({comments.length})</h3>
        {comments.length ? (
          <div className="stack">
            {comments.map((item) => {
              const commentAuthor = authorOf(item);
              const accepted = post.accepted_comment_id && Number(post.accepted_comment_id) === Number(item.id);
              return (
                <div key={item.id} className={`card${accepted ? ' accepted' : ''}`}>
                  <div className="row-between" style={{ alignItems: 'flex-start' }}>
                    <div className="row" style={{ gap: 8 }}>
                      <Avatar user={commentAuthor} size={30} />
                      <div>
                        <Link to={`/perfil/${commentAuthor.username}`} className="small"><strong>{commentAuthor.name}</strong></Link>
                        <div className="tiny muted">{timeAgo(item.created_at)}</div>
                      </div>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      {accepted ? <Badge kind="ok">Solución aceptada</Badge> : null}
                      {isAuthor && !accepted ? (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => accept(item.id)} disabled={busy === `accept-${item.id}`}>
                          Aceptar
                        </button>
                      ) : null}
                      {user ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReplyTo(item.id)}>Responder</button> : null}
                    </div>
                  </div>
                  <p className="mt-1" style={{ whiteSpace: 'pre-wrap' }}>{item.body}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty title="Sin respuestas todavía">{user ? 'Sé la primera persona en responder.' : 'Inicia sesión para responder.'}</Empty>
        )}

        {user ? (
          <form className="card mt-2" onSubmit={sendComment}>
            {replyTo ? (
              <div className="row-between">
                <span className="tiny muted">Respondiendo a un comentario</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReplyTo(null)}>Cancelar</button>
              </div>
            ) : null}
            <Field label="Tu respuesta">
              <textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} required minLength={2} placeholder="Aporta contexto, ejemplos o pasos concretos…" />
            </Field>
            <button type="submit" className="btn btn-primary btn-sm mt-1" disabled={busy === 'comment'}>
              {busy === 'comment' ? 'Enviando…' : 'Responder'}
            </button>
          </form>
        ) : (
          <Notice kind="info"><Link to="/entrar">Inicia sesión</Link> para responder a esta conversación.</Notice>
        )}
      </section>
    </div>
  );
}
