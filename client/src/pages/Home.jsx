import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import CourseCard from '../components/CourseCard.jsx';
import AdSlot from '../components/AdSlot.jsx';
import { ErrorState, Loading, SectionHead } from '../components/ui.jsx';
import { useSession } from '../App.jsx';

export default function Home() {
  const { user } = useSession();
  const [data, setData] = useState({ loading: true, error: null, courses: [], categories: [], total: 0 });

  useEffect(() => {
    let alive = true;
    Promise.all([api.get('/courses?limit=6'), api.get('/categories')])
      .then(([courseData, categoryData]) => {
        if (!alive) return;
        setData({
          loading: false,
          error: null,
          courses: courseData.courses || [],
          total: courseData.total || 0,
          categories: categoryData.categories || [],
        });
      })
      .catch((error) => {
        if (alive) setData((prev) => ({ ...prev, loading: false, error }));
      });
    return () => {
      alive = false;
    };
  }, []);

  const skillCount = data.categories.reduce((sum, category) => sum + (category.subcategories?.length || 0), 0);

  return (
    <div>
      <section className="hero">
        <div className="hero-orb" aria-hidden="true" />
        <div className="container hero-content">
          <span className="eyebrow">Academia + comunidad + laboratorio</span>
          <h1>
            Aprende una habilidad digital.<br />
            <span className="grad-text">Constrúyela. Compártela.</span>
          </h1>
          <p className="hero-sub">
            SKILLVERSE combina cursos con seguimiento real de progreso, un laboratorio de proyectos, retos creativos y una
            comunidad donde enseñar también es aprender.
          </p>
          <div className="hero-cta">
            <Link to="/catalogo" className="btn btn-primary btn-lg">Explorar el catálogo</Link>
            <Link to="/proyectos" className="btn btn-teal btn-lg">Ver el laboratorio</Link>
          </div>
          <form className="hero-search" action="/catalogo" method="get" role="search">
            <input type="search" name="q" placeholder="¿Qué quieres aprender hoy? Ej. diseño UX, Python, edición de video…" aria-label="Buscar cursos" />
            <button type="submit" className="btn btn-primary">Buscar</button>
          </form>
          <div className="stats-row">
            <div className="stat"><strong>{data.total}</strong><span className="muted tiny">cursos publicados</span></div>
            <div className="stat"><strong>{data.categories.length}</strong><span className="muted tiny">áreas de conocimiento</span></div>
            <div className="stat"><strong>{skillCount}</strong><span className="muted tiny">habilidades específicas</span></div>
            <div className="stat"><strong>100%</strong><span className="muted tiny">progreso guardado</span></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead eyebrow="Catálogo" title="Explora por área de conocimiento" action={<Link to="/catalogo" className="btn btn-ghost">Ver todo</Link>}>
            Cinco áreas, veinticinco habilidades concretas. Cada curso declara nivel, duración y autor real.
          </SectionHead>
          {data.loading ? (
            <Loading label="Cargando catálogo…" />
          ) : data.error ? (
            <ErrorState error={data.error} onRetry={() => window.location.reload()} />
          ) : (
            <div className="grid grid-auto">
              {data.categories.map((category) => (
                <Link key={category.slug} to={`/catalogo?category=${category.slug}`} className="card category-card">
                  <div className="row-between">
                    <strong>{category.name}</strong>
                    <span className="badge">{category.course_count} cursos</span>
                  </div>
                  <p className="muted small mt-0">{category.description}</p>
                  <div className="chip-row">
                    {(category.subcategories || []).slice(0, 5).map((sub) => (
                      <span key={sub.slug} className="chip">{sub.name}</span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead eyebrow="Recién llegados" title="Cursos para empezar hoy" action={<Link to="/catalogo" className="btn btn-ghost">Catálogo completo</Link>}>
            Publicados por instructores verificados o por el equipo de SKILLVERSE.
          </SectionHead>
          {data.loading ? <Loading /> : <div className="grid grid-3">{data.courses.map((course) => <CourseCard key={course.id} course={course} />)}</div>}
        </div>
      </section>

      <section className="section">
        <div className="container grid grid-3">
          <div className="card">
            <span className="badge badge-info">Laboratorio</span>
            <h3>Aprende haciendo</h3>
            <p className="muted small">
              Publica el proyecto que estás construyendo: portada, enlace y archivos. Recibe reacciones y comentarios reales de la comunidad.
            </p>
            <Link to="/proyectos" className="btn btn-ghost btn-sm">Ir al laboratorio</Link>
          </div>
          <div className="card">
            <span className="badge badge-ok">Comunidad</span>
            <h3>Pregunta y responde</h3>
            <p className="muted small">
              Publica dudas, responde a otros y marca la respuesta aceptada. También hay grupos de aprendizaje y desafíos creativos con fecha límite.
            </p>
            <Link to="/comunidad" className="btn btn-ghost btn-sm">Entrar a la comunidad</Link>
          </div>
          <div className="card">
            <span className="badge badge-premium">Certificados</span>
            <h3>Credenciales verificables</h3>
            <p className="muted small">
              Completa las lecciones y aprueba la evaluación para obtener un certificado con identificador único y página pública de verificación.
            </p>
            <Link to="/verificar" className="btn btn-ghost btn-sm">Verificar un certificado</Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="banner">
            <div>
              <span className="eyebrow">Asistente de aprendizaje</span>
              <h2 className="mb-0">¿Atascado en un concepto?</h2>
              <p className="muted">
                El asistente explica a tu nivel, propone ejercicios y arma un plan de estudio. Funciona con un proveedor de IA real; si no hay
                clave configurada, la plataforma te lo dice en lugar de simular respuestas.
              </p>
            </div>
            <Link to="/asistente" className="btn btn-primary">{user ? 'Abrir el asistente' : 'Probar el asistente'}</Link>
          </div>
          <div className="mt-2">
            <AdSlot />
          </div>
        </div>
      </section>
    </div>
  );
}
