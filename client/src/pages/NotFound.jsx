import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="container page page-narrow">
      <div className="empty">
        <span className="eyebrow">Error 404</span>
        <h1>Esta página no existe</h1>
        <p className="muted">
          Puede que el enlace haya cambiado o que el contenido se haya retirado. Vuelve al catálogo para seguir aprendiendo.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link to="/" className="btn btn-primary">Ir al inicio</Link>
          <Link to="/catalogo" className="btn btn-ghost">Ver catálogo</Link>
        </div>
      </div>
    </div>
  );
}
