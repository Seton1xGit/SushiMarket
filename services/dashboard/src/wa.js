// WhatsApp bridge поверх whatsapp-web.js.
//
// Состояние:
//   * status: 'disconnected' | 'qr_pending' | 'authenticated' | 'ready' | 'error'
//   * qrDataUrl: PNG-data-url для UI (только пока status=qr_pending)
//
// API:
//   getStatus()           — мгновенный snapshot.
//   startAndGetQr()       — запускает клиент (если не запущен), ждёт QR/готовность, возвращает QR data-url или null если уже ready.
//   sendMessage(phone, text) — отправляет сообщение, возвращает {messageId}.
//   logout()              — разлогинивает и удаляет сессию.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import qrcode from 'qrcode';
import pkg from 'whatsapp-web.js';

const { Client, LocalAuth } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = process.env.WA_SESSION_DIR || '/app/data/wa-session';

let client = null;
let status = 'disconnected';
let qrDataUrl = null;
let lastError = null;
let lastStateChangeAt = new Date().toISOString();

function setStatus(s, err = null) {
  status = s;
  lastError = err;
  lastStateChangeAt = new Date().toISOString();
  console.log(`[wa] status=${s}${err ? ' err=' + err : ''}`);
}

function buildClient() {
  return new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
    puppeteer: {
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-extensions',
        // НЕ используем --single-process / --no-zygote — они ломают
        // puppeteer внутри docker (известный issue).
      ],
      headless: true,
    },
  });
}

async function ensureClient() {
  if (client) {
    console.log('[wa] ensureClient: already exists, status=' + status);
    return client;
  }
  console.log('[wa] ensureClient: building new client, executablePath=' + (process.env.PUPPETEER_EXECUTABLE_PATH || 'auto') + ', sessionDir=' + SESSION_DIR);
  client = buildClient();

  client.on('qr', async (qr) => {
    console.log('[wa] qr event received, len=' + (qr ? qr.length : 0));
    try {
      qrDataUrl = await qrcode.toDataURL(qr, { width: 320, margin: 1 });
      setStatus('qr_pending');
    } catch (e) {
      console.error('[wa] failed to render QR:', e.message);
    }
  });

  client.on('loading_screen', (percent, msg) => {
    console.log(`[wa] loading_screen: ${percent}% — ${msg}`);
  });

  client.on('authenticated', () => {
    console.log('[wa] authenticated event');
    qrDataUrl = null;
    setStatus('authenticated');
  });

  client.on('ready', () => {
    console.log('[wa] ready event');
    qrDataUrl = null;
    setStatus('ready');
  });

  client.on('auth_failure', (msg) => {
    console.error('[wa] auth_failure:', msg);
    setStatus('error', `auth_failure: ${msg}`);
  });

  client.on('disconnected', (reason) => {
    console.error('[wa] disconnected:', reason);
    setStatus('disconnected', `reason: ${reason}`);
    qrDataUrl = null;
    client = null;
  });

  console.log('[wa] calling client.initialize()...');
  try {
    await client.initialize();
    console.log('[wa] client.initialize() resolved');
  } catch (e) {
    console.error('[wa] client.initialize() THREW:', e.stack || e.message);
    setStatus('error', `init_failed: ${e.message}`);
    client = null;
    throw e;
  }
  return client;
}

export function getStatus() {
  return {
    status,
    has_qr: !!qrDataUrl,
    last_state_change_at: lastStateChangeAt,
    last_error: lastError,
    session_dir: SESSION_DIR,
  };
}

export async function startAndGetQr() {
  await ensureClient();
  // Если уже ready — QR не нужен, возвращаем null.
  if (status === 'ready' || status === 'authenticated') return null;
  // Иначе ждём пока появится QR (макс 60 сек — Chromium на холодный
  // старт может тратить 15-30с до подключения к web.whatsapp.com).
  const t0 = Date.now();
  while (!qrDataUrl && status !== 'ready' && Date.now() - t0 < 60_000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`[wa] startAndGetQr: returning, status=${status}, has_qr=${!!qrDataUrl}, waited=${Date.now()-t0}ms`);
  return qrDataUrl;
}

export async function sendMessage(phone, text) {
  if (!client || status !== 'ready') {
    throw new Error(`wa_not_ready (status=${status})`);
  }
  const cleaned = String(phone).replace(/[^0-9]/g, '');
  const chatId = cleaned.includes('@') ? cleaned : `${cleaned}@c.us`;
  const msg = await client.sendMessage(chatId, text);
  return { message_id: msg.id?._serialized || null, to: chatId };
}

export async function logout() {
  if (!client) {
    setStatus('disconnected');
    return;
  }
  try {
    await client.logout();
  } catch (e) {
    console.warn('[wa] logout error (ignored):', e.message);
  }
  try {
    await client.destroy();
  } catch (e) {
    console.warn('[wa] destroy error (ignored):', e.message);
  }
  client = null;
  qrDataUrl = null;
  setStatus('disconnected');
}
