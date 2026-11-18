import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../App.jsx';
import { ErrorState, Loading, Notice, toast } from '../components/ui.jsx';

export default function Pricing() {
  const { user, capabilities, refresh } = useSession();
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api.get('/plans').then((data) => setPlans(data.plans || [])).catch(setError);
  }, []);

  async function subscribe(planId) {
    setBusy(planId);
    try {
      const result = await api.post('/checkout/subscription', { plan_id: planId });
      if (result.checkout_url) {
        window.location.assign(result.checkout_url);
        return;
      }
      toast(result.message || 'Solicitud registrada.');
      await refresh();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy('');
    }
  }

  if (error) return <div className="container page"><ErrorState error={error} /></div>;
  if (!plans.length) return <div className="container page"><Loading label="Cargando planes…" /></div>;

  return (
    <div className="container page">
      <span className="eyebrow">Monetización transparente</span>
      <h1>Planes de SKILLVERSE</h1>
      <p className="muted" style={{ maxWidth: 720 }}>
        Aprender es gratis. Premium añade cursos seleccionados, herramientas de estudio avanzadas y recursos exclusivos. Los cobros se procesan
        con Stripe cuando la integración está configurada; nunca simulamos un pago.
      </p>

      <div className="grid grid-3 mt-2">
        {plans.map((plan) => (
          <div key={plan.id} className={`card plan-card${plan.id === 'premium' ? ' plan-featured' : ''}`}>
            <div className="row-between">
              <h3 className="mb-0">{plan.name}</h3>
              {plan.id === user?.plan ? <span className="badge badge-ok">Tu plan</span> : null}
            </div>
            <div className="plan-price">
              {plan.price_cents === 0 ? 'Gratis' : `$${(plan.price_cents / 100).toFixed(2)}`}
              {plan.price_cents > 0 ? <span className="muted small"> /mes</span> : null}
            </div>
            <p className="muted small">{plan.tagline}</p>
            <ul className="plan-features">
              {(plan.features || []).map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            {plan.id === 'free' ? (
              <Link to={user ? '/catalogo' : '/registro'} className="btn btn-ghost btn-block">
                {user ? 'Explorar cursos' : 'Crear cuenta gratis'}
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={busy === plan.id || capabilities?.premium}
                onClick={() => subscribe(plan.id)}
              >
                {capabilities?.premium ? 'Ya tienes Premium' : busy === plan.id ? 'Procesando…' : 'Suscribirme'}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-2 mt-2">
        <div className="card">
          <h3>Planes educativos</h3>
          <p className="muted small">
            Academias, instituciones y equipos pueden solicitar un plan con cuentas agrupadas, seguimiento de cohortes y facturación. La solicitud se
            registra en el panel administrativo y el cobro se gestiona con Stripe.
          </p>
          <Link to={user ? '/configuracion' : '/registro'} className="btn btn-ghost btn-sm">Solicitar información</Link>
        </div>
        <div className="card">
          <h3>Marketplace de instructores</h3>
          <p className="muted small">
            Los instructores autorizados pueden vender cursos y recursos. SKILLVERSE aplica una comisión transparente sobre cada venta, visible en el
            estudio de instructor y en el panel administrativo.
          </p>
          <Link to="/instructor" className="btn btn-ghost btn-sm">Ver estudio de instructor</Link>
        </div>
      </div>

      <Notice kind="info">
        Los certificados de SKILLVERSE acreditan la finalización de nuestros propios cursos. No son títulos académicos oficiales.
      </Notice>
    </div>
  );
}
