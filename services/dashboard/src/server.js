// SushiMarket TR Dashboard — Express server.
//
// Serves:
//   * /                — статический UI (SPA-stub, см. public/)
//   * /api/stats       — счётчики и состояние WF
//   * /api/timeline    — последние события из notification_log
//   * /api/orders      — текущие активные заказы
//   * /api/alerts      — последние алерты из alert_throttle
//   * /api/wa/status   — состояние WhatsApp-сессии (stub до интеграции wa-bridge)
//   * /api/wa/qr       — QR для подключения (stub)
//   * /api/wa/logout   — отвязать аккаунт (stub)
//   * /api/wa/send     — внутренний endpoint, вызывается n8n (X-Internal-Token)
//   * /health          — без auth, для healthcheck

import express from 'express';
import basicAuth from 'express-basic-auth';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q } from './db.js';
import * as wa from './wa.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 8080);
const USER = process.env.DASHBOARD_USER;
const PASS = process.env.DASHBOARD_PASS;
const INTERNAL_TOKEN = process.env.DASHBOARD_INTERNAL_TOKEN;

if (!USER || !PASS) {
  console.error('DASHBOARD_USER / DASHBOARD_PASS not set');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '64kb' }));
app.disable('x-powered-by');

// Health — открытый, без auth.
app.get('/health', (_req, res) => res.json({ ok: true }));

// Внутренний endpoint для n8n — авторизация через X-Internal-Token.
// Дополнительно пишет факт отправки в notification_log, чтобы был
// единый аудит-журнал в БД (вместо разных мест в каждом workflow).
app.post('/api/wa/send', async (req, res) => {
  if (!INTERNAL_TOKEN || req.headers['x-internal-token'] !== INTERNAL_TOKEN) {
    return res.status(401).json({ ok: false, error: 'invalid_token' });
  }
  const { phone, text, order_id, template } = req.body || {};
  if (!phone || !text) {
    return res.status(400).json({ ok: false, error: 'phone_and_text_required' });
  }
  const tplName = template || 'unknown';
  const orderIdNum = Number(order_id) || 0;
  try {
    const r = await wa.sendMessage(String(phone), String(text));
    // Лог успешной отправки.
    q(
      `INSERT INTO notification_log(order_id, template, channel, target_phone, payload, response, success)
       VALUES ($1::bigint, $2, 'whatsapp', $3, $4::jsonb, $5::jsonb, true)`,
      [orderIdNum, tplName, String(phone), JSON.stringify({ text }), JSON.stringify(r)]
    ).catch((e) => console.error('notification_log insert failed:', e.message));
    res.json({ ok: true, ...r });
  } catch (e) {
    // Лог провала.
    q(
      `INSERT INTO notification_log(order_id, template, channel, target_phone, payload, success, error_text)
       VALUES ($1::bigint, $2, 'whatsapp', $3, $4::jsonb, false, $5)`,
      [orderIdNum, tplName, String(phone), JSON.stringify({ text }), String(e.message).slice(0, 500)]
    ).catch((err) => console.error('notification_log insert failed:', err.message));
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Всё остальное — basic auth.
app.use(basicAuth({
  users: { [USER]: PASS },
  challenge: true,
  realm: 'SushiMarket Dashboard',
}));

// ── API ────────────────────────────────────────────────────────────────────

app.get('/api/stats', async (_req, res) => {
  try {
    const [ordersAgg, msgAgg, alertsAgg] = await Promise.all([
      q(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') AS last_1h,
          COUNT(*) FILTER (WHERE last_status NOT IN ('completed','canceled')) AS active,
          COUNT(*) FILTER (WHERE last_status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE last_status = 'canceled') AS canceled
        FROM order_events
      `),
      q(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE sent_at > NOW() - INTERVAL '24 hours') AS last_24h,
          COUNT(*) FILTER (WHERE success = true AND sent_at > NOW() - INTERVAL '24 hours') AS sent_24h,
          COUNT(*) FILTER (WHERE error_text LIKE 'dry_run%' AND sent_at > NOW() - INTERVAL '24 hours') AS dryrun_24h,
          COUNT(*) FILTER (WHERE success = false AND error_text NOT LIKE 'dry_run%' AND sent_at > NOW() - INTERVAL '24 hours') AS failed_24h
        FROM notification_log
      `),
      q(`
        SELECT COUNT(*) AS recent
        FROM alert_throttle
        WHERE last_sent_at > NOW() - INTERVAL '1 hour'
      `),
    ]);
    res.json({
      orders: ordersAgg.rows[0],
      messages: msgAgg.rows[0],
      alerts: alertsAgg.rows[0],
      wa: wa.getStatus(),
      now: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/timeline', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 200);
  try {
    const r = await q(`
      SELECT id, order_id, template, channel, target_phone, success, error_text, sent_at
      FROM notification_log
      ORDER BY sent_at DESC
      LIMIT $1
    `, [limit]);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/orders', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  try {
    const r = await q(`
      SELECT order_id, last_status, client_name, client_phone, order_type,
             welcome_sent_at, transit_sent_at, transit_skipped,
             feedback_scheduled_at, feedback_sent_at, feedback_skipped,
             completed_at, last_seen_at, created_at
      FROM order_events
      ORDER BY last_seen_at DESC
      LIMIT $1
    `, [limit]);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/alerts', async (_req, res) => {
  try {
    const r = await q(`
      SELECT reason, order_id, last_sent_at
      FROM alert_throttle
      ORDER BY last_sent_at DESC
      LIMIT 30
    `);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── WhatsApp bridge endpoints (UI control) ─────────────────────────────────

app.get('/api/wa/status', (_req, res) => {
  res.json(wa.getStatus());
});

app.post('/api/wa/qr', async (_req, res) => {
  try {
    const dataUrl = await wa.startAndGetQr();
    res.json({ ok: true, qr_data_url: dataUrl, status: wa.getStatus() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/wa/logout', async (_req, res) => {
  try {
    await wa.logout();
    res.json({ ok: true, status: wa.getStatus() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Static ─────────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`dashboard listening on :${PORT}`);
});
