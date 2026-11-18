import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, timeAgo } from '../lib/api.js';
import { Badge, Empty, Notice, Spinner, toast } from '../components/ui.jsx';

const MODES = [
  { value: 'tutor', label: 'Tutor', hint: 'Explica conceptos y resuelve dudas educativas.' },
  { value: 'ejercicios', label: 'Ejercicios', hint: 'Genera práctica con soluciones.' },
  { value: 'plan', label: 'Plan de estudio', hint: 'Organiza un plan según tu nivel y tiempo.' },
  { value: 'explicar', label: 'Adaptar nivel', hint: 'Reexplica algo de forma más simple o avanzada.' },
];

export default function Assistant() {
  const [status, setStatus] = useState({ loading: true, data: null, error: null });
  const [messages, setMessages] = useState([]);
  const [mode, setMode] = useState('tutor');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.get('/ai/status'), api.get('/ai/history')])
      .then(([statusData, history]) => {
        if (!alive) return;
        setStatus({ loading: false, data: statusData, error: null });
        setMessages(history.messages || []);
      })
      .catch((error) => alive && setStatus({ loading: false, data: null, error }));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, sending]);

  async function send(event) {
    event.preventDefault();
    const message = input.trim();
    if (message.length < 2) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: message, created_at: new Date().toISOString() }]);
    setSending(true);
    try {
      const data = await api.post('/ai/chat', { message, mode });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply, created_at: new Date().toISOString(), model: data.model }]);
      if (data.quota) setStatus((prev) => ({ ...prev, data: { ...prev.data, quota: data.quota } }));
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `No pude responder: ${error.message}`, error: true, created_at: new Date().toISOString() }]);
      toast(error.message, 'error');
    } finally {
      setSending(false);
    }
  }

  const configured = status.data?.configured;
  const quota = status.data?.quota;

  return (
    <div className="container page">
      <span className="eyebrow">Asistente de aprendizaje</span>
      <h1>Tu tutor disponible 24/7</h1>
      <p className="muted">
        Explica conceptos, propone ejercicios y arma planes de estudio adaptados a tu nivel.
        {status.data?.model ? <> Modelo: <code>{status.data.model}</code>.</> : null}
      </p>

      {status.loading ? <Spinner label="Comprobando el asistente…" /> : null}

      {!status.loading && !configured ? (
        <Notice kind="error">
          <strong>El asistente está desactivado.</strong>
          <p className="small mt-0">
            {status.data?.message || 'El servicio de IA no está disponible en este entorno.'} La plataforma sigue funcionando:
            puedes estudiar, publicar proyectos y obtener certificados sin el asistente.
          </p>
          <p className="tiny muted mb-0">
            Para activarlo, añade la variable de entorno <code>OPENAI_API_KEY</code> en la configuración del proyecto.
          </p>
        </Notice>
      ) : null}

      {configured ? (
        <>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {MODES.map((option) => (
              <button key={option.value} type="button" className={`chip${mode === option.value ? ' active' : ''}`} onClick={() => setMode(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
          <p className="tiny muted">{MODES.find((option) => option.value === mode)?.hint}</p>
          {quota ? (
            <p className="tiny muted">
              {typeof quota.remaining === 'number' ? `Consultas restantes hoy: ${quota.remaining}` : null}
              {quota.limit ? ` de ${quota.limit}` : null}
            </p>
          ) : null}

          <div className="chat-wrap">
            <div className="chat-log" ref={logRef}>
              {messages.length ? (
                messages.map((message, index) => (
                  <div key={`${message.created_at}-${index}`} className={`chat-bubble ${message.role === 'user' ? 'chat-user' : 'chat-assistant'}${message.error ? ' chat-error' : ''}`}>
                    <div className="tiny muted">{message.role === 'user' ? 'Tú' : 'Asistente'} · {timeAgo(message.created_at)}</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                  </div>
                ))
              ) : (
                <Empty title="Empieza una conversación">
                  Prueba con «Explícame qué es una API como si tuviera 15 años» o «Armа un plan de 4 semanas para aprender diseño UX».
                </Empty>
              )}
              {sending ? <div className="chat-bubble chat-assistant"><Spinner label="Pensando…" /></div> : null}
            </div>

            <form className="chat-input" onSubmit={send}>
              <textarea
                rows={2}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Escribe tu pregunta…"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    send(event);
                  }
                }}
              />
              <button type="submit" className="btn btn-primary" disabled={sending || input.trim().length < 2}>Enviar</button>
            </form>
          </div>
          <p className="tiny muted">
            Las respuestas pueden contener errores: verifica la información importante. Tus consultas quedan asociadas a tu cuenta.
          </p>
        </>
      ) : null}

      {!configured && !status.loading ? (
        <div className="row mt-2">
          <Link to="/catalogo" className="btn btn-primary">Explorar cursos</Link>
          <Link to="/proyectos" className="btn btn-ghost">Ver proyectos</Link>
        </div>
      ) : null}

      {configured && !messages.length ? <Badge kind="ok">Servicio de IA conectado</Badge> : null}
    </div>
  );
}
