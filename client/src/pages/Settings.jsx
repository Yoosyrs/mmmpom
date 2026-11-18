import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../App.jsx';
import { Avatar, Badge, Field, Loading, Notice, toast } from '../components/ui.jsx';
import { readFileAsDataUrl } from './Projects.jsx';

const PRIVACY = [
  { value: 'public', label: 'Público' },
  { value: 'followers', label: 'Solo seguidores' },
  { value: 'private', label: 'Privado' },
];

const SKILL_LEVELS = [
  { value: 'aprendiendo', label: 'Aprendiendo' },
  { value: 'practicando', label: 'Practicando' },
  { value: 'avanzado', label: 'Avanzado' },
];

export default function Settings() {
  const { user, capabilities, refresh } = useSession();
  const [form, setForm] = useState(null);
  const [skills, setSkills] = useState([]);
  const [skill, setSkill] = useState({ name: '', level: 'aprendiendo' });
  const [application, setApplication] = useState({ expertise: '', motivation: '' });
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name || '',
      username: user.username || '',
      bio: user.bio || '',
      headline: user.headline || '',
      location: user.location || '',
      website: user.website || '',
      avatar_url: user.avatar_url || '',
      privacy_profile: user.privacy_profile || 'public',
      privacy_projects: user.privacy_projects || 'public',
      privacy_certificates: user.privacy_certificates || 'public',
    });
    api
      .get(`/users/${user.username}`)
      .then((data) => setSkills(data.skills || []))
      .catch(() => setSkills([]));
  }, [user]);

  if (!user || !form) return <div className="container page"><Loading label="Cargando configuración…" /></div>;

  async function save(event) {
    event.preventDefault();
    setBusy('profile');
    try {
      const data = await api.patch('/auth/me', form);
      await refresh();
      toast(data.message || 'Perfil actualizado.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy('avatar');
    try {
      const prepared = await readFileAsDataUrl(file);
      await api.patch('/auth/me', { avatar_url: prepared.dataUrl });
      setForm((prev) => ({ ...prev, avatar_url: prepared.dataUrl }));
      await refresh();
      toast('Fotografía actualizada.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
      event.target.value = '';
    }
  }

  async function addSkill(event) {
    event.preventDefault();
    setBusy('skill');
    try {
      await api.put('/me/skills', skill);
      setSkills((prev) => [...prev.filter((item) => item.slug !== skill.name.toLowerCase()), { name: skill.name, slug: skill.name.toLowerCase(), level: skill.level }]);
      setSkill({ name: '', level: 'aprendiendo' });
      toast('Habilidad añadida a tu perfil.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function removeSkill(slug) {
    try {
      await api.del(`/me/skills/${slug}`);
      setSkills((prev) => prev.filter((item) => item.slug !== slug));
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function apply(event) {
    event.preventDefault();
    setBusy('apply');
    try {
      const data = await api.post('/instructor/apply', application);
      await refresh();
      toast(data.message || 'Solicitud enviada.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="container page page-narrow">
      <span className="eyebrow">Configuración</span>
      <h1>Tu cuenta</h1>

      <form className="card" onSubmit={save}>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          <Avatar user={{ name: form.name, avatar_url: form.avatar_url }} size={72} />
          <div className="stack-sm">
            <label className="btn btn-ghost btn-sm">
              {busy === 'avatar' ? 'Subiendo…' : 'Cambiar fotografía'}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAvatar} style={{ display: 'none' }} />
            </label>
            <span className="tiny muted">PNG, JPG o WEBP de hasta 2 MB.</span>
          </div>
        </div>

        <div className="stack mt-2">
          <Field label="Nombre">
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={2} />
          </Field>
          <Field label="Nombre de usuario" hint="Cambiar tu usuario modifica la URL de tu perfil.">
            <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required minLength={3} />
          </Field>
          <Field label="Titular" hint="Una frase corta que te describa.">
            <input value={form.headline} onChange={(event) => setForm({ ...form, headline: event.target.value })} maxLength={120} />
          </Field>
          <Field label="Biografía">
            <textarea rows={4} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} maxLength={800} />
          </Field>
          <Field label="Ubicación">
            <input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} maxLength={80} />
          </Field>
          <Field label="Sitio web" hint="Debe empezar por http:// o https://">
            <input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} placeholder="https://…" />
          </Field>

          <h3 className="mt-2">Privacidad</h3>
          <div className="grid grid-3">
            {[
              ['privacy_profile', 'Perfil'],
              ['privacy_projects', 'Proyectos'],
              ['privacy_certificates', 'Certificados'],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <select value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })}>
                  {PRIVACY.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
            ))}
          </div>

          <button type="submit" className="btn btn-primary" disabled={busy === 'profile'}>
            {busy === 'profile' ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>

      <section className="section">
        <h3>Habilidades</h3>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {skills.length ? (
            skills.map((item) => (
              <span key={item.slug} className="chip">
                {item.name} · {item.level}
                <button type="button" className="icon-btn" onClick={() => removeSkill(item.slug)} aria-label={`Quitar ${item.name}`}>×</button>
              </span>
            ))
          ) : (
            <p className="muted small">Añade las habilidades que estás desarrollando.</p>
          )}
        </div>
        <form className="row mt-1" style={{ gap: 8, flexWrap: 'wrap' }} onSubmit={addSkill}>
          <input value={skill.name} onChange={(event) => setSkill({ ...skill, name: event.target.value })} placeholder="Nueva habilidad" required minLength={2} />
          <select value={skill.level} onChange={(event) => setSkill({ ...skill, level: event.target.value })} aria-label="Nivel de la habilidad">
            {SKILL_LEVELS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button type="submit" className="btn btn-ghost" disabled={busy === 'skill'}>Añadir</button>
        </form>
      </section>

      <section className="section">
        <h3>Docencia</h3>
        {capabilities?.instructor ? (
          <Notice kind="ok">
            Tu cuenta puede publicar cursos. <Link to="/instructor">Ir al panel de instructor</Link>
          </Notice>
        ) : user.instructor_status === 'pending' ? (
          <Notice kind="info">Tu solicitud de instructor está en revisión por administración.</Notice>
        ) : user.instructor_status === 'rejected' ? (
          <Notice kind="error">Tu solicitud fue rechazada. Puedes enviar una nueva con más detalle.</Notice>
        ) : null}

        {!capabilities?.instructor ? (
          <form className="card mt-1" onSubmit={apply}>
            <Field label="Tu especialidad" hint="Qué sabes hacer y qué experiencia tienes.">
              <textarea rows={3} value={application.expertise} onChange={(event) => setApplication({ ...application, expertise: event.target.value })} required minLength={10} />
            </Field>
            <Field label="Qué quieres enseñar" hint="Mínimo 40 caracteres.">
              <textarea rows={4} value={application.motivation} onChange={(event) => setApplication({ ...application, motivation: event.target.value })} required minLength={40} />
            </Field>
            <button type="submit" className="btn btn-primary mt-1" disabled={busy === 'apply'}>
              {busy === 'apply' ? 'Enviando…' : 'Solicitar ser instructor'}
            </button>
            <p className="tiny muted mt-1">La administración revisa cada solicitud antes de habilitar la publicación de cursos comerciales.</p>
          </form>
        ) : null}
      </section>

      <section className="section">
        <h3>Plan</h3>
        <p className="small muted">
          Plan actual: <Badge kind={user.plan === 'premium' ? 'premium' : 'free'}>{user.plan === 'premium' ? 'Premium' : 'Gratuito'}</Badge>
        </p>
        <Link to="/precios" className="btn btn-ghost btn-sm">Ver planes</Link>
      </section>
    </div>
  );
}
