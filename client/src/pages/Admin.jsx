import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate, formatPrice, timeAgo } from '../lib/api.js';
import { Avatar, Badge, Empty, ErrorState, Field, Loading, Modal, Notice, toast } from '../components/ui.jsx';

const TABS = [
  ['resumen', 'Resumen'],
  ['usuarios', 'Usuarios'],
  ['instructores', 'Instructores'],
  ['cursos', 'Cursos'],
  ['pagos', 'Pagos'],
  ['certificados', 'Certificados'],
  ['reportes', 'Reportes'],
  ['contenido', 'Contenido'],
  ['publicidad', 'Publicidad'],
  ['suscripciones', 'Suscripciones'],
  ['correo', 'Correo'],
];

const STATUS_LABEL = {
  draft: 'Borrador',
  in_review: 'En revisión',
  published: 'Publicado',
  rejected: 'Rechazado',
  archived: 'Archivado',
};

const ROLE_LABEL = { student: 'Estudiante', instructor: 'Instructor', admin: 'Administrador' };

export default function Admin() {
  const [tab, setTab] = useState('resumen');
  const [overview, setOverview] = useState({ loading: true, error: null, data: null });
  const [section, setSection] = useState({ loading: false, error: null, data: null });
  const [query, setQuery] = useState('');
  const [adDraft, setAdDraft] = useState({ title: '', body: '', url: '', category_slug: '' });
  const [busy, setBusy] = useState('');

  const loadOverview = useCallback(() => {
    setOverview((prev) => ({ ...prev, loading: true, error: null }));
    api
      .get('/admin/overview')
      .then((data) => setOverview({ loading: false, error: null, data }))
      .catch((error) => setOverview({ loading: false, error, data: null }));
  }, []);

  const loadSection = useCallback(
    (target, q = '') => {
      const paths = {
        usuarios: `/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`,
        instructores: '/admin/instructors',
        cursos: `/admin/courses${q ? `?q=${encodeURIComponent(q)}` : ''}`,
        pagos: '/admin/transactions',
        certificados: '/admin/certificates',
        reportes: '/admin/reports?status=all',
        contenido: '/admin/content',
        publicidad: '/admin/ads',
        suscripciones: '/admin/subscriptions',
        correo: '/admin/email-outbox',
      };
      if (!paths[target]) return;
      setSection({ loading: true, error: null, data: null });
      api
        .get(paths[target])
        .then((data) => setSection({ loading: false, error: null, data }))
        .catch((error) => setSection({ loading: false, error, data: null }));
    },
    []
  );

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (tab !== 'resumen') loadSection(tab, query);
  }, [tab, loadSection]);

  if (overview.loading) return <div className="container page"><Loading label="Cargando administración…" /></div>;
  if (overview.error) return <div className="container page"><ErrorState error={overview.error} onRetry={loadOverview} /></div>;

  const { totals, recent_users: recentUsers, pending_instructors: pendingInstructors } = overview.data;

  async function act(label, promise, success) {
    setBusy(label);
    try {
      const data = await promise();
      toast(data?.message || success);
      loadOverview();
      if (tab !== 'resumen') loadSection(tab, query);
      return data;
    } catch (error) {
      toast(error.message, 'error');
      return null;
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="container page">
      <span className="eyebrow">Administración</span>
      <h1>Control de SKILLVERSE</h1>

      <div className="stats-row">
        <div className="kpi"><strong>{totals.users}</strong><span className="tiny muted">usuarios</span></div>
        <div className="kpi"><strong>{totals.instructors}</strong><span className="tiny muted">instructores</span></div>
        <div className="kpi"><strong>{totals.published_courses}</strong><span className="tiny muted">cursos publicados</span></div>
        <div className="kpi"><strong>{totals.courses_in_review}</strong><span className="tiny muted">en revisión</span></div>
        <div className="kpi"><strong>{totals.enrollments}</strong><span className="tiny muted">inscripciones</span></div>
        <div className="kpi"><strong>{totals.certificates}</strong><span className="tiny muted">certificados</span></div>
        <div className="kpi"><strong>{formatPrice(totals.gross_cents)}</strong><span className="tiny muted">ingresos brutos</span></div>
        <div className="kpi"><strong>{formatPrice(totals.commission_cents)}</strong><span className="tiny muted">comisión</span></div>
        <div className="kpi"><strong>{totals.open_reports}</strong><span className="tiny muted">reportes abiertos</span></div>
        <div className="kpi"><strong>{totals.pending_ads}</strong><span className="tiny muted">anuncios pendientes</span></div>
      </div>

      <div className="tabs mt-2">
        {TABS.map(([value, label]) => (
          <button key={value} type="button" className={`tab${tab === value ? ' active' : ''}`} onClick={() => { setTab(value); setQuery(''); }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'resumen' ? (
        <>
          <section className="section">
            <h3>Instructores pendientes de revisión</h3>
            {pendingInstructors?.length ? (
              <div className="list">
                {pendingInstructors.map((person) => (
                  <div key={person.id} className="list-item">
                    <div>
                      <strong>{person.name} <span className="tiny muted">@{person.username}</span></strong>
                      <div className="tiny muted">{person.email} · solicitado {timeAgo(person.instructor_applied_at)}</div>
                      {person.instructor_application ? (
                        <p className="small clamp-3">{person.instructor_application}</p>
                      ) : null}
                    </div>
                    <div className="row">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busy === `approve-${person.id}`}
                        onClick={() =>
                          act(`approve-${person.id}`, () => api.post(`/admin/instructors/${person.id}/review`, { action: 'approve' }), 'Instructor aprobado.')
                        }
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={busy === `reject-${person.id}`}
                        onClick={() =>
                          act(`reject-${person.id}`, () => api.post(`/admin/instructors/${person.id}/review`, { action: 'reject' }), 'Solicitud rechazada.')
                        }
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Notice kind="ok">No hay solicitudes de instructor pendientes.</Notice>
            )}
          </section>

          <section className="section">
            <h3>Usuarios recientes</h3>
            <div className="list">
              {recentUsers?.map((person) => (
                <div key={person.id} className="list-item">
                  <div>
                    <strong>{person.name} <span className="tiny muted">@{person.username}</span></strong>
                    <div className="tiny muted">{person.email} · {ROLE_LABEL[person.role] || person.role} · {person.plan}</div>
                  </div>
                  <span className="tiny muted">{formatDate(person.created_at)}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {['usuarios', 'cursos'].includes(tab) ? (
        <form
          className="row mt-1"
          style={{ gap: 8 }}
          onSubmit={(event) => {
            event.preventDefault();
            loadSection(tab, query);
          }}
        >
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === 'usuarios' ? 'Buscar por nombre, usuario o correo' : 'Buscar curso'} />
          <button type="submit" className="btn btn-ghost">Buscar</button>
        </form>
      ) : null}

      {section.loading ? <Loading label="Cargando…" /> : null}
      {section.error ? <ErrorState error={section.error} onRetry={() => loadSection(tab, query)} /> : null}

      {!section.loading && !section.error && tab === 'usuarios' ? (
        <UsersTable
          users={section.data?.users || []}
          busy={busy}
          onUpdate={(id, patch) => act(`user-${id}`, () => api.patch(`/admin/users/${id}`, patch), 'Usuario actualizado.')}
          onDelete={(id, username) => {
            if (!window.confirm(`¿Eliminar la cuenta @${username}? Esta acción no se puede deshacer.`)) return;
            act(`del-${id}`, () => api.del(`/admin/users/${id}`), 'Cuenta eliminada.');
          }}
        />
      ) : null}

      {!section.loading && !section.error && tab === 'instructores' ? (
        <InstructorsTable
          instructors={section.data?.instructors || []}
          busy={busy}
          onReview={(id, payload, label) => act(label, () => api.post(`/admin/instructors/${id}/review`, payload), 'Instructor actualizado.')}
        />
      ) : null}

      {!section.loading && !section.error && tab === 'cursos' ? (
        <CoursesTable
          courses={section.data?.courses || []}
          busy={busy}
          onReview={(id, action) => act(`course-${id}`, () => api.post(`/admin/courses/${id}/review`, { action }), 'Curso revisado.')}
        />
      ) : null}

      {!section.loading && !section.error && tab === 'pagos' ? (
        <Transactions data={section.data} />
      ) : null}

      {!section.loading && !section.error && tab === 'certificados' ? (
        <CertificatesTable
          certificates={section.data?.certificates || []}
          busy={busy}
          onRevoke={(code) => {
            const reason = window.prompt('Motivo de la revocación (visible en la verificación pública):');
            if (!reason) return;
            act(`revoke-${code}`, () => api.post(`/admin/certificates/${code}/revoke`, { reason }), 'Certificado revocado.');
          }}
        />
      ) : null}

      {!section.loading && !section.error && tab === 'reportes' ? (
        <Reports
          reports={section.data?.reports || []}
          busy={busy}
          onResolve={(id, action) => act(`report-${id}`, () => api.post(`/admin/reports/${id}/resolve`, { action }), 'Reporte resuelto.')}
        />
      ) : null}

      {!section.loading && !section.error && tab === 'contenido' ? (
        <Content
          posts={section.data?.posts || []}
          projects={section.data?.projects || []}
          busy={busy}
          onDeletePost={(id) => {
            if (!window.confirm('¿Eliminar esta publicación?')) return;
            act(`post-${id}`, () => api.del(`/admin/posts/${id}`), 'Publicación eliminada.');
          }}
          onDeleteProject={(id) => {
            if (!window.confirm('¿Eliminar este proyecto?')) return;
            act(`project-${id}`, () => api.del(`/admin/projects/${id}`), 'Proyecto eliminado.');
          }}
        />
      ) : null}

      {!section.loading && !section.error && tab === 'publicidad' ? (
        <>
          <form
            className="card mt-1"
            onSubmit={(event) => {
              event.preventDefault();
              act('ad-create', () => api.post('/admin/ads', adDraft), 'Anuncio creado (pendiente de aprobación).').then((data) => {
                if (data) {
                  setAdDraft({ title: '', body: '', url: '', category_slug: '' });
                  loadSection('publicidad');
                }
              });
            }}
          >
            <h3 className="mt-0">Nuevo anuncio</h3>
            <div className="grid grid-2">
              <Field label="Título">
                <input value={adDraft.title} onChange={(event) => setAdDraft({ ...adDraft, title: event.target.value })} required minLength={4} />
              </Field>
              <Field label="URL de destino">
                <input value={adDraft.url} onChange={(event) => setAdDraft({ ...adDraft, url: event.target.value })} placeholder="https://…" required />
              </Field>
            </div>
            <Field label="Texto">
              <textarea rows={2} value={adDraft.body} onChange={(event) => setAdDraft({ ...adDraft, body: event.target.value })} required />
            </Field>
            <Field label="Categoría (opcional)">
              <input value={adDraft.category_slug} onChange={(event) => setAdDraft({ ...adDraft, category_slug: event.target.value })} placeholder="tecnologia" />
            </Field>
            <button type="submit" className="btn btn-primary" disabled={busy === 'ad-create'}>Crear anuncio</button>
          </form>

          <div className="list mt-2">
            {(section.data?.ads || []).map((ad) => (
              <div key={ad.id} className="list-item">
                <div>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <strong>{ad.title}</strong>
                    <Badge kind={ad.status === 'approved' ? 'ok' : ad.status === 'pending' ? 'warn' : ''}>{ad.status}</Badge>
                    {ad.category_slug ? <Badge>{ad.category_slug}</Badge> : null}
                  </div>
                  <div className="tiny muted">{ad.body}</div>
                </div>
                <div className="row">
                  {ad.status !== 'approved' ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => act(`ad-${ad.id}`, () => api.patch(`/admin/ads/${ad.id}`, { status: 'approved' }), 'Anuncio aprobado.')}>Aprobar</button>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => act(`ad-${ad.id}`, () => api.patch(`/admin/ads/${ad.id}`, { status: 'paused' }), 'Anuncio pausado.')}>Pausar</button>
                  )}
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => act(`ad-del-${ad.id}`, () => api.del(`/admin/ads/${ad.id}`), 'Anuncio eliminado.')}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {!section.loading && !section.error && tab === 'suscripciones' ? (
        section.data?.subscriptions?.length ? (
          <div className="list mt-1">
            {section.data.subscriptions.map((subscription) => (
              <div key={subscription.id} className="list-item">
                <div>
                  <strong>{subscription.name} <span className="tiny muted">@{subscription.username}</span></strong>
                  <div className="tiny muted">{subscription.plan} · {subscription.status} · desde {formatDate(subscription.created_at)}</div>
                </div>
                <span className="tiny muted">{subscription.current_period_end ? `Renueva ${formatDate(subscription.current_period_end)}` : ''}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Sin suscripciones">Las suscripciones Premium aparecerán aquí cuando Stripe esté configurado y haya pagos.</Empty>
        )
      ) : null}

      {!section.loading && !section.error && tab === 'correo' ? (
        section.data?.emails?.length ? (
          <div className="list mt-1">
            {section.data.emails.map((email) => (
              <div key={email.id} className="list-item">
                <div>
                  <strong>{email.subject}</strong>
                  <div className="tiny muted">{email.to_email} · {email.kind} · {email.status}</div>
                </div>
                <span className="tiny muted">{timeAgo(email.created_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Sin correos en la cola">
            La recuperación de contraseña y los avisos se registran aquí cuando el servicio de correo no está configurado.
          </Empty>
        )
      ) : null}
    </div>
  );
}

function UsersTable({ users, busy, onUpdate, onDelete }) {
  if (!users.length) return <Empty title="Sin usuarios">No hay cuentas que coincidan con la búsqueda.</Empty>;
  return (
    <div className="list mt-1">
      {users.map((person) => (
        <div key={person.id} className="list-item">
          <div className="row">
            <Avatar user={person} size={36} />
            <div>
              <strong>{person.name} <span className="tiny muted">@{person.username}</span></strong>
              <div className="tiny muted">
                {person.email} · {ROLE_LABEL[person.role] || person.role} · plan {person.plan}
                {person.suspended ? ' · suspendida' : ''}
              </div>
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <Link to={`/perfil/${person.username}`} className="btn btn-ghost btn-sm">Perfil</Link>
            <select
              value={person.role}
              aria-label={`Rol de ${person.username}`}
              disabled={busy === `user-${person.id}`}
              onChange={(event) => onUpdate(person.id, { role: event.target.value })}
            >
              <option value="student">Estudiante</option>
              <option value="instructor">Instructor</option>
              <option value="admin">Administrador</option>
            </select>
            <select
              value={person.plan}
              aria-label={`Plan de ${person.username}`}
              disabled={busy === `user-${person.id}`}
              onChange={(event) => onUpdate(person.id, { plan: event.target.value })}
            >
              <option value="free">Gratuito</option>
              <option value="premium">Premium</option>
            </select>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy === `user-${person.id}`} onClick={() => onUpdate(person.id, { suspended: !person.suspended })}>
              {person.suspended ? 'Reactivar' : 'Suspender'}
            </button>
            <button type="button" className="btn btn-danger btn-sm" disabled={busy === `del-${person.id}`} onClick={() => onDelete(person.id, person.username)}>Eliminar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function InstructorsTable({ instructors, busy, onReview }) {
  if (!instructors.length) return <Empty title="Sin instructores">Aún no hay solicitudes ni instructores aprobados.</Empty>;
  return (
    <div className="list mt-1">
      {instructors.map((person) => (
        <div key={person.id} className="list-item">
          <div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <strong>{person.name} <span className="tiny muted">@{person.username}</span></strong>
              <Badge kind={person.instructor_status === 'approved' ? 'ok' : person.instructor_status === 'pending' ? 'warn' : 'danger'}>
                {person.instructor_status}
              </Badge>
              {person.price_authorized ? <Badge kind="premium">Puede cobrar</Badge> : null}
            </div>
            <div className="tiny muted">
              {person.courses} cursos · comisión {Math.round((person.commission_rate || 0) * 100)}%
              {person.instructor_applied_at ? ` · solicitado ${timeAgo(person.instructor_applied_at)}` : ''}
            </div>
            {person.instructor_application ? <p className="small clamp-3">{person.instructor_application}</p> : null}
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy === `approve-${person.id}`}
              onClick={() => onReview(person.id, { action: 'approve' }, `approve-${person.id}`)}
            >
              Aprobar
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy === `price-${person.id}`}
              onClick={() => onReview(person.id, { action: 'price', price_authorized: !person.price_authorized }, `price-${person.id}`)}
            >
              {person.price_authorized ? 'Revocar cobro' : 'Autorizar cobro'}
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy === `reject-${person.id}`}
              onClick={() => onReview(person.id, { action: 'reject' }, `reject-${person.id}`)}
            >
              Rechazar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function CoursesTable({ courses, busy, onReview }) {
  if (!courses.length) return <Empty title="Sin cursos">No hay cursos que coincidan con la búsqueda.</Empty>;
  return (
    <div className="list mt-1">
      {courses.map((course) => (
        <div key={course.id} className="list-item">
          <div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <strong>{course.title}</strong>
              <Badge kind={course.status === 'published' ? 'ok' : course.status === 'in_review' ? 'warn' : ''}>{STATUS_LABEL[course.status] || course.status}</Badge>
              {course.is_premium ? <Badge kind="premium">{formatPrice(course.price_cents)}</Badge> : <Badge kind="free">Gratuito</Badge>}
            </div>
            <div className="tiny muted">
              {course.instructor_name || course.instructor_username || 'Instructor'} · {course.lesson_count || 0} lecciones · {course.students || 0} estudiantes
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <Link to={`/cursos/${course.slug}`} className="btn btn-ghost btn-sm">Ver</Link>
            {course.status === 'in_review' ? (
              <>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy === `course-${course.id}`} onClick={() => onReview(course.id, 'approve')}>Aprobar</button>
                <button type="button" className="btn btn-danger btn-sm" disabled={busy === `course-${course.id}`} onClick={() => onReview(course.id, 'reject')}>Rechazar</button>
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function Transactions({ data }) {
  const transactions = data?.transactions || [];
  const totals = data?.totals || {};
  return (
    <>
      <div className="stats-row mt-1">
        <div className="kpi"><strong>{formatPrice(totals.gross_cents || 0)}</strong><span className="tiny muted">bruto</span></div>
        <div className="kpi"><strong>{formatPrice(totals.commission_cents || 0)}</strong><span className="tiny muted">comisión plataforma</span></div>
        <div className="kpi"><strong>{formatPrice(totals.net_cents || 0)}</strong><span className="tiny muted">neto instructores</span></div>
      </div>
      {transactions.length ? (
        <div className="list mt-1">
          {transactions.map((transaction) => (
            <div key={transaction.id} className="list-item">
              <div>
                <strong>{formatPrice(transaction.amount_cents)} · {transaction.kind}</strong>
                <div className="tiny muted">
                  {transaction.user_name || transaction.username} → {transaction.instructor_name || 'plataforma'} · {transaction.status} · {formatDate(transaction.created_at)}
                </div>
              </div>
              <span className="tiny muted">{transaction.provider || 'manual'}</span>
            </div>
          ))}
        </div>
      ) : (
        <Empty title="Sin transacciones">
          No se ha registrado ningún pago. Los cobros reales se habilitan al configurar Stripe.
        </Empty>
      )}
    </>
  );
}

function CertificatesTable({ certificates, busy, onRevoke }) {
  if (!certificates.length) return <Empty title="Sin certificados">Los certificados se emiten al completar un curso con la evaluación aprobada.</Empty>;
  return (
    <div className="list mt-1">
      {certificates.map((certificate) => (
        <div key={certificate.id} className="list-item">
          <div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <strong>{certificate.title}</strong>
              <code className="tiny">{certificate.code}</code>
              {certificate.revoked ? <Badge kind="danger">Revocado</Badge> : <Badge kind="ok">Vigente</Badge>}
            </div>
            <div className="tiny muted">
              {certificate.user_name} (@{certificate.username}) · {certificate.score}% · emitido {formatDate(certificate.issued_at)}
            </div>
          </div>
          <div className="row">
            <Link to={`/verificar/${certificate.code}`} className="btn btn-ghost btn-sm">Verificar</Link>
            {!certificate.revoked ? (
              <button type="button" className="btn btn-danger btn-sm" disabled={busy === `revoke-${certificate.code}`} onClick={() => onRevoke(certificate.code)}>
                Revocar
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function Reports({ reports, busy, onResolve }) {
  if (!reports.length) return <Empty title="Sin reportes">No hay contenido reportado por la comunidad.</Empty>;
  return (
    <div className="list mt-1">
      {reports.map((report) => (
        <div key={report.id} className="list-item">
          <div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <strong>{report.target_type} #{report.target_id}</strong>
              <Badge kind={report.status === 'open' ? 'warn' : 'ok'}>{report.status}</Badge>
            </div>
            <div className="tiny muted">Motivo: {report.reason} · por @{report.reporter_username} · {timeAgo(report.created_at)}</div>
            {report.details ? <p className="small clamp-3">{report.details}</p> : null}
          </div>
          {report.status === 'open' ? (
            <div className="row">
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy === `report-${report.id}`} onClick={() => onResolve(report.id, 'dismiss')}>Descartar</button>
              <button type="button" className="btn btn-danger btn-sm" disabled={busy === `report-${report.id}`} onClick={() => onResolve(report.id, 'action')}>Aplicar acción</button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Content({ posts, projects, busy, onDeletePost, onDeleteProject }) {
  return (
    <div className="grid grid-2 mt-1">
      <section>
        <h3>Publicaciones</h3>
        {posts.length ? (
          <div className="list">
            {posts.map((post) => (
              <div key={post.id} className="list-item">
                <div>
                  <strong className="small">{post.title || post.body?.slice(0, 60)}</strong>
                  <div className="tiny muted">@{post.username} · {post.kind} · {timeAgo(post.created_at)}</div>
                </div>
                <div className="row">
                  <Link to={`/comunidad/${post.id}`} className="btn btn-ghost btn-sm">Ver</Link>
                  <button type="button" className="btn btn-danger btn-sm" disabled={busy === `post-${post.id}`} onClick={() => onDeletePost(post.id)}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Sin publicaciones" />
        )}
      </section>
      <section>
        <h3>Proyectos</h3>
        {projects.length ? (
          <div className="list">
            {projects.map((project) => (
              <div key={project.id} className="list-item">
                <div>
                  <strong className="small">{project.title}</strong>
                  <div className="tiny muted">@{project.username} · {timeAgo(project.created_at)}</div>
                </div>
                <div className="row">
                  <Link to={`/proyectos/${project.id}`} className="btn btn-ghost btn-sm">Ver</Link>
                  <button type="button" className="btn btn-danger btn-sm" disabled={busy === `project-${project.id}`} onClick={() => onDeleteProject(project.id)}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Sin proyectos" />
        )}
      </section>
    </div>
  );
}
