import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../App.jsx';

/**
 * Anuncios moderados. Solo se muestran a cuentas gratuitas y únicamente
 * anuncios aprobados por administración (el backend filtra por estado).
 */
export default function AdSlot({ category }) {
  const { user, capabilities } = useSession();
  const [ad, setAd] = useState(null);

  useEffect(() => {
    if (capabilities?.premium) return;
    let alive = true;
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    api
      .get(`/ads/serve${query}`)
      .then((data) => {
        if (alive) setAd(data.ad || null);
      })
      .catch(() => setAd(null));
    return () => {
      alive = false;
    };
  }, [category, capabilities?.premium]);

  if (!ad || capabilities?.premium) return null;

  async function trackClick() {
    try {
      await api.post(`/ads/${ad.id}/click`);
    } catch {
      /* el clic no debe bloquear la navegación */
    }
  }

  return (
    <aside className="card ad-card" aria-label="Publicidad">
      <div className="row-between">
        <span className="tiny muted">Publicidad moderada</span>
        <span className="badge">Patrocinado</span>
      </div>
      <strong>{ad.title}</strong>
      <p className="muted small mt-0">{ad.body}</p>
      {ad.url ? (
        <a className="btn btn-ghost btn-sm" href={ad.url} target="_blank" rel="noopener noreferrer nofollow sponsored" onClick={trackClick}>
          Saber más
        </a>
      ) : (
        <span className="tiny muted">Espacio de ejemplo: los anuncios reales requieren URL y aprobación.</span>
      )}
      {user ? null : <span className="tiny muted">Sin cuenta: mostrando anuncios de la plataforma.</span>}
    </aside>
  );
}
