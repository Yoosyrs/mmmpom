import crypto from 'node:crypto';
import { HttpError } from '../util.js';

export function paymentsConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function paymentsStatus() {
  return {
    configured: paymentsConfigured(),
    provider: 'Stripe',
    message: paymentsConfigured()
      ? null
      : 'Los pagos reales no están configurados. Añade STRIPE_SECRET_KEY (y STRIPE_WEBHOOK_SECRET para confirmar compras) para activar suscripciones y ventas del marketplace. No se simulan cobros.',
  };
}

async function stripeRequest(path, params) {
  if (!paymentsConfigured()) {
    throw new HttpError(503, 'El sistema de pagos no está configurado todavía. Añade STRIPE_SECRET_KEY para activar cobros reales.', {
      code: 'payments_not_configured',
    });
  }
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(502, data?.error?.message || 'Stripe rechazó la solicitud de pago.', {
      code: 'payments_provider_error',
    });
  }
  return data;
}

export async function createCheckoutSession({ user, kind, plan, course, successUrl, cancelUrl }) {
  const params = {
    mode: kind === 'subscription' ? 'subscription' : 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: String(user.id),
    customer_email: user.email,
    'metadata[kind]': kind,
    'metadata[user_id]': String(user.id),
  };

  if (kind === 'subscription') {
    params['metadata[plan]'] = plan.id;
    params['line_items[0][quantity]'] = '1';
    params['line_items[0][price_data][currency]'] = 'eur';
    params['line_items[0][price_data][unit_amount]'] = String(plan.price_cents);
    params['line_items[0][price_data][recurring][interval]'] = 'month';
    params['line_items[0][price_data][product_data][name]'] = `SKILLVERSE ${plan.name}`;
  } else {
    const fee = Math.round((course.price_cents * (course.platform_commission || 20)) / 100);
    params['metadata[course_id]'] = String(course.id);
    params['metadata[course_slug]'] = course.slug;
    params['metadata[instructor_id]'] = String(course.instructor_id);
    params['metadata[platform_fee_cents]'] = String(fee);
    params['line_items[0][quantity]'] = '1';
    params['line_items[0][price_data][currency]'] = 'eur';
    params['line_items[0][price_data][unit_amount]'] = String(course.price_cents);
    params['line_items[0][price_data][product_data][name]'] = course.title;
  }

  return stripeRequest('checkout/sessions', params);
}

export function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key, value];
    })
  );
  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
