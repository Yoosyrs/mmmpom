import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, flush, UPLOAD_DIR } from './db.js';
import { attachUser } from './auth.js';
import { HttpError } from './util.js';
import { seed } from './seed.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import socialRoutes from './routes/social.js';
import instructorRoutes from './routes/instructor.js';
import adminRoutes from './routes/admin.js';
import integrationRoutes, { stripeWebhookHandler } from './routes/integrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "img-src 'self' data: blob: https:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "connect-src 'self'",
        "font-src 'self' data:",
        "frame-src https://www.youtube.com https://player.vimeo.com",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    );
  }
  next();
});

// Stripe needs the untouched raw body for signature verification.
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json', limit: '1mb' }), stripeWebhookHandler);

app.use(express.json({ limit: '14mb' }));
app.use(attachUser);

app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    index: false,
    dotfiles: 'deny',
    maxAge: '1h',
    setHeaders(res, filePath) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'");
      if (!/\.(png|jpe?g|webp|gif|avif)$/i.test(filePath)) {
        res.setHeader('Content-Disposition', 'attachment');
      }
    },
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'SKILLVERSE', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/instructor', instructorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', catalogRoutes);
app.use('/api', socialRoutes);
app.use('/api', integrationRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado.' });
});

// Serve the built SPA (Vite output) with a client-side routing fallback.
if (fs.existsSync(DIST)) {
  app.use(
    express.static(DIST, {
      index: false,
      maxAge: '1h',
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .type('html')
      .send(
        '<!doctype html><html lang="es"><body style="background:#070b18;color:#e8ecff;font-family:system-ui;padding:48px"><h1>SKILLVERSE</h1><p>El cliente no está compilado. Ejecuta <code>npm run build</code> y reinicia.</p></body></html>'
      );
  });
}

app.use((error, _req, res, _next) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message, ...error.extra });
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El contenido enviado es demasiado grande.' });
  }
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'JSON inválido en la solicitud.' });
  }
  console.error('[error]', error);
  res.status(500).json({ error: 'Ocurrió un error inesperado. Inténtalo de nuevo.' });
});

let server;

async function main() {
  await initDb();
  seed();
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`SKILLVERSE escuchando en http://0.0.0.0:${PORT}`);
  });
}

function shutdown(signal) {
  console.log(`[server] ${signal} recibido, cerrando...`);
  flush();
  if (server) server.close(() => process.exit(0));
  else process.exit(0);
  setTimeout(() => process.exit(0), 4000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((error) => {
  console.error('No se pudo iniciar SKILLVERSE', error);
  process.exit(1);
});
