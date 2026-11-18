import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate } from '../lib/api.js';
import { Badge, Empty, ErrorState, Loading } from '../components/ui.jsx';

export default function Challenges() {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let alive = true;
    api
      .get('/challenges')
      .then((data) => alive && setState({ loading: false, error: null, data }))
      .catch((error) => alive && setState({ loading: false, error, data: null }));
    return () => {
      alive = false;
    };
  }, []);

  if (state.loading) return <div className="container page"><Loading label="Cargando desafíos…" /></div>;
  if (state.error) return <div className="container page"><ErrorState error={state.error} onRetry={() => window.location.reload()} /></div>;

  return (
    <div className="container page">
      <span className="eyebrow">Desafíos creativos</span>
      <h1>Retos para practicar de verdad</h1>
      <p className="muted">Publica tu proyecto como respuesta a un desafío y recibe retroalimentación de la comunidad.</p>

      {state.data.challenges.length ? (
        <div className="grid grid-3 mt-2">
          {state.data.challenges.map((challenge) => (
            <article key={challenge.id} className="card">
              <div className="row-between">
                <Badge kind={challenge.status === 'activo' ? 'ok' : 'warn'}>{challenge.status || 'abierto'}</Badge>
                <span className="tiny muted">{challenge.entries} proyectos</span>
              </div>
              <h3 className="mt-1"><Link to={`/desafios/${challenge.slug}`}>{challenge.title}</Link></h3>
              <p className="muted small clamp-3">{challenge.description}</p>
              {challenge.ends_at ? <p className="tiny muted">Cierra el {formatDate(challenge.ends_at)}</p> : null}
              <Link to={`/desafios/${challenge.slug}`} className="btn btn-ghost btn-sm">Ver desafío</Link>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="Aún no hay desafíos activos">La administración publicará nuevos retos creativos próximamente.</Empty>
      )}
    </div>
  );
}
