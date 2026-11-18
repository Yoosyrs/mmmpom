import express from 'express';
import crypto from 'node:crypto';
import { all, get, insert, run, nowIso } from '../db.js';
import { requireAuth } from '../auth.js';
import { bad, rateLimit, text, toInt } from '../util.js';
import { aiStatus, chat } from '../services/ai.js';
import { createCheckoutSession, paymentsConfigured, paymentsStatus, verifyStripeSignature } from '../services/billing.js';
import { emailConfigured, appUrl } from '../services/email.js';
import { COMMISSION_RATE, PLANS } from '../plans.js';

const router = express.Router();

const AI_DAILY_LIMITS = { free: 25, premium: 400, edu: 600 };

function aiQuota(user) {
  const limit = AI_DAILY_LIMITS[user.plan] || AI_DAILY_LIMITS.free;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const used = Number(
    get("SELECT COUNT(*) AS total FROM ai_messages WHERE user_id = ? AND role = 'user' AND created_at >= ?", [user.id, since])?.total || 0
  );
  return { limit, used, remaining: Math.max(limit - used, 0) };
}

router.get('/config', (req, res) => {
  const stats = get(
    `SELECT
      (SELECT COUNT(*) FROM courses WHERE status = 'published') AS courses,
      (SELECT COUNT(*) FROM users) AS learners,
      (SELECT COUNT(*) FROM projects) AS projects,
      (SELECT COUNT(*) FROM certificates WHERE revoked = 0) AS certificates`
  );
  res.json({
    app: { name: 'SKILLVERSE', tagline: 'Learn Something. Become Something.', url: appUrl(req) },
    integrations: {
      ai: aiStatus(),
      payments: paymentsStatus(),
      email: {
        configured: emailConfigured(),
        message: emailConfigured()
          ? null
          : 'El envío de email no está configurado. Los enlaces de recuperación se guardan en la cola de correo y el administrador puede entregarlos manualmente.',
      },
    },
    plans: PLANS,
    commission_rate: COMMISSION_RATE,
    stats: Object.fromEntries(Object.entries(stats || {}).map(([key, value]) => [key, Number(value || 0)])),
    ai_quota: req.user ? aiQuota(req.user) : null,
  });
});

router.get('/ai/status', requireAuth, (req, res) => {
  res.json({ ...aiStatus(), quota: aiQuota(req.user) });
});

router.post('/ai/chat', requireAuth, async (req, res, next) => {
  try {
    const message = text(req.body?.message, 3000);
    if (message.length < 2) throw bad('Escribe tu pregunta.');
    const mode = ['tutor', 'ejercicios', 'plan', 'explicar'].includes(req.body?.mode) ? req.body.mode : 'tutor';
    const level = ['principiante', 'intermedio', 'avanzado'].includes(req.body?.level) ? req.body.level : 'principiante';

    const limited = rateLimit(`ai:${req.user.id}`, { limit: 20, windowMs: 60_000 });
    if (!limited.ok) throw bad(`Espera ${limited.retryAfter}s antes de enviar otra consulta.`, 429);

    const quota = aiQuota(req.user);
    if (quota.remaining <= 0) {
      throw bad(`Alcanzaste el límite diario de ${quota.limit} consultas de tu plan. Mejora a Premium para ampliarlo.`, 429);
    }

    const history = all(
      "SELECT role, content FROM ai_messages WHERE user_id = ? AND role IN ('user','assistant') ORDER BY id DESC LIMIT 8",
      [req.user.id]
    ).reverse();

    const courseContext = req.body?.course_slug
      ? get("SELECT title, level, description FROM courses WHERE slug = ? AND status = 'published'", [text(req.body.course_slug, 90)])
      : null;

    const system = [
      'Eres el asistente de aprendizaje de SKILLVERSE, una plataforma de habilidades digitales en español.',
      'Explica con claridad, ejemplos concretos y pasos accionables. Adapta la profundidad al nivel indicado.',
      `Nivel del estudiante: ${level}.`,
      mode === 'ejercicios'
        ? 'Propón entre 3 y 5 ejercicios prácticos con criterios de evaluación claros y soluciones orientativas.'
        : mode === 'plan'
          ? 'Genera un plan de estudio semanal con objetivos, recursos sugeridos y una forma de medir el avance.'
          : mode === 'explicar'
            ? 'Explica el concepto como si el estudiante nunca lo hubiera visto, con una analogía y un ejemplo aplicado.'
            : 'Responde dudas educativas y recomienda rutas de aprendizaje del catálogo cuando sea útil.',
      courseContext
        ? `Contexto del curso: "${courseContext.title}" (${courseContext.level}). ${String(courseContext.description).slice(0, 700)}`
        : '',
      'Nunca inventes certificaciones oficiales ni prometas resultados garantizados. Si no sabes algo, dilo.',
      'Responde en español, en texto plano con listas simples (sin HTML).',
    ]
      .filter(Boolean)
      .join('\n');

    let reply;
    try {
      reply = await chat([
        { role: 'system', content: system },
        ...history.map((item) => ({ role: item.role, content: item.content })),
        { role: 'user', content: message },
      ]);
    } catch (error) {
      return next(error);
    }

    insert('INSERT INTO ai_messages (user_id, role, content, mode, created_at) VALUES (?,?,?,?,?)', [
      req.user.id,
      'user',
      message,
      mode,
      nowIso(),
    ]);
    insert('INSERT INTO ai_messages (user_id, role, content, mode, created_at) VALUES (?,?,?,?,?)', [
      req.user.id,
      'assistant',
      reply.content,
      mode,
      nowIso(),
    ]);

    res.json({
      reply: reply.content,
      model: reply.model,
      provider: 'OpenAI',
      usage: reply.usage,
      quota: aiQuota(req.user),
      fallback: false,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/ai/history', requireAuth, (req, res) => {
  res.json({
    messages: all('SELECT role, content, mode, created_at FROM ai_messages WHERE user_id = ? ORDER BY id DESC LIMIT 40', [
      req.user.id,
    ]).reverse(),
    quota: aiQuota(req.user),
  });
});

router.get('/ads/serve', requireAuth, (req, res) => {
  if (req.user.plan !== 'free') {
    return res.json({ ad: null, reason: 'Sin anuncios: tu plan no muestra publicidad.' });
  }
  const category = text(req.query.category, 60);
  const ad =
    (category &&
      get("SELECT * FROM ads WHERE status = 'approved' AND (category_slug = ? OR category_slug = '') ORDER BY RANDOM() LIMIT 1", [
        category,
      ])) ||
    get("SELECT * FROM ads WHERE status = 'approved' ORDER BY RANDOM() LIMIT 1");
  if (!ad) return res.json({ ad: null, reason: 'No hay anuncios aprobados por ahora.' });
  run('UPDATE ads SET impressions = impressions + 1 WHERE id = ?', [ad.id]);
  res.json({ ad: { id: ad.id, title: ad.title, body: ad.body, url: ad.url, category_slug: ad.category_slug } });
});

router.post('/ads/:id/click', requireAuth, (req, res) => {
  run('UPDATE ads SET clicks = clicks + 1 WHERE id = ?', [toInt(req.params.id, 0)]);
  res.json({ ok: true });
});

router.post('/checkout/course/:slug', requireAuth, async (req, res, next) => {
  try {
    const course = get(
      `SELECT c.*, u.commission_rate FROM courses c JOIN users u ON u.id = c.instructor_id
       WHERE c.slug = ? AND c.status = 'published'`,
      [req.params.slug]
    );
    if (!course) throw bad('Curso no encontrado.', 404);
    if (course.instructor_id === req.user.id) throw bad('No puedes comprar tu propio curso.');
    if (course.price_cents <= 0) throw bad('Este curso es gratuito: inscríbete directamente desde su página.');
    const enrolled = get('SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?', [req.user.id, course.id]);
    if (enrolled) throw bad('Ya estás inscrito en este curso.');

    if (!paymentsConfigured()) {
      throw new (await import('../util.js')).HttpError(503, paymentsStatus().message, { code: 'payments_not_configured' });
    }

    const session = await createCheckoutSession({
      user: req.user,
      kind: 'course',
      course: { ...course, platform_commission: Number(course.commission_rate || COMMISSION_RATE) },
      successUrl: `${appUrl(req)}/curso/${course.slug}?compra=exito`,
      cancelUrl: `${appUrl(req)}/curso/${course.slug}?compra=cancelada`,
    });

    insert(
      `INSERT INTO transactions (user_id, kind, reference, description, amount_cents, platform_fee_cents, instructor_id, provider, provider_ref, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.user.id,
        'course',
        course.slug,
        `Compra del curso ${course.title}`,
        course.price_cents,
        Math.round((course.price_cents * Number(course.commission_rate || COMMISSION_RATE)) / 100),
        course.instructor_id,
        'stripe',
        session.id,
        'pending',
        nowIso(),
      ]
    );

    res.json({ checkout_url: session.url, session_id: session.id });
  } catch (error) {
    next(error);
  }
});

router.post('/checkout/subscription', requireAuth, async (req, res, next) => {
  try {
    const planId = text(req.body?.plan_id, 20);
    const plan = PLANS.find((item) => item.id === planId && item.price_cents > 0);
    if (!plan) throw bad('Plan no válido.');
    if (req.user.plan === plan.id) throw bad('Ya tienes ese plan activo.');

    if (!paymentsConfigured()) {
      const { HttpError } = await import('../util.js');
      throw new HttpError(503, paymentsStatus().message, { code: 'payments_not_configured' });
    }

    const session = await createCheckoutSession({
      user: req.user,
      kind: 'subscription',
      plan,
      successUrl: `${appUrl(req)}/premium?estado=exito`,
      cancelUrl: `${appUrl(req)}/premium?estado=cancelado`,
    });

    insert(
      `INSERT INTO subscriptions (user_id, plan, status, provider, provider_ref, started_at, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      [req.user.id, plan.id, 'incomplete', 'stripe', session.id, nowIso(), nowIso()]
    );

    res.json({ checkout_url: session.url, session_id: session.id });
  } catch (error) {
    next(error);
  }
});

/**
 * Stripe webhook. Requires the raw request body; mounted before express.json in index.js.
 */
export async function stripeWebhookHandler(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'Falta STRIPE_WEBHOOK_SECRET para verificar la firma del webhook.' });
  }
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const signature = req.headers['stripe-signature'];
  if (!verifyStripeSignature(raw, signature, secret)) {
    return res.status(400).json({ error: 'Firma de webhook inválida.' });
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Cuerpo de webhook inválido.' });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object || {};
      const metadata = session.metadata || {};
      const userId = toInt(metadata.user_id, 0);
      const kind = metadata.kind;

      if (kind === 'subscription' && userId) {
        const plan = PLANS.find((item) => item.id === metadata.plan);
        const existing = get("SELECT id FROM transactions WHERE provider_ref = ? AND kind = 'subscription'", [session.id]);
        if (!existing) {
          insert(
            `INSERT INTO transactions (user_id, kind, reference, description, amount_cents, platform_fee_cents, instructor_id, provider, provider_ref, status, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [
              userId,
              'subscription',
              metadata.plan || 'premium',
              `Suscripción ${plan?.name || 'Premium'} de SKILLVERSE`,
              plan?.price_cents || 0,
              0,
              null,
              'stripe',
              session.id,
              'paid',
              nowIso(),
            ]
          );
          run('UPDATE users SET plan = ?, plan_renews_at = ? WHERE id = ?', [
            metadata.plan || 'premium',
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            userId,
          ]);
          const pending = get("SELECT id FROM subscriptions WHERE provider_ref = ? AND status = 'incomplete'", [session.id]);
          if (pending) {
            run('UPDATE subscriptions SET status = ?, provider_ref = ?, current_period_end = ? WHERE id = ?', [
              'active',
              session.subscription || session.id,
              new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              pending.id,
            ]);
          } else {
            insert(
              'INSERT INTO subscriptions (user_id, plan, status, provider, provider_ref, started_at, current_period_end, created_at) VALUES (?,?,?,?,?,?,?,?)',
              [
                userId,
                metadata.plan || 'premium',
                'active',
                'stripe',
                session.subscription || session.id,
                nowIso(),
                new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                nowIso(),
              ]
            );
          }
        }
      }

      if (kind === 'course' && userId) {
        const courseId = toInt(metadata.course_id, 0);
        const course = get('SELECT * FROM courses WHERE id = ?', [courseId]);
        const existing = get("SELECT id FROM transactions WHERE provider_ref = ?", [session.id]);
        if (course && !existing) {
          run('UPDATE transactions SET status = ?, provider_ref = ? WHERE provider_ref = ? AND status = ?', [
            'paid',
            session.payment_intent || session.id,
            session.id,
            'pending',
          ]);
          insert('INSERT OR IGNORE INTO enrollments (user_id, course_id, created_at) VALUES (?,?,?)', [
            userId,
            course.id,
            nowIso(),
          ]);
        }
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data?.object || {};
      run("UPDATE subscriptions SET status = 'canceled' WHERE provider_ref = ?", [subscription.id]);
      const row = get('SELECT user_id FROM subscriptions WHERE provider_ref = ? ORDER BY id DESC LIMIT 1', [subscription.id]);
      if (row) run("UPDATE users SET plan = 'free', plan_renews_at = NULL WHERE id = ?", [row.user_id]);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[stripe] webhook error', error);
    res.status(500).json({ error: 'No se pudo procesar el evento.' });
  }
}

export function webhookSignatureHint() {
  return crypto.randomBytes(0).toString('hex');
}

export default router;
