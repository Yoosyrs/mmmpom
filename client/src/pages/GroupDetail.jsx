import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, timeAgo } from '../lib/api.js';
import { useSession } from '../App.jsx';
import { Avatar, Badge, Empty, ErrorState, Loading, Notice, toast } from '../components/ui.jsx';
import { authorOf } from './Community.jsx';

export default function GroupDetail() {
  const { slug } = useParams();
  const { user } = useSession();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [posts, setPosts] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    api
      .get(`/groups/${slug}`)
      .then((data) => {
        setState({ loading: false, error: null, data });
        return api.get('/posts?sort=recientes');
      })
      .then((feed) => setPosts((feed.posts || []).filter((post) => post.group_slug === slug)))
      .catch((error) => setState((prev) => (prev.data ? prev : { loading: false, error, data: null })));
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.loading) return <div className="container page"><Loading label="Cargando grupo…" /></div>;
  if (state.error) return <div className="container page"><ErrorState error={state.error} onRetry={load} /></div>;

  const { group, members } = state.data;

  async function toggleMembership() {
    setBusy(true);
    try {
      const data = await api.post(`/groups/${group.slug}/membership`);
      toast(data.is_member ? 'Te has unido al grupo.' : 'Has salido del grupo.');
      load();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container page">
      <Link to="/grupos" className="tiny muted">← Grupos</Link>

      <div className="row-between mt-1" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Badge>{group.category_slug}</Badge>
          <h1 className="mb-0">{group.name}</h1>
          <p className="muted">{group.description || 'Sin descripción todavía.'}</p>
          <p className="tiny muted">
            Creado por <Link to={`/perfil/${group.owner_username}`}>{group.owner_name}</Link> · {group.members} miembros
          </p>
        </div>
        {user ? (
          <button type="button" className={`btn ${group.is_member ? 'btn-ghost' : 'btn-primary'}`} onClick={toggleMembership} disabled={busy}>
            {group.is_member ? 'Salir del grupo' : 'Unirme al grupo'}
          </button>
        ) : (
          <Link to="/entrar" className="btn btn-primary">Inicia sesión para unirte</Link>
        )}
      </div>

      <div className="grid mt-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 24, alignItems: 'start' }}>
        <div className="stack">
          <h3>Publicaciones del grupo</h3>
          {posts.length ? (
            posts.map((post) => {
              const author = authorOf(post);
              return (
                <article key={post.id} className="card">
                  <div className="row" style={{ gap: 10 }}>
                    <Avatar user={author} size={32} />
                    <div>
                      <Link to={`/perfil/${author.username}`} className="small"><strong>{author.name}</strong></Link>
                      <div className="tiny muted">{timeAgo(post.created_at)}</div>
                    </div>
                  </div>
                  <h3 className="mt-1"><Link to={`/comunidad/${post.id}`}>{post.title || (post.body || '').slice(0, 70)}</Link></h3>
                  <p className="muted small clamp-3">{post.body}</p>
                  <Link to={`/comunidad/${post.id}`} className="btn btn-ghost btn-sm">💬 {post.comment_count || 0} · Abrir</Link>
                </article>
              );
            })
          ) : (
            <Empty title="Sin publicaciones en este grupo">
              Publica desde la comunidad y menciona este grupo para iniciar la conversación.
            </Empty>
          )}
          <Notice kind="info">
            ¿Quieres compartir algo aquí? <Link to="/comunidad">Publica en la comunidad</Link> y elige este grupo.
          </Notice>
        </div>

        <aside className="card">
          <strong>Miembros ({members.length})</strong>
          <div className="stack-sm mt-1">
            {members.map((member) => (
              <Link key={member.id} to={`/perfil/${member.username}`} className="row" style={{ gap: 8 }}>
                <Avatar user={member} size={28} />
                <span className="small">{member.name}</span>
                {member.role === 'admin' ? <Badge kind="info">Admin</Badge> : null}
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
