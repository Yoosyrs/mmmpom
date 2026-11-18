import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, coverClass, timeAgo } from '../lib/api.js';
import { useSession } from '../App.jsx';
import { Avatar, Badge, DemoBadge, Empty, ErrorState, Field, Loading, Modal, Notice, toast } from '../components/ui.jsx';
import { authorOf } from './Community.jsx';

export const PROJECT_CATEGORIES = [
  { value: 'tecnologia', label: 'Tecnología' },
  { value: 'diseno', label: 'Diseño' },
  { value: 'negocios', label: 'Negocios' },
  { value: 'contenido', label: 'Creación de contenido' },
  { value: 'practicas', label: 'Habilidades prácticas' },
];

export function readFileAsDataUrl(file, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error(`"${file.name}" supera el límite de 2 MB.`));
      return;
    }
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      reject(new Error(`"${file.name}": solo se aceptan imágenes (PNG, JPG, WEBP, GIF) o PDF.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ filename: file.name, dataUrl: String(reader.result) });
    reader.onerror = () => reject(new Error(`No se pudo leer "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

export default function Projects() {
  const { user } = useSession();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category_slug: 'tecnologia', link: '', cover: '', files: [] });
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (query.trim().length >= 2) params.set('q', query.trim());
    api
      .get(`/projects?${params.toString()}`)
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((error) => setState({ loading: false, error, data: null }));
  }, [category, query]);

  useEffect(() => {
    load();
  }, [load]);

  async function addFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      const prepared = [];
      for (const file of files.slice(0, 4)) {
        prepared.push(await readFileAsDataUrl(file));
      }
      setForm((prev) => ({ ...prev, files: [...prev.files, ...prepared].slice(0, 4) }));
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      event.target.value = '';
    }
  }

  async function setCover(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const prepared = await readFileAsDataUrl(file);
      setForm((prev) => ({ ...prev, cover: prepared.dataUrl }));
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      event.target.value = '';
    }
  }

  async function publish(event) {
    event.preventDefault();
    setBusy('publish');
    try {
      const data = await api.post('/projects', {
        title: form.title.trim(),
        description: form.description.trim(),
        category_slug: form.category_slug,
        link: form.link.trim() || undefined,
        cover: form.cover || undefined,
        files: form.files,
      });
      toast('Proyecto publicado en tu portafolio.');
      setOpen(false);
      setForm({ title: '', description: '', category_slug: 'tecnologia', link: '', cover: '', files: [] });
      if (data.id) window.location.assign(`/proyectos/${data.id}`);
      else load();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="container page">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="eyebrow">Laboratorio práctico</span>
          <h1 className="mb-0">Proyectos reales</h1>
          <p className="muted">Aplica lo aprendido y construye tu portafolio público.</p>
        </div>
        {user ? <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Publicar proyecto</button> : <Link to="/registro" className="btn btn-primary">Crear cuenta</Link>}
      </div>

      <div className="row mt-2" style={{ gap: 8, flexWrap: 'wrap' }}>
        <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filtrar por área">
          <option value="">Todas las áreas</option>
          {PROJECT_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar proyectos…" aria-label="Buscar proyectos" style={{ maxWidth: 280 }} />
      </div>

      {state.loading ? <Loading label="Cargando proyectos…" /> : null}
      {state.error ? <ErrorState error={state.error} onRetry={load} /> : null}

      {state.data ? (
        state.data.projects.length ? (
          <div className="grid grid-3 mt-2">
            {state.data.projects.map((project) => {
              const author = authorOf(project);
              return (
                <article key={project.id} className="card project-card">
                  <Link to={`/proyectos/${project.id}`} className={`${coverClass('galaxy')} project-cover`} style={project.cover_url ? { backgroundImage: `url(${project.cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                    {!project.cover_url ? <span className="cover-icon">◆</span> : null}
                  </Link>
                  <div className="stack-sm mt-1">
                    <div className="row" style={{ gap: 6 }}>
                      {project.is_demo ? <DemoBadge show /> : null}
                      <Badge>{project.category_slug}</Badge>
                      {project.challenge ? <Badge kind="info">Desafío</Badge> : null}
                    </div>
                    <h3 className="mb-0"><Link to={`/proyectos/${project.id}`}>{project.title}</Link></h3>
                    <p className="muted small clamp-3">{project.description}</p>
                    <div className="row-between">
                      <Link to={`/perfil/${author.username}`} className="row" style={{ gap: 6 }}>
                        <Avatar user={author} size={24} />
                        <span className="tiny muted">{author.name}</span>
                      </Link>
                      <span className="tiny muted">♥ {project.reactions || 0}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty title="Sin proyectos con estos filtros" action={user ? <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Publicar el primero</button> : null}>
            El laboratorio está esperando tu primer trabajo.
          </Empty>
        )
      ) : null}

      <Modal open={open} title="Publicar proyecto" onClose={() => setOpen(false)}>
        <form className="stack" onSubmit={publish}>
          <Field label="Título">
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required minLength={3} maxLength={120} />
          </Field>
          <Field label="Descripción" hint="Qué hiciste, con qué herramientas y qué aprendiste.">
            <textarea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required minLength={10} />
          </Field>
          <Field label="Área">
            <select value={form.category_slug} onChange={(event) => setForm({ ...form, category_slug: event.target.value })}>
              {PROJECT_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <Field label="Enlace al proyecto" hint="Opcional: repositorio, sitio publicado o presentación.">
            <input type="url" value={form.link} onChange={(event) => setForm({ ...form, link: event.target.value })} placeholder="https://…" />
          </Field>
          <Field label="Portada" hint="Imagen de hasta 2 MB (PNG, JPG, WEBP o GIF).">
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={setCover} />
          </Field>
          <Field label="Archivos" hint="Hasta 4 archivos de 2 MB: imágenes o PDF.">
            <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" onChange={addFiles} />
          </Field>
          {form.files.length ? (
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {form.files.map((file) => (
                <span key={file.filename} className="chip">
                  {file.filename}
                  <button type="button" className="icon-btn" onClick={() => setForm({ ...form, files: form.files.filter((item) => item.filename !== file.filename) })} aria-label={`Quitar ${file.filename}`}>×</button>
                </span>
              ))}
            </div>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={busy === 'publish'}>{busy === 'publish' ? 'Publicando…' : 'Publicar'}</button>
        </form>
      </Modal>
    </div>
  );
}
