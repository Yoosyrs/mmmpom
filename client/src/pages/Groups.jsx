import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../App.jsx';
import { Avatar, Badge, Empty, ErrorState, Field, Loading, Modal, toast } from '../components/ui.jsx';

const CATEGORIES = [
  { value: 'tecnologia', label: 'Tecnología' },
  { value: 'diseno', label: 'Diseño' },
  { value: 'negocios', label: 'Negocios' },
  { value: 'contenido', label: 'Creación de contenido' },
  { value: 'practicas', label: 'Habilidades prácticas' },
];

export default function Groups() {
  const { user } = useSession();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', category_slug: 'tecnologia' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    api
      .get('/groups')
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((error) => setState({ loading: false, error, data: null }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api.post('/groups', {
        name: form.name.trim(),
        description: form.description.trim(),
        category_slug: form.category_slug,
      });
      toast('Grupo creado.');
      setOpen(false);
      setForm({ name: '', description: '', category_slug: 'tecnologia' });
      if (data.group?.slug) window.location.assign(`/grupos/${data.group.slug}`);
      else load();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container page">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="eyebrow">Grupos de aprendizaje</span>
          <h1 className="mb-0">Aprende con otras personas</h1>
          <p className="muted">Espacios temáticos para compartir recursos, dudas y avances.</p>
        </div>
        {user ? <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Crear grupo</button> : <Link to="/entrar" className="btn btn-ghost">Inicia sesión</Link>}
      </div>

      {state.loading ? <Loading label="Cargando grupos…" /> : null}
      {state.error ? <ErrorState error={state.error} onRetry={load} /> : null}

      {state.data ? (
        state.data.groups.length ? (
          <div className="grid grid-3 mt-2">
            {state.data.groups.map((group) => (
              <article key={group.id} className="card">
                <div className="row-between">
                  <Badge>{group.category_slug}</Badge>
                  <span className="tiny muted">{group.members} miembros</span>
                </div>
                <h3 className="mt-1"><Link to={`/grupos/${group.slug}`}>{group.name}</Link></h3>
                <p className="muted small clamp-3">{group.description || 'Sin descripción todavía.'}</p>
                <div className="row-between">
                  <span className="tiny muted">{group.posts} publicaciones</span>
                  <Link to={`/grupos/${group.slug}`} className="btn btn-ghost btn-sm">Abrir</Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty title="Todavía no hay grupos" action={user ? <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Crear el primero</button> : null}>
            Crea un grupo temático y empieza la conversación.
          </Empty>
        )
      ) : null}

      <Modal open={open} title="Crear grupo de aprendizaje" onClose={() => setOpen(false)}>
        <form className="stack" onSubmit={create}>
          <Field label="Nombre">
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={3} maxLength={80} />
          </Field>
          <Field label="Descripción" hint="Qué se comparte aquí y a quién está dirigido.">
            <textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={500} />
          </Field>
          <Field label="Área">
            <select value={form.category_slug} onChange={(event) => setForm({ ...form, category_slug: event.target.value })}>
              {CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creando…' : 'Crear grupo'}</button>
        </form>
      </Modal>
    </div>
  );
}
