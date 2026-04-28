# Handover — SushiMarket TR

**Назначение документа:** инструкция для передачи проекта другому человеку. Содержит всё, что нужно знать новому владельцу/администратору, чтобы:
1. понять, что делает система,
2. получить или восстановить все доступы,
3. запустить с нуля в своём окружении (n8n, Postgres, Git),
4. поддерживать в работе и реагировать на инциденты.

> Документ **живой** — обновляется по мере изменений в проекте. Дата последнего обновления: 2026-04-28.

---

## 0. О проекте в одном абзаце

Автоматические WhatsApp-уведомления клиентам сети SushiMarket TR (Турция):
1) приветствие при создании заказа,
2) уведомление «курьер в пути» с ETA,
3) NPS-запрос через 2 часа после доставки.

Реализация — n8n workflows, опрашивающие admin-API call-center DataFood и публичный API DataFood, отправляющие сообщения через Meta WhatsApp Cloud API. Состояние хранится в Postgres (Supabase Free).

Полные требования см. [PLAN.md](../PLAN.md), архитектура — [DESIGN.md](../DESIGN.md).

---

## 1. Доступы (checklist для нового владельца)

| Сервис | Что нужно | Где брать |
|--------|-----------|-----------|
| GitHub | доступ к репо `Seton1xGit/SushiMarket` | передаётся как collaborator текущим владельцем (см. §6) |
| n8n | логин на `https://n8n.thefreedom.pro` (email + password) | передаётся текущим владельцем; смотри §3 |
| Supabase | доступ к Postgres-инстансу `SushiMarket` | передаётся как collaborator org `Seton1xGit's Org` или новый владелец заводит свой проект и переносит схему |
| DataFood public API | `DATAFOOD_PUBLIC_TOKEN` (Bearer) | владелец интеграции SushiMarket / DataFood; на 2026-04-27 действует токен `f81833f6-…` |
| Admin-API call-center | `CALLCENTER_ADMIN_TOKEN` (Sanctum personal-access-token) | через DevTools браузера админки `call-center-tr.sushi-market.com` (вкладка Network → любой XHR-запрос → заголовок Authorization). Привязан к учётке, под которой залогинен |
| Meta WhatsApp Cloud API | `META_WA_TOKEN`, `META_PHONE_NUMBER_ID` | Meta Business Suite → WhatsApp → API Setup. На MVP используем тестовый WABA |
| Telegram bot | `TELEGRAM_BOT_TOKEN`, `ADMIN_CHAT_ID` | @BotFather → /newbot для токена; chat_id канала через @userinfobot или getUpdates |

⚠ **Все секреты живут в `.env` (локально) и в credentials n8n (зашифрованы внутри инстанса).** В git они НЕ коммитятся (защищено `.gitignore`).

---

## 2. Git: репозиторий

### 2.1 Где
- URL: **https://github.com/Seton1xGit/SushiMarket**
- Видимость: private (предпочтительно)
- Основная ветка: `main`

### 2.2 Структура

```
SushiMarket/
├── README.md                # верхнеуровневый обзор (создаётся при необходимости)
├── PLAN.md                  # требования (output /sc:brainstorm)
├── DESIGN.md                # архитектурный блюпринт (output /sc:design)
├── CLAUDE.md                # контекст для Claude Code (опционально)
├── .env                     # локальные секреты — НЕ КОММИТИТЬ
├── .env.example             # шаблон env с комментариями (без значений)
├── .gitignore               # исключает .env, *.credentials.json, dump-файлы
├── db/
│   ├── 001_init.sql         # DDL для order_events / notification_log / alert_throttle
│   └── README.md            # как применять миграции
├── docs/
│   └── handover.md          # ← вы читаете этот файл
└── n8n/                     # (опционально) экспорты workflow.json, см. §3.5
```

### 2.3 Как взять проект на новой машине

```bash
git clone https://github.com/Seton1xGit/SushiMarket.git
cd SushiMarket
cp .env.example .env
# заполнить значения в .env (см. §1 за источниками)
```

### 2.4 Передача владения репо

Текущий владелец:
1. Settings → Collaborators → Add people → username нового владельца → role: Admin.
2. После принятия инвайта — Settings → Transfer ownership → ввести `<new-owner>/SushiMarket`.

Альтернатива: новый владелец делает fork и работает у себя.

### 2.5 Правила работы с репо

- Не коммитить `.env` ни при каких обстоятельствах. Перед каждым коммитом запускать `git status` и проверять список.
- Любое изменение workflow в n8n → экспорт JSON в `n8n/workflows/` → коммит (см. §3.5).
- Любое изменение схемы БД → новая миграция `db/00X_<name>.sql` → коммит. Старые миграции не править.
- Коммиты осмысленные, на русском или английском, в любом стиле — но желательно с указанием, какой workflow/таблица меняется.

---

## 3. n8n: workflow runtime

### 3.1 Хостинг

- URL: **https://n8n.thefreedom.pro**
- Версия n8n: см. в UI (нижний-правый угол).
- Доступ: email + password (см. §1).
- Хостинг и обновления — на стороне владельца домена `thefreedom.pro`. Если он перестанет работать или снимут доступ — придётся поднимать свой n8n (рекомендация: Oracle Cloud Always-Free ARM VM + Docker Compose `caddy + n8n + postgres`).

### 3.2 Где живут наши workflow

Personal project `4P7y04n69k3wJV0z` (`miriu2100@yandex.ru`), папка `SushiMarket` (id `Mpxn58SJCdmP9y14`).

| Workflow | ID | Назначение |
|----------|----|------------|
| `wf-a-detector`   | `bLhdS9V4FioCdVZI` | polling каждые 15 c, diff активных заказов, эмиссия событий |
| `wf-b-welcome`    | `gm8yPsQ0vZA7yNx3` | AC-1: приветственное WA на новый заказ |
| `wf-c-in-transit` | `NFKSGYx8koD1V55o` | AC-2: «курьер в пути» с ETA |
| `wf-d-nps`        | `KeQBljsKESqkPTX3` | AC-3: NPS через 2 ч (с ограничением 22:00) |
| `wf-e-alerter`    | `O9Rt4HG7kDqxBrCv` | алерты в Telegram при ошибках/особых кейсах |

URL каждого: `https://n8n.thefreedom.pro/workflow/<id>`.

### 3.3 Credentials в n8n

Все секреты в n8n хранятся под этими именами (workflow ссылаются на них именно так — при импорте на другой инстанс воссоздать с теми же названиями):

| Name | ID (текущего инстанса) | Type | Что внутри |
|------|------------------------|------|------------|
| `cred_callcenter_admin` | `J2VGKR5XEitklRVf` | httpHeaderAuth | Header `Authorization: Bearer <CALLCENTER_ADMIN_TOKEN>` |
| `cred_datafood_public`  | `OvipNoJ83kkncmrA` | httpHeaderAuth | Header `Authorization: Bearer <DATAFOOD_PUBLIC_TOKEN>` |
| `cred_postgres`         | `VCeTigIhYateDNgR` | postgres       | Supabase pooler, `allowUnauthorizedCerts=true` (Supabase pooler даёт self-signed cert chain, который n8n не доверяет по умолчанию) |
| `cred_meta_whatsapp`    | (TBD)              | whatsAppApi или httpHeaderAuth | Bearer от Meta + Phone-Number-ID |
| `cred_telegram_bot`     | `z27hahzThmGfBRup` | telegramApi    | Bot @SushiMarketAlert_bot, chat_id админа `5150596167` |

**Воссоздание на другом инстансе** — см. §3.5.

### 3.4 Экспорт и коммит workflow

После любых изменений в UI n8n — экспорт workflow в JSON и коммит:

1. В UI n8n: правый-верхний угол workflow → меню (три точки) → **Download** → JSON.
2. Положить файл в `n8n/workflows/<name>.json` (имя должно совпадать с workflow в n8n).
3. `git add n8n/workflows/ && git commit -m "Update n8n workflow X" && git push`.

В экспорте credentials указаны **по имени**, а не по ID — это позволяет импортировать workflow на любом инстансе, где созданы credentials с теми же именами (см. §3.3 и §3.5).

### 3.5 Восстановление n8n с нуля

Сценарий: новый владелец поднимает свой n8n, или текущий упал.

1. **Поднять n8n** (свой VPS / Oracle Free Tier / n8n Cloud — без разницы).
2. **Создать в n8n проект и папку** `SushiMarket` (UI: Projects → создать проект → внутри проекта создать папку).
3. **Создать 5 credentials** через UI с именно теми именами (workflow.json ссылается на credentials по имени):
   - `cred_callcenter_admin` — тип **Header Auth**, поля: name=`Authorization`, value=`Bearer <CALLCENTER_ADMIN_TOKEN>`.
   - `cred_datafood_public` — тип **Header Auth**, поля: name=`Authorization`, value=`Bearer <DATAFOOD_PUBLIC_TOKEN>`.
   - `cred_postgres` — тип **Postgres**, поля: host, port=6543, database, user, password, **`Ignore SSL Issues` = ON** (галочка). Поле SSL Mode оставить пустым.

     Почему `Ignore SSL Issues`: Supabase pooler даёт self-signed cert chain, который n8n по умолчанию не доверяет. Без этой галочки коннект падает с `self-signed certificate in certificate chain`.
   - `cred_meta_whatsapp` — по факту наличия Meta WABA.
   - `cred_telegram_bot` — тип **Telegram**, поле Access Token = bot token от @BotFather.
4. **Импортировать 5 workflow**: для каждого `n8n/workflows/*.json` — UI: Workflows → Import from file → выбрать JSON → переместить в папку SushiMarket.
5. **Проверить и активировать workflow по очереди** в порядке §5.

---

## 4. Postgres: state storage

### 4.1 Где сейчас

- **Provider:** Supabase Free
- **Project name:** `SushiMarket`
- **Region:** `eu-west-1` (Ireland)
- **Project ID:** `qtxbwlodudndgtjjeube`
- **DSN (без пароля):** `postgresql://postgres.qtxbwlodudndgtjjeube:<PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`
- **Дашборд:** https://supabase.com/dashboard/project/qtxbwlodudndgtjjeube
- **Версия Postgres:** 17.6

### 4.2 Доступ

Логин в Supabase — email `miriu2100@yandex.ru`. Передача проекта новому владельцу:
- Dashboard → Organization → Members → Invite new member → ввести email нового владельца → role: Owner.
- После принятия инвайта старый владелец может выйти из организации.

Альтернативно: новый владелец заводит **свою** Supabase Free и переносит схему/данные:

```bash
# на старом DSN — снять дамп
pg_dump "<OLD_DSN>" --no-owner --no-acl --schema=public --data-only > data.sql
pg_dump "<OLD_DSN>" --no-owner --no-acl --schema=public --schema-only > schema.sql
# на новом DSN — применить
psql "<NEW_DSN>" -f schema.sql
psql "<NEW_DSN>" -f data.sql
```

После переноса — обновить `POSTGRES_DSN` в локальном `.env` и `cred_postgres` в n8n.

### 4.3 Схема

Текущая структура — см. [db/001_init.sql](../db/001_init.sql). Таблицы:
- `order_events` — одна строка на заказ, агрегирует все события (см. §3.2 [DESIGN.md](../DESIGN.md))
- `notification_log` — аудит исходящих сообщений
- `alert_throttle` — анти-флуд для алертера

Views:
- `v_active_orders` — заказы, не завершённые и не старше 7 дней
- `v_today_summary` — сводка за каждый день в Europe/Istanbul

### 4.4 Применение миграций

Идемпотентно (можно прогонять повторно):

```bash
# через psql
psql "$POSTGRES_DSN" -f db/001_init.sql

# через python (если psql не установлен)
python -c "
import psycopg
from pathlib import Path
import os
dsn = os.environ['POSTGRES_DSN']
sql = Path('db/001_init.sql').read_text(encoding='utf-8')
with psycopg.connect(dsn, autocommit=True) as c:
    with c.cursor() as cur:
        cur.execute(sql)
print('OK')
"
```

### 4.5 Бэкапы

- Supabase Free делает автоматический ежедневный бэкап, хранит 7 дней (Dashboard → Database → Backups).
- На критичные данные — добавить ежедневный `pg_dump` в Telegram-канал админа (опционально, не в MVP).

### 4.6 Замена пароля БД

Если пароль скомпрометирован (попал в чат, скриншот, чужие руки):

1. Supabase Dashboard → Project Settings → Database → **Reset database password**.
2. Обновить `POSTGRES_DSN` в локальном `.env` (с percent-encoding для спецсимволов: `*`→`%2A`, `@`→`%40` и т.д.).
3. В n8n UI: Credentials → `cred_postgres` → обновить поле `password` → Save.
4. Перезапустить активные workflow, чтобы они подхватили новый пароль.

---

## 5. Запуск и эксплуатация

### 5.0 Safety: dry-run и правила активации

**Жёсткое правило (зафиксировано 2026-04-28):**
- Пока бэк целиком не проверен на синтетических данных — **ни один WF не активируется** в n8n.
- Реальные WhatsApp-сообщения клиентам не отправляются: env-флаг `META_DRY_RUN=true` мокает отправку через INSERT в `notification_log`.
- Активация (`workflow publish` или toggle в UI) — только после явного «активируй» от владельца.

Чек перед активацией:
1. Все 5 WF реализованы и протестированы на синтетических order_id.
2. Тест-чеклист §8.8 PLAN.md пройден.
3. Шаблоны Meta одобрены.
4. `META_DRY_RUN` переключён на `false` (на рабочую отправку).
5. Активация по одному WF, начиная с WF-E, в порядке §5.1, с проверкой логов после каждого.

### 5.1 Порядок активации workflow

Активировать **в этом порядке** (зависимости вверх по цепочке):

1. **WF-E (alerter)** — должен работать первым, чтобы остальные могли слать в него ошибки.
2. **WF-A (detector)** — главный polling. Сразу после активации в БД начнут появляться записи в `order_events`.
3. **WF-B (welcome)** — после первого живого заказа должно прийти WA.
4. **WF-C (in-transit)** — проверять, что переход `cooking → courier_delivers_an_order` ловится.
5. **WF-D (nps)** — проверить на тестовом заказе с укороченной задержкой (поменять `NPS_DELAY_HOURS` на 0.05 = 3 минуты, потом вернуть).

### 5.2 Что мониторить

| Сигнал | Где смотреть |
|--------|--------------|
| Polling работает | n8n Executions → wf-a-detector → последний запуск ≤ 30 c назад |
| Новые заказы детектируются | `SELECT MAX(created_at) FROM order_events WHERE created_at > NOW() - INTERVAL '1 hour'` |
| WA-сообщения уходят | `SELECT * FROM notification_log ORDER BY sent_at DESC LIMIT 10` |
| 401 на токены | поиск `Unauthorized` в Executions wf-a-detector |
| Сводка за день | view `v_today_summary` |

### 5.3 Runbook (типичные инциденты)

| Симптом | Вероятная причина | Действие |
|---------|-------------------|----------|
| Telegram приходит «token_expired_callcenter» | истёк/отозван admin-токен call-center | войти в `call-center-tr.sushi-market.com`, вытащить новый токен из DevTools Network → обновить `cred_callcenter_admin` |
| Telegram «token_expired_public» | истёк публичный DataFood-токен | связаться с владельцем интеграции, обновить `cred_datafood_public` |
| Polling зелёный, но новых заказов нет, в час пик | (а) реально нет заказов, (б) сломался листинг call-center, (в) API стенда выпилил `__deprecated`-эндпоинт | проверить вручную: `curl -H "Authorization: Bearer ..." 'https://sushimarket-tr.datafood.tech/call-center/api/orders__deprecated?status=activ&type_select_cities=include'` |
| WA-сообщения не уходят, ошибка `template_rejected` | Meta не одобрила шаблон / шаблон удалили | Meta Business Suite → WhatsApp → Templates → проверить статус |
| Postgres недоступен | Supabase Free auto-pause после 7 дней простоя (у нас polling 24/7, не должно случаться) или платформенная авария | проверить Supabase Status, логи в Dashboard |
| Дублируются WA-сообщения клиентам | сломалась идемпотентность (флаги в БД не пишутся) | проверить, что в `order_events` обновляются `*_sent_at`; смотреть на race condition в WF-A/WF-B |

---

## 6. Передача проекта пошагово

Сценарий «текущий владелец → новый владелец, всё переезжает».

### Шаг 1. GitHub
- Текущий: Settings → Collaborators → Add → новый username → Admin.
- Новый: принять инвайт, склонировать репо.
- (Опционально) Settings → Transfer ownership.

### Шаг 2. Supabase
- Текущий: Org → Members → Invite (email нового) → Owner.
- Новый: создать аккаунт (если нет) → принять инвайт.
- (Альтернатива) новый создаёт свой проект и применяет миграции, см. §4.4. Старый закрывается, `POSTGRES_DSN` обновляется в `.env` и в `cred_postgres`.

### Шаг 3. n8n
Два варианта:

**A. Остаёмся на `n8n.thefreedom.pro`** — текущий владелец передаёт логин (новый email/пароль) или приглашает нового пользователя в свой инстанс (если хостинг позволяет multi-user).

**B. Переезд на свой n8n у нового владельца** — новый поднимает n8n (Oracle Free ARM VM или другой) → §3.6 «Восстановление с нуля».

В обоих случаях новый владелец логинится в UI n8n под своим email/паролем — этого достаточно для работы.

### Шаг 4. DataFood токены
- `DATAFOOD_PUBLIC_TOKEN` — связаться с владельцем интеграции SushiMarket/DataFood, попросить выдать токен на нового пользователя (или сохранить старый).
- `CALLCENTER_ADMIN_TOKEN` — токен привязан к учётке в админке call-center. Новый владелец должен иметь свой логин в `call-center-tr.sushi-market.com`. После входа — забрать свой токен из DevTools Network (см. §1).

### Шаг 5. Meta WhatsApp
- Если используется тестовый WABA — можно пересоздать на новом аккаунте Meta Business.
- Для production — нужна верификация бизнеса в Meta. Вне scope MVP.

### Шаг 6. Telegram
- Новый владелец создаёт своего бота через @BotFather → новый токен.
- Создаёт свой админ-канал, добавляет бота админом, узнаёт chat_id.
- Обновляет `cred_telegram_bot` и `TELEGRAM_ADMIN_CHAT_ID`.

### Шаг 7. Финальная проверка

1. UI n8n: видны все 5 workflow в папке SushiMarket, у каждого корректные credentials (без красных значков).
2. SQL-проверка: `SELECT COUNT(*) FROM order_events;` — возвращает число (0 или больше).
3. Активировать WF-E → выполнить тестовый run (Test workflow в UI) → пришло сообщение в Telegram админ-канал.
4. Активировать WF-A → подождать 30 секунд → проверить, что в `order_events` появляются записи.
5. Дождаться или симулировать переход статуса → должно прийти WA-сообщение клиенту (только если `META_DRY_RUN=false`).

---

## 7. Контакты и эскалация

| Роль | Контакт | Когда писать |
|------|---------|--------------|
| Текущий владелец проекта | (заполнить) | при передаче, при критических вопросах по логике |
| Владелец интеграции DataFood | (заполнить) | при истечении публичного токена, при изменениях API |
| Поддержка n8n.thefreedom.pro | (заполнить) | при недоступности инстанса |
| Supabase support | https://supabase.com/dashboard/support | при платформенных авариях |
| Meta Business support | https://business.facebook.com/business/help | при проблемах с шаблонами или WABA |

---

## 8. История изменений документа

| Дата | Что изменилось |
|------|-----------------|
| 2026-04-28 | Первая версия. Зафиксированы доступы (n8n, Supabase, GitHub), credentials, workflow IDs, runbook. |
| 2026-04-28 | Phase 1 WF-A собран (Schedule 15s → Fetch Listing → Validate → Load Known → Compute Diff). Postgres credential пересоздан с `allowUnauthorizedCerts=true` (новый id `VCeTigIhYateDNgR`) — Supabase pooler не проходит проверку TLS chain в n8n по умолчанию. Manual run #269867 успешен. |
| 2026-04-28 | Sticky-плашки добавлены во все 5 WF (заголовок + что делает простым языком + тех стек). |
| 2026-04-28 | WF-E (Alerter) построен и end-to-end протестирован. Telegram bot @SushiMarketAlert_bot, cred id `z27hahzThmGfBRup`. Проверено: первый запуск отправляет в Telegram + пишет в `alert_throttle` и `notification_log`; повторный запуск в течение 30 мин корректно блокируется throttle'ом. Известные нюансы n8n queryReplacement: (a) при пустой строке последний параметр обрезается — нужен placeholder `'-'`; (b) запятые внутри значения ломают split — заменяем на `;`; (c) `=alert_{{X}}` не склеивает префикс с выражением, нужен явный `{{ 'alert_' + X }}`. |
| 2026-04-28 | WF-A Phase 2: добавлены ветки обработки событий. Switch `Route by Event` → `Insert New Order` (UPSERT) / `Update Status` / `Confirm Closed → Parse Final → Update Final`. Error-output `Fetch Listing` → `Alert Listing Error` (Execute Workflow → WF-E с reason `api_error_callcenter`). Validate Listing теперь делает strip HTML из `Status` (он приходит обёрнутым). Известный нюанс турецкого стенда: `POST /v5/order/status` для несуществующего order_id возвращает HTTP 404 с `{error:{data:'Not found'}}`, а не documented `'canceled'`. Обработано в Parse Final: `body.error → final='canceled'`. Тест order_closed: фейковый order_id=99999999 → 404 → корректно помечен `canceled`. |
| 2026-04-28 | **Safety policy зафиксирована**: никаких тестов на реальных клиентах, никаких активных WF до полной проверки бэка. Введён env-флаг `META_DRY_RUN=true` (по умолчанию). WF-A и WF-E случайно были активированы предыдущим `workflow publish` — деактивированы (`unpublish`). Все 5 WF теперь `active=false`. Активация — только по явному «активируй» от владельца. |
