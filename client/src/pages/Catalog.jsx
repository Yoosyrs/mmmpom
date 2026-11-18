import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, LEVELS, LEVEL_LABEL } from '../lib/api.js';
import CourseCard from '../components/CourseCard.jsx';
import AdSlot from '../components/AdSlot.jsx';
import { Empty, ErrorState, Loading } from '../components/ui.jsx';

const SORTS = [
  { value: 'recientes', label: 'Más recientes' },
  { value: 'cortos', label: 'Duración: cortos primero' },
  { value: 'largos', label: 'Duración: largos primero' },
];

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [state, setState] = useState({ loading: true, error: null, courses: [], total: 0 });
  const [query, setQuery] = useState(params.get('q') || '');

  const filters = useMemo(
    () => ({
      q: params.get('q') || '',
      category: params.get('category') || '',
      level: params.get('level') || '',
      sort: params.get('sort') || 'recientes',
    }),
    [params]
  );

  useEffect(() => {
    api.get('/categories').then((data) => setCategories(data.categories || [])).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let alive = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const search = new URLSearchParams();
    if (filters.q) search.set('q', filters.q);
    if (filters.category) search.set('category', filters.category);
    if (filters.level) search.set('level', filters.level);
    if (filters.sort) search.set('sort', filters.sort);
    search.set('limit', '48');

    api
      .get(`/courses?${search.toString()}`)
      .then((data) => {
        if (!alive) return;
        setState({ loading: false, error: null, courses: data.courses || [], total: data.total || 0 });
      })
      .catch((error) => {
        if (alive) setState({ loading: false, error, courses: [], total: 0 });
      });
    return () => {
      alive = false;
    };
  }, [filters]);

  function update(patch) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setParams(next, { replace: true });
  }

  const activeCategory = categories.find((category) => category.slug === filters.category);

  return (
    <div className="container page">
      <div className="section-head">
        <div>
          <span className="eyebrow">Catálogo de habilidades</span>
          <h1>Encuentra tu próxima habilidad</h1>
          <p className="muted">
            {state.loading ? 'Buscando cursos…' : `${state.total} curso${state.total === 1 ? '' : 's'} publicado${state.total === 1 ? '' : 's'}`}
            {activeCategory ? ` en ${activeCategory.name}` : ''}.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="search-row">
          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault();
              update({ q: query.trim() });
            }}
            style={{ flex: 1, minWidth: 220 }}
          >
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por título, tema o descripción"
              aria-label="Buscar cursos"
            />
            <button type="submit" className="btn btn-primary btn-sm">Buscar</button>
          </form>
          <label className="field" style={{ margin: 0 }}>
            <span className="tiny muted">Nivel</span>
            <select value={filters.level} onChange={(event) => update({ level: event.target.value })}>
              <option value="">Todos</option>
              {LEVELS.map((level) => (
                <option key={level} value={level}>{LEVEL_LABEL[level]}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span className="tiny muted">Orden</span>
            <select value={filters.sort} onChange={(event) => update({ sort: event.target.value })}>
              {SORTS.map((sort) => (
                <option key={sort.value} value={sort.value}>{sort.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="chip-row mt-2">
          <button type="button" className={`chip${filters.category ? '' : ' chip-active'}`} onClick={() => update({ category: '' })}>
            Todas las áreas
          </button>
          {categories.map((category) => (
            <button
              key={category.slug}
              type="button"
              className={`chip${filters.category === category.slug ? ' chip-active' : ''}`}
              onClick={() => update({ category: category.slug })}
            >
              {category.name} ({category.course_count})
            </button>
          ))}
        </div>

        {activeCategory?.subcategories?.length ? (
          <div className="chip-row mt-1">
            {activeCategory.subcategories.map((sub) => (
              <button
                key={sub.slug}
                type="button"
                className={`chip${filters.q === sub.name ? ' chip-active' : ''}`}
                onClick={() => {
                  setQuery(sub.name);
                  update({ q: sub.name });
                }}
              >
                {sub.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-2">
        {state.loading ? (
          <Loading label="Cargando cursos…" />
        ) : state.error ? (
          <ErrorState error={state.error} onRetry={() => window.location.reload()} />
        ) : state.courses.length ? (
          <>
            <div className="grid grid-3">
              {state.courses.map((course) => (
                <CourseCard key={course.id} course={course} progress={course.progress} />
              ))}
            </div>
            <div className="mt-2">
              <AdSlot category={filters.category || undefined} />
            </div>
          </>
        ) : (
          <Empty
            title="Sin resultados para esta búsqueda"
            action={
              <button type="button" className="btn btn-ghost" onClick={() => { setQuery(''); setParams(new URLSearchParams(), { replace: true }); }}>
                Limpiar filtros
              </button>
            }
          >
            Prueba con otra palabra clave o quita los filtros de nivel y área. También puedes pedirle al asistente que te recomiende un curso.
          </Empty>
        )}
      </div>
    </div>
  );
}
