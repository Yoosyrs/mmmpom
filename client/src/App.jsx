import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './lib/api.js';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';

import Home from './pages/Home.jsx';
import Catalog from './pages/Catalog.jsx';
import Course from './pages/Course.jsx';
import Lesson from './pages/Lesson.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Community from './pages/Community.jsx';
import PostDetail from './pages/PostDetail.jsx';
import Projects from './pages/Projects.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import Groups from './pages/Groups.jsx';
import GroupDetail from './pages/GroupDetail.jsx';
import Challenges from './pages/Challenges.jsx';
import ChallengeDetail from './pages/ChallengeDetail.jsx';
import Profile from './pages/Profile.jsx';
import Settings from './pages/Settings.jsx';
import Assistant from './pages/Assistant.jsx';
import Pricing from './pages/Pricing.jsx';
import Verify from './pages/Verify.jsx';
import Instructor from './pages/Instructor.jsx';
import Admin from './pages/Admin.jsx';
import { Forgot, Login, Register, Reset } from './pages/Auth.jsx';
import NotFound from './pages/NotFound.jsx';

const SessionContext = createContext(null);

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession debe usarse dentro de SessionProvider');
  return value;
}

function SessionProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, stats: null, capabilities: null });

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      setState({ loading: false, user: data.user, stats: data.stats, capabilities: data.capabilities });
      return data;
    } catch {
      setState({ loading: false, user: null, stats: null, capabilities: null });
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    setState({ loading: false, user: data.user, stats: data.stats, capabilities: data.capabilities });
    return data;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api.post('/auth/register', payload);
    setState({ loading: false, user: data.user, stats: data.stats, capabilities: data.capabilities });
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setState({ loading: false, user: null, stats: null, capabilities: null });
    }
  }, []);

  const value = useMemo(
    () => ({ ...state, refresh, login, register, logout, setUser: (user) => setState((prev) => ({ ...prev, user })) }),
    [state, refresh, login, register, logout]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function RequireAuth({ children, role }) {
  const { loading, user, capabilities } = useSession();
  const location = useLocation();
  if (loading) return <div className="loading-block"><Spinner label="Comprobando tu sesión…" /></div>;
  if (!user) return <Navigate to={`/entrar?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (role === 'admin' && !capabilities?.admin) {
    return (
      <div className="container page">
        <div className="empty">
          <h2>Solo administración</h2>
          <p className="muted">Esta sección requiere el rol de administrador.</p>
        </div>
      </div>
    );
  }
  if (role === 'instructor' && !capabilities?.instructor) {
    return (
      <div className="container page">
        <div className="empty">
          <h2>Necesitas ser instructor</h2>
          <p className="muted">Solicita acceso de instructor desde tu configuración para publicar cursos.</p>
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <SessionProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/catalogo" element={<Catalog />} />
          <Route path="/cursos/:slug" element={<Course />} />
          <Route path="/lecciones/:id" element={<Lesson />} />
          <Route path="/comunidad" element={<Community />} />
          <Route path="/comunidad/:id" element={<PostDetail />} />
          <Route path="/proyectos" element={<Projects />} />
          <Route path="/proyectos/:id" element={<ProjectDetail />} />
          <Route path="/grupos" element={<Groups />} />
          <Route path="/grupos/:slug" element={<GroupDetail />} />
          <Route path="/desafios" element={<Challenges />} />
          <Route path="/desafios/:slug" element={<ChallengeDetail />} />
          <Route path="/perfil/:username" element={<Profile />} />
          <Route path="/precios" element={<Pricing />} />
          <Route path="/verificar" element={<Verify />} />
          <Route path="/verificar/:code" element={<Verify />} />
          <Route path="/asistente" element={<Assistant />} />
          <Route path="/entrar" element={<Login />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/recuperar" element={<Forgot />} />
          <Route path="/restablecer" element={<Reset />} />
          <Route
            path="/panel"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/configuracion"
            element={
              <RequireAuth>
                <Settings />
              </RequireAuth>
            }
          />
          <Route
            path="/instructor"
            element={
              <RequireAuth role="instructor">
                <Instructor />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth role="admin">
                <Admin />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </SessionProvider>
  );
}
