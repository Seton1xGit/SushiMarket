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
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
      ],
      headless: true,
    },
  });
}

async function ensureClient() {
  if (client) return client;
  client = buildClient();

  client.on('qr', async (qr) => {
    qrDataUrl = await qrcode.toDataURL(qr, { width: 320, margin: 1 });
    setStatus('qr_pending');
  });

  client.on('authenticated', () => {
    qrDataUrl = null;
    setStatus('authenticated');
  });

  client.on('ready', () => {
    qrDataUrl = null;
    setStatus('ready');
  });

  client.on('auth_failure', (msg) => setStatus('error', `auth_failure: ${msg}`));
  client.on('disconnected', (reason) => {
    setStatus('disconnected', `reason: ${reason}`);
    qrDataUrl = null;
    client = null;
  });

  await client.initialize();
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
  // Иначе ждём пока появится QR (макс 30 сек).
  const t0 = Date.now();
  while (!qrDataUrl && status !== 'ready' && Date.now() - t0 < 30_000) {
    await new Promise((r) => setTimeout(r, 250));
  }
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
