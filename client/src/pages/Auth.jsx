import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../App.jsx';
import { Field, Notice, toast } from '../components/ui.jsx';

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="container page page-narrow">
      <div className="card">
        <span className="eyebrow">SKILLVERSE</span>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
        {footer ? <div className="mt-2">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Login() {
  const { login } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(form.email.trim(), form.password);
      toast('Bienvenido de nuevo.');
      navigate(params.get('next') || '/panel', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Entrar a SKILLVERSE"
      subtitle="Continúa donde lo dejaste. Tu progreso está guardado."
      footer={
        <div className="stack-sm">
          <span className="small muted">¿No tienes cuenta? <Link to="/registro">Crear cuenta gratis</Link></span>
          <Link to="/recuperar" className="small">Olvidé mi contraseña</Link>
        </div>
      }
    >
      <form className="stack" onSubmit={submit}>
        {error ? <Notice kind="error">{error}</Notice> : null}
        <Field label="Correo electrónico">
          <input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        </Field>
        <Field label="Contraseña">
          <input type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
        </Field>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </AuthShell>
  );
}

export function Register() {
  const { register } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register({
        name: form.name.trim(),
        username: form.username.trim() || undefined,
        email: form.email.trim(),
        password: form.password,
      });
      toast('Cuenta creada. ¡A aprender!');
      navigate('/panel', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Crear cuenta"
      subtitle="Aprende habilidades digitales, publica proyectos y obtén certificados verificables."
      footer={<span className="small muted">¿Ya tienes cuenta? <Link to="/entrar">Entrar</Link></span>}
    >
      <form className="stack" onSubmit={submit}>
        {error ? <Notice kind="error">{error}</Notice> : null}
        <Field label="Nombre">
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={2} autoComplete="name" />
        </Field>
        <Field label="Nombre de usuario" hint="Se usa en tu perfil público. Si lo dejas vacío lo generamos por ti.">
          <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="tu-usuario" autoComplete="username" />
        </Field>
        <Field label="Correo electrónico">
          <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required autoComplete="email" />
        </Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres.">
          <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength={8} autoComplete="new-password" />
        </Field>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Creando cuenta…' : 'Crear cuenta gratis'}</button>
        <p className="tiny muted">
          Al crear una cuenta aceptas que SKILLVERSE emite certificados internos de finalización, no títulos académicos oficiales.
        </p>
      </form>
    </AuthShell>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ busy: false, message: '', error: '', devLink: '' });

  async function submit(event) {
    event.preventDefault();
    setState({ busy: true, message: '', error: '', devLink: '' });
    try {
      const data = await api.post('/auth/forgot', { email: email.trim() });
      setState({ busy: false, message: data.message || 'Si el correo existe, enviamos instrucciones.', error: '', devLink: data.reset_url || '' });
    } catch (error) {
      setState({ busy: false, message: '', error: error.message, devLink: '' });
    }
  }

  return (
    <AuthShell
      title="Recuperar contraseña"
      subtitle="Te enviaremos un enlace para restablecerla. Por seguridad no confirmamos si un correo está registrado."
      footer={<Link to="/entrar" className="small">Volver a entrar</Link>}
    >
      <form className="stack" onSubmit={submit}>
        {state.error ? <Notice kind="error">{state.error}</Notice> : null}
        {state.message ? <Notice kind="ok">{state.message}</Notice> : null}
        {state.devLink ? (
          <Notice kind="info">
            El envío de correo no está configurado en este entorno. Enlace de restablecimiento: <a href={state.devLink}>abrir enlace</a>
          </Notice>
        ) : null}
        <Field label="Correo electrónico">
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <button type="submit" className="btn btn-primary btn-block" disabled={state.busy}>{state.busy ? 'Enviando…' : 'Enviar enlace'}</button>
      </form>
    </AuthShell>
  );
}

export function Reset() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(params.get('token') || '');
  const [password, setPassword] = useState('');
  const [state, setState] = useState({ busy: false, error: '', done: false });

  async function submit(event) {
    event.preventDefault();
    setState({ busy: true, error: '', done: false });
    try {
      await api.post('/auth/reset', { token: token.trim(), new_password: password });
      setState({ busy: false, error: '', done: true });
      toast('Contraseña actualizada. Ya puedes entrar.');
      setTimeout(() => navigate('/entrar'), 1200);
    } catch (error) {
      setState({ busy: false, error: error.message, done: false });
    }
  }

  return (
    <AuthShell title="Nueva contraseña" subtitle="Elige una contraseña nueva de al menos 8 caracteres.">
      <form className="stack" onSubmit={submit}>
        {state.error ? <Notice kind="error">{state.error}</Notice> : null}
        {state.done ? <Notice kind="ok">Contraseña actualizada. Redirigiendo al inicio de sesión…</Notice> : null}
        <Field label="Token de recuperación" hint="Viene incluido en el enlace que recibiste por correo.">
          <input value={token} onChange={(event) => setToken(event.target.value)} required />
        </Field>
        <Field label="Nueva contraseña">
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="new-password" />
        </Field>
        <button type="submit" className="btn btn-primary btn-block" disabled={state.busy}>{state.busy ? 'Guardando…' : 'Cambiar contraseña'}</button>
      </form>
    </AuthShell>
  );
}
