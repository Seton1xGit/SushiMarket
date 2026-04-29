# Dashboard deployment

Docker-based развёртывание сервиса `dashboard` (мониторинг + WhatsApp bridge).

---

## Что внутри

Один контейнер `sushimarket_dashboard`, поднимается через `docker-compose.yaml` в корне репо.

Сервисы внутри контейнера:
- **Express API + UI** — слушает на `127.0.0.1:8080`. Basic-auth.
- **whatsapp-web.js** — поднимается по запросу (кнопка «Подключить» в UI), сессия персистится в bind-mount `./services/dashboard/data/wa-session/`.

---

## Требования к серверу

- Linux (Ubuntu 22.04+ / Debian 12+ / совместимый).
- Docker Engine 24+ и Docker Compose plugin v2+.
- Открытый egress в интернет (Postgres → Supabase, WhatsApp Web → Meta).
- ~1 GB RAM свободного (Chromium внутри контейнера).
- Доступ к git-репо `https://github.com/Seton1xGit/SushiMarket`.

---

## Развёртывание с нуля

```bash
# 1. Поставить Docker (если ещё нет)
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 2. Клонировать репо
mkdir -p /docker
cd /docker
git clone https://github.com/Seton1xGit/SushiMarket.git sushimarket
cd sushimarket

# 3. Создать .env с актуальными секретами
cp .env.example .env
nano .env
# Заполнить:
#   DATAFOOD_PUBLIC_TOKEN, CALLCENTER_ADMIN_TOKEN  — у разработчика
#   POSTGRES_DSN                                   — у разработчика
#   TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID     — у разработчика
#   DASHBOARD_USER, DASHBOARD_PASS                 — задать (для UI)
#   DASHBOARD_INTERNAL_TOKEN                       — openssl rand -hex 32

# 4. Применить актуальные миграции БД (один раз)
#   Через psql / Supabase SQL Editor выполнить файлы из db/ по порядку:
#     db/001_init.sql
#     db/002_add_client_name.sql
#   (только если ещё не применены)

# 5. Поднять контейнер
docker compose up -d --build

# 6. Проверить
curl -s http://127.0.0.1:8080/health
# → {"ok":true}

docker compose logs -f dashboard
```

---

## Доступ к UI

UI слушает только `127.0.0.1:8080`. Вариантов попасть:

- **SSH-туннель** (быстрый дев-режим):
  ```bash
  ssh -L 8080:127.0.0.1:8080 user@server
  # затем в браузере: http://localhost:8080
  ```

- **Через nginx/Caddy** на сервере, с TLS — когда понадобится домен.

Логин/пароль из `.env` (`DASHBOARD_USER` / `DASHBOARD_PASS`).

---

## Подключение WhatsApp

1. Зайти в UI.
2. Нажать кнопку «Подключить» в карточке WhatsApp.
3. На телефоне открыть WhatsApp → **Настройки → Связанные устройства → Привязать устройство** → отсканировать QR.
4. После сканирования статус сменится на `authenticated`, потом `ready`.
5. Сессия сохраняется в `services/dashboard/data/wa-session/` и переживает рестарты контейнера.

⚠ Ставить желательно на отдельный SIM, не личный.

---

## Обновление

```bash
cd /docker/sushimarket
git pull
docker compose up -d --build
```

Сессия WhatsApp при обновлении сохраняется (bind-mount).

---

## Полная остановка

```bash
docker compose down
```

WhatsApp-сессия в файлах остаётся. Чтобы стереть полностью:

```bash
docker compose down
sudo rm -rf services/dashboard/data
```

---

## Troubleshooting

| Симптом | Причина | Что делать |
|---|---|---|
| `docker compose up` падает на build с ошибкой `npm ci` | нет сети из контейнера на npm registry | проверить egress: `docker run --rm alpine wget -qO- https://registry.npmjs.org/` |
| `/api/stats` отдаёт 500 | проблема с Postgres DSN | `docker compose exec dashboard node -e "import('./src/db.js').then(m=>m.q('SELECT 1').then(console.log))"` |
| WhatsApp QR не появляется | Chromium не стартанул | `docker compose logs dashboard | grep -i chromium` |
| Basic-auth не пускает | пароль с спецсимволами | проверить, что в `.env` пароль не в кавычках, без `\n` |

---

## Безопасность (проверить перед прод-доступом)

- [ ] `.env` не закоммичен (`git status` должен показывать его как ignored).
- [ ] `DASHBOARD_INTERNAL_TOKEN` сгенерирован случайно (не дефолтный `change-me-...`).
- [ ] Порт 8080 биндится только на `127.0.0.1`, не на `0.0.0.0`.
- [ ] Логи в `docker logs` не содержат пароли (basic-auth их не пишет, проверить).
