import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { initials } from '../lib/api.js';

export function cx(...values) {
  return values.filter(Boolean).join(' ');
}

export function Spinner({ label = 'Cargando…' }) {
  return (
    <div className="center stack-sm" role="status" aria-live="polite">
      <div className="spinner" />
      <span className="muted small">{label}</span>
    </div>
  );
}

export function Loading({ label }) {
  return (
    <div className="loading-block">
      <Spinner label={label} />
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children ? <p className="muted">{children}</p> : null}
      {action}
    </div>
  );
}

export function Notice({ kind = 'info', children }) {
  return <div className={cx('notice', `notice-${kind}`)}>{children}</div>;
}

export function Badge({ children, kind }) {
  return <span className={cx('badge', kind && `badge-${kind}`)}>{children}</span>;
}

export function DemoBadge({ show }) {
  if (!show) return null;
  return <span className="badge badge-demo" title="Contenido de demostración creado por el equipo de SKILLVERSE">Demo</span>;
}

export function Avatar({ user, size = 40 }) {
  const name = user?.name || user?.username || '?';
  if (user?.avatar_url) {
    return <img className="avatar" src={user.avatar_url} alt={`Fotografía de ${name}`} width={size} height={size} style={{ width: size, height: size }} />;
  }
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size / 2.6 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Progress({ value, label }) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return (
    <div>
      {label ? (
        <div className="progress-label">
          <span>{label}</span>
          <span>{pct}%</span>
        </div>
      ) : null}
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <label className="field" htmlFor={htmlFor}>
      {label ? <span>{label}</span> : null}
      {children}
      {hint && !error ? <small className="muted tiny">{hint}</small> : null}
      {error ? <small className="error-text tiny">{error}</small> : null}
    </label>
  );
}

export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3 className="mb-0">{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="stack">{children}</div>
        {footer ? <div className="row-between mt-2">{footer}</div> : null}
      </div>
    </div>
  );
}

/* --- toasts --------------------------------------------------- */
const listeners = new Set();
export function toast(message, kind = 'ok') {
  const event = { id: Math.random().toString(36).slice(2), message, kind };
  listeners.forEach((listener) => listener(event));
}

export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const listener = (event) => {
      setItems((prev) => [...prev, event]);
      setTimeout(() => setItems((prev) => prev.filter((item) => item.id !== event.id)), 4200);
    };
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  if (!items.length) return null;
  return (
    <div className="toast-wrap" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={cx('toast', item.kind === 'error' && 'toast-error')}>
          {item.message}
        </div>
      ))}
    </div>
  );
}

export function SectionHead({ eyebrow, title, children, action }) {
  return (
    <div className="section-head">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h2 className="mb-0">{title}</h2>
        {children ? <p className="muted">{children}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty">
      <h3>No pudimos cargar esta sección</h3>
      <p className="muted">{error?.message || 'Ha ocurrido un error inesperado.'}</p>
      {onRetry ? (
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function LinkButton({ to, children, variant = 'btn-ghost', ...rest }) {
  return (
    <Link to={to} className={cx('btn', variant)} {...rest}>
      {children}
    </Link>
  );
}
