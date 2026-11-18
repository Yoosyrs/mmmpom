import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../App.jsx';
import { Avatar, Badge, ToastHost } from './ui.jsx';

const NAV = [
  { to: '/catalogo', label: 'Catálogo' },
  { to: '/proyectos', label: 'Laboratorio' },
  { to: '/comunidad', label: 'Comunidad' },
  { to: '/grupos', label: 'Grupos' },
  { to: '/desafios', label: 'Desafíos' },
  { to: '/asistente', label: 'Asistente IA' },
];

export default function Layout({ children }) {
  const { user, capabilities, logout, loading } = useSession();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setOpen(false);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }, [location.pathname]);

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  const links = [...NAV];
  if (user) links.push({ to: '/panel', label: 'Mi panel' });
  if (capabilities?.instructor) links.push({ to: '/instructor', label: 'Estudio' });
  if (capabilities?.admin) links.push({ to: '/admin', label: 'Admin' });

  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Link to="/" className="brand" aria-label="SKILLVERSE, inicio">
            <span className="brand-mark">S</span>
            <span className="brand-text">
              SKILL<span className="grad-text">VERSE</span>
            </span>
          </Link>

          <nav className="nav-links" aria-label="Navegación principal">
            {links.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="nav-actions">
            {loading ? null : user ? (
              <div className="row" style={{ position: 'relative' }}>
                <Link to={`/perfil/${user.username}`} className="row" aria-label="Mi perfil">
                  <Avatar user={user} size={34} />
                </Link>
                <button type="button" className="icon-btn" onClick={() => setMenu((value) => !value)} aria-expanded={menu} aria-label="Menú de cuenta">
                  ▾
                </button>
                {menu ? (
                  <div className="card" style={{ position: 'absolute', right: 0, top: 46, minWidth: 220, zIndex: 40 }}>
                    <div className="stack-sm">
                      <div>
                        <strong>{user.name}</strong>
                        <div className="muted tiny">@{user.username}</div>
                      </div>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        <Badge kind={user.role === 'admin' ? 'premium' : 'info'}>{user.role}</Badge>
                        {user.plan === 'premium' ? <Badge kind="premium">Premium</Badge> : null}
                      </div>
                      <Link to="/panel" className="btn btn-ghost btn-sm">Mi panel</Link>
                      <Link to="/configuracion" className="btn btn-ghost btn-sm">Configuración</Link>
                      {capabilities?.instructor ? <Link to="/instructor" className="btn btn-ghost btn-sm">Estudio de instructor</Link> : null}
                      {capabilities?.admin ? <Link to="/admin" className="btn btn-ghost btn-sm">Panel administrativo</Link> : null}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>Cerrar sesión</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <Link to="/entrar" className="btn btn-ghost btn-sm">Entrar</Link>
                <Link to="/registro" className="btn btn-primary btn-sm">Crear cuenta</Link>
              </>
            )}
            <button type="button" className="nav-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Abrir menú">
              ☰
            </button>
          </div>
        </div>
      </header>

      {open ? (
        <div className="mobile-drawer">
          {links.map((item) => (
            <NavLink key={item.to} to={item.to} className="nav-link">
              {item.label}
            </NavLink>
          ))}
          {!user ? (
            <div className="row mt-2">
              <Link to="/entrar" className="btn btn-ghost">Entrar</Link>
              <Link to="/registro" className="btn btn-primary">Crear cuenta</Link>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost mt-2" onClick={handleLogout}>Cerrar sesión</button>
          )}
        </div>
      ) : null}

      <main>{children}</main>

      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <div className="brand">
                <span className="brand-mark">S</span>
                <span className="brand-text">SKILL<span className="grad-text">VERSE</span></span>
              </div>
              <p className="muted small mt-1">
                Learn Something. Become Something. Aprende habilidades digitales, practica con proyectos reales y comparte lo que sabes.
              </p>
            </div>
            <div>
              <div className="strong small">Aprender</div>
              <div className="stack-sm mt-1">
                <Link className="muted small" to="/catalogo">Catálogo de habilidades</Link>
                <Link className="muted small" to="/asistente">Asistente de aprendizaje</Link>
                <Link className="muted small" to="/precios">Planes</Link>
                <Link className="muted small" to="/verificar">Verificar certificado</Link>
              </div>
            </div>
            <div>
              <div className="strong small">Comunidad</div>
              <div className="stack-sm mt-1">
                <Link className="muted small" to="/comunidad">Publicaciones y preguntas</Link>
                <Link className="muted small" to="/proyectos">Laboratorio de proyectos</Link>
                <Link className="muted small" to="/grupos">Grupos de aprendizaje</Link>
                <Link className="muted small" to="/desafios">Desafíos creativos</Link>
              </div>
            </div>
            <div>
              <div className="strong small">Crear</div>
              <div className="stack-sm mt-1">
                <Link className="muted small" to="/instructor">Estudio de instructor</Link>
                <Link className="muted small" to="/configuracion">Privacidad y cuenta</Link>
                <Link className="muted small" to="/admin">Administración</Link>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <span className="muted tiny">
              © {new Date().getFullYear()} SKILLVERSE. Los certificados son credenciales internas de la plataforma: no son títulos académicos oficiales.
            </span>
            <span className="muted tiny">Hecho para aprender haciendo.</span>
          </div>
        </div>
      </footer>
      <ToastHost />
    </>
  );
}
