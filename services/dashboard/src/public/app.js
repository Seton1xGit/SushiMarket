// Dashboard frontend — vanilla JS, polling REST API.

const REFRESH_MS = 5000;

const $ = (sel) => document.querySelector(sel);
const fmt = {
  time(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('ru-RU', { hour12: false });
  },
  short(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString('ru-RU', { hour12: false });
  },
  ago(iso) {
    if (!iso) return '—';
    const sec = (Date.now() - new Date(iso).getTime()) / 1000;
    if (sec < 60) return `${Math.floor(sec)}с`;
    if (sec < 3600) return `${Math.floor(sec / 60)}м`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}ч`;
    return `${Math.floor(sec / 86400)}д`;
  },
};

const waPillColors = {
  ready: 'bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200',
  authenticated: 'bg-yellow-200 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100',
  qr_pending: 'bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  disconnected: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  error: 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200',
};

// ── Theme toggle ───────────────────────────────────────────────────────────

const themeBtn = $('#theme-toggle');
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('theme', t);
}
applyTheme(localStorage.getItem('theme') || 'dark');
themeBtn.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function api(url, opts = {}) {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

function setText(sel, v) { $(sel).textContent = (v ?? '—'); }

// ── Stats ──────────────────────────────────────────────────────────────────

async function refreshStats() {
  try {
    const s = await api('/api/stats');
    setText('#orders-24h', s.orders.last_24h);
    setText('#orders-active', s.orders.active);
    setText('#orders-1h', s.orders.last_1h);
    setText('#msg-24h', s.messages.last_24h);
    setText('#msg-sent', s.messages.sent_24h);
    setText('#msg-dryrun', s.messages.dryrun_24h);
    setText('#msg-failed', s.messages.failed_24h);
    setText('#alerts-1h', s.alerts.recent);
    setText('#wa-status', s.wa.status);
    setText('#now-line', `обновлено ${fmt.short(s.now)}`);

    const pill = $('#wa-pill');
    pill.textContent = `WA: ${s.wa.status}`;
    pill.className = 'pill ' + (waPillColors[s.wa.status] || waPillColors.disconnected);
  } catch (e) {
    setText('#now-line', `ошибка: ${e.message}`);
  }
}

// ── Orders ─────────────────────────────────────────────────────────────────

async function refreshOrders() {
  try {
    const rows = await api('/api/orders?limit=50');
    const tb = $('#orders-tbody');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="8" class="px-4 py-3 text-zinc-500">пусто</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(r => {
      const tickOrSkip = (sentAt, skipped) => skipped ? '<span class="text-zinc-500">skip</span>' : (sentAt ? `<span class="text-green-600 dark:text-green-400">${fmt.ago(sentAt)}</span>` : '<span class="text-zinc-400">—</span>');
      return `<tr class="border-t border-zinc-100 dark:border-zinc-800">
        <td class="px-4 py-2 font-mono">${r.order_id}</td>
        <td class="px-4 py-2">${r.client_name || '—'}<br><span class="text-xs text-zinc-500">${r.client_phone || ''}</span></td>
        <td class="px-4 py-2">${r.order_type === 1 ? 'delivery' : (r.order_type ?? '—')}</td>
        <td class="px-4 py-2"><span class="pill bg-zinc-100 dark:bg-zinc-800">${r.last_status || '—'}</span></td>
        <td class="px-4 py-2">${r.welcome_sent_at ? `<span class="text-green-600 dark:text-green-400">${fmt.ago(r.welcome_sent_at)}</span>` : '<span class="text-zinc-400">—</span>'}</td>
        <td class="px-4 py-2">${tickOrSkip(r.transit_sent_at, r.transit_skipped)}</td>
        <td class="px-4 py-2">${tickOrSkip(r.feedback_sent_at, r.feedback_skipped)}</td>
        <td class="px-4 py-2 text-zinc-500">${fmt.ago(r.last_seen_at)}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    $('#orders-tbody').innerHTML = `<tr><td colspan="8" class="px-4 py-3 text-red-500">${e.message}</td></tr>`;
  }
}

// ── Timeline ───────────────────────────────────────────────────────────────

async function refreshTimeline() {
  try {
    const rows = await api('/api/timeline?limit=30');
    const tb = $('#timeline-tbody');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="6" class="px-4 py-3 text-zinc-500">пусто</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(r => {
      const result = r.success
        ? '<span class="pill bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">ok</span>'
        : (r.error_text && r.error_text.startsWith('dry_run')
            ? '<span class="pill bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">dry_run</span>'
            : '<span class="pill bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">err</span>');
      return `<tr class="border-t border-zinc-100 dark:border-zinc-800">
        <td class="px-4 py-2 text-zinc-500">${fmt.short(r.sent_at)}</td>
        <td class="px-4 py-2 font-mono">${r.order_id || '—'}</td>
        <td class="px-4 py-2">${r.template || '—'}</td>
        <td class="px-4 py-2">${r.channel || '—'}</td>
        <td class="px-4 py-2 font-mono text-xs">${r.target_phone || '—'}</td>
        <td class="px-4 py-2">${result}<br><span class="text-xs text-zinc-500">${r.error_text || ''}</span></td>
      </tr>`;
    }).join('');
  } catch (e) {
    $('#timeline-tbody').innerHTML = `<tr><td colspan="6" class="px-4 py-3 text-red-500">${e.message}</td></tr>`;
  }
}

// ── Alerts ─────────────────────────────────────────────────────────────────

async function refreshAlerts() {
  try {
    const rows = await api('/api/alerts');
    const tb = $('#alerts-tbody');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="3" class="px-4 py-3 text-zinc-500">тишина</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(r => `<tr class="border-t border-zinc-100 dark:border-zinc-800">
      <td class="px-4 py-2 text-zinc-500">${fmt.time(r.last_sent_at)}</td>
      <td class="px-4 py-2"><span class="pill bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">${r.reason}</span></td>
      <td class="px-4 py-2 font-mono">${r.order_id || '—'}</td>
    </tr>`).join('');
  } catch (e) {
    $('#alerts-tbody').innerHTML = `<tr><td colspan="3" class="px-4 py-3 text-red-500">${e.message}</td></tr>`;
  }
}

// ── WhatsApp panel ─────────────────────────────────────────────────────────

const waPanel = $('#wa-panel');
const waBody = $('#wa-panel-body');

$('#wa-connect-btn').addEventListener('click', async () => {
  waPanel.classList.remove('hidden');
  waBody.innerHTML = '<p class="text-zinc-500">Запускаю WhatsApp клиент, ждём QR…</p>';
  try {
    const r = await api('/api/wa/qr', { method: 'POST' });
    renderWa(r);
  } catch (e) {
    waBody.innerHTML = `<p class="text-red-500">${e.message}</p>`;
  }
});

$('#wa-refresh-btn').addEventListener('click', async () => {
  try {
    const status = await api('/api/wa/status');
    if (status.has_qr) {
      const r = await api('/api/wa/qr', { method: 'POST' });
      renderWa(r);
    } else {
      renderWa({ ok: true, status });
    }
  } catch (e) {
    waBody.innerHTML = `<p class="text-red-500">${e.message}</p>`;
  }
});

$('#wa-logout-btn').addEventListener('click', async () => {
  if (!confirm('Отключить аккаунт WhatsApp? Сессию придётся пересканировать заново.')) return;
  try {
    const r = await api('/api/wa/logout', { method: 'POST' });
    renderWa(r);
  } catch (e) {
    waBody.innerHTML = `<p class="text-red-500">${e.message}</p>`;
  }
});

function renderWa(payload) {
  const status = payload.status || {};
  let html = `<p class="mb-3">Статус: <b>${status.status}</b> <span class="text-xs text-zinc-500">${status.last_error || ''}</span></p>`;
  if (payload.qr_data_url) {
    html += `<img src="${payload.qr_data_url}" alt="QR" class="rounded border border-zinc-300 dark:border-zinc-700">`;
    html += `<p class="text-xs text-zinc-500 mt-2">Откройте WhatsApp на телефоне → Настройки → Связанные устройства → Привязать устройство → отсканируйте этот QR.</p>`;
  } else if (status.status === 'ready') {
    html += `<p class="text-green-600 dark:text-green-400">✓ WhatsApp подключён, готов к отправке.</p>`;
  } else if (status.status === 'authenticated') {
    html += `<p class="text-yellow-600 dark:text-yellow-400">Авторизация прошла, ждём готовности…</p>`;
  } else {
    html += `<p class="text-zinc-500">QR не получен. Попробуйте «Обновить».</p>`;
  }
  waBody.innerHTML = html;
}

// ── Loop ───────────────────────────────────────────────────────────────────

async function tick() {
  await Promise.all([refreshStats(), refreshOrders(), refreshTimeline(), refreshAlerts()]);
}
tick();
setInterval(tick, REFRESH_MS);
