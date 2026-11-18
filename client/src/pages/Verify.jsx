import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, formatDate, formatDuration, LEVEL_LABEL } from '../lib/api.js';
import { ErrorState, Field, Loading, Notice } from '../components/ui.jsx';

export default function Verify() {
  const { code } = useParams();
  const [input, setInput] = useState(code || '');
  const [state, setState] = useState({ loading: Boolean(code), error: null, data: null });

  useEffect(() => {
    if (!code) return;
    setState({ loading: true, error: null, data: null });
    api
      .get(`/certificates/${encodeURIComponent(code)}`)
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((error) => setState({ loading: false, error, data: null }));
  }, [code]);

  const certificate = state.data?.certificate;

  return (
    <div className="container page page-narrow">
      <span className="eyebrow">Verificación pública</span>
      <h1>Verificar un certificado</h1>
      <p className="muted">
        Introduce el identificador que aparece en el certificado. La verificación es pública y no requiere cuenta.
      </p>

      <form
        className="card mt-2"
        onSubmit={(event) => {
          event.preventDefault();
          const value = input.trim().toUpperCase();
          if (value) window.location.assign(`/verificar/${encodeURIComponent(value)}`);
        }}
      >
        <Field label="Identificador del certificado" hint="Ejemplo: SKV-XXXX-XXXX">
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="SKV-…" required />
        </Field>
        <button type="submit" className="btn btn-primary mt-1">Verificar</button>
      </form>

      <div className="mt-2">
        {state.loading ? <Loading label="Consultando el registro…" /> : null}
        {state.error ? (
          state.error.status === 404 ? (
            <Notice kind="error">No encontramos ningún certificado con ese identificador. Revisa que esté escrito exactamente igual.</Notice>
          ) : (
            <ErrorState error={state.error} />
          )
        ) : null}
        {certificate ? (
          <div className="card certificate">
            <div className="row-between">
              <span className="eyebrow">Certificado SKILLVERSE</span>
              <span className={`badge ${certificate.revoked ? 'badge-danger' : 'badge-ok'}`}>
                {certificate.revoked ? 'Revocado' : 'Válido'}
              </span>
            </div>
            <h2 className="mb-0">{certificate.title}</h2>
            <p className="muted">Otorgado a <strong>{certificate.recipient_name}</strong> (@{certificate.recipient_username})</p>
            <div className="list">
              <div className="list-item"><span className="muted small">Identificador</span><strong>{certificate.code}</strong></div>
              <div className="list-item"><span className="muted small">Curso</span><span>{certificate.course_slug}</span></div>
              <div className="list-item"><span className="muted small">Nivel</span><span>{LEVEL_LABEL[certificate.level] || certificate.level}</span></div>
              <div className="list-item"><span className="muted small">Duración del curso</span><span>{formatDuration(certificate.duration_minutes)}</span></div>
              <div className="list-item"><span className="muted small">Evaluación</span><span>{certificate.score ?? '—'}%</span></div>
              <div className="list-item"><span className="muted small">Emitido</span><span>{formatDate(certificate.issued_at)}</span></div>
              <div className="list-item"><span className="muted small">Instructor</span><span>{certificate.instructor_name || 'Equipo SKILLVERSE'}</span></div>
            </div>
            {certificate.revoked ? (
              <Notice kind="error">Motivo de revocación: {certificate.revoked_reason || 'no especificado'}.</Notice>
            ) : null}
            <p className="tiny muted mt-2">{state.data.disclaimer}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
