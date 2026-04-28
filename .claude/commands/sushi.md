---
description: SushiMarket TR — операции над workflow в n8n (активация, тесты, БД)
---

# /sushi — управление workflow SushiMarket TR

Аргументы команды передаются в `$ARGUMENTS`. Я (Claude) парсю первый токен как subcommand, остальные — как параметры. Парсинг: split по пробелам.

## WF aliases

| Алиас | Workflow | n8n ID |
|---|---|---|
| `a` / `wf-a` / `detector` | wf-a-detector | `bLhdS9V4FioCdVZI` |
| `b` / `wf-b` / `welcome` | wf-b-welcome | `gm8yPsQ0vZA7yNx3` |
| `c` / `wf-c` / `transit` | wf-c-in-transit | `NFKSGYx8koD1V55o` |
| `d` / `wf-d` / `nps` | wf-d-nps | `KeQBljsKESqkPTX3` |
| `e` / `wf-e` / `alerter` | wf-e-alerter | `O9Rt4HG7kDqxBrCv` |
| `rb` / `runner-b` | wf-b-test-runner | `0E5R5Wr7slLbkqtP` |
| `rc` / `runner-c` | wf-c-test-runner | `2hqo9MVxdxwEVmPd` |
| `rd` / `runner-d` | wf-d-test-runner | `Qr4U9RTRDPwQC7Nj` |

## Subcommand router

### `on <alias>`
Активация workflow (`workflow publish`). Делает workflow callable / запускает Schedule.

⚠ **Для `wf-a`** дополнительно ПРЕДУПРЕДИТЬ: «активация запустит polling реальных заказов каждые 15с. Подтверждаете?». Без явного «да» — не запускать.

### `off <alias>`
Деактивация (`workflow unpublish`). Schedule останавливается мгновенно. Спящие executions (Wait в WF-D) **не убиваются** — доработают по своему графику. Если нужно убить и их — отдельной командой.

### `run <alias>`
Manual execute с `--wait`. Если alias — runner (`rb`/`rc`/`rd`), просто запускаем. Если основной WF (`a`/`b`/`c`/`d`/`e`):
- WF-A — выполняет один цикл polling без активации (безопасно).
- WF-B/C/D — нужен payload. Использовать соответствующий runner вместо.
- WF-E — выполнится с пустым payload (для smoke-теста).

Команда: `n8n-cli workflow execute <ID> --wait --timeout 90` (timeout 90 с — для WF-D с Wait-нодой).

### `status`
Показать таблицу всех 8 WF с их `active` состоянием.
Команда: `n8n-cli workflow list --folder Mpxn58SJCdmP9y14 --project 4P7y04n69k3wJV0z` + форматировать.

### `exec <alias> [N]`
Последние N executions (по умолчанию 3). Показать id, status, mode, duration_ms.
Команда: `n8n-cli execution list --workflow <ID> --limit <N>`.

### `inspect <execution_id> [<node_name>]`
Детали execution. Без node_name — суммарный обзор. С node_name — содержимое конкретной ноды.
Команды:
- без node: `n8n-cli execution get <id> --summarize`
- с node: `n8n-cli execution-data get <id> --node "<name>" --full --max-bytes 3000`

### `kill <execution_id>`
Удалить конкретную execution (например, спящую WF-D). Перед выполнением **показать** execution status и спросить подтверждение. Команда: `n8n-cli execution delete <id>`.

### `seed <scenario>`
Заполнить тестовые данные для сценария. Сценарии:
- `welcome` — order 64488, статус cooking, для теста WF-B (через `runner-b`).
- `transit` — order 64488, статус «Курьер в пути», для WF-C (через `runner-c`).
- `nps-within` — order 64488, completed_at = NOW-119min, для WF-D within-ветки.
- `nps-late` — order 64488, completed_at = today 21:30 Istanbul, для WF-D late-ветки.
- `closed` — order 99999999 (синтетика, не существует на API), статус cooking, для теста order_closed-ветки в WF-A.

Все сценарии используют `INSERT … ON CONFLICT (order_id) DO UPDATE` — повторный seed безопасен.

### `cleanup`
Удалить тестовые строки из БД. Чистит:
- `order_events` где `order_id IN (64488, 99999999, 88888888)` (наши тестовые номера)
- `notification_log` где `order_id IN (...)`
- `alert_throttle` где `reason IN ('zone_not_configured','no_phone','api_error_callcenter','token_expired_callcenter','test')`

Реальные клиентские данные (когда придут) НЕ трогает.

### `db "<SELECT-query>"`
Прочитать что-то из БД (только SELECT, любой DML — отказать). Использовать `psycopg` через локальный python с DSN из `.env`.

### `dryrun on|off`
Переключить флаг `OPERATOR_REDIRECT_PHONE` или `dry_run` константы в Config-нодах WF-B/C/D.

⚠ Опасно: `dryrun off` означает что сообщения пойдут **реально**, и (если редирект ещё включён) — ко мне на номер `79000430011`. Без явного подтверждения «да, я понимаю что делаю» — не выполнять.

### `redirect on|off`
Включить/выключить operator-redirect. `off` = клиентам полетят реальные сообщения. **Отказать без явного «да, переключай в production»** даже если кажется что юзер согласился.

### Если subcommand неизвестен
Показать эту таблицу с описанием.

## Примеры использования

| Что я говорю | Что Claude делает |
|---|---|
| `/sushi status` | таблица 8 WF с active-флагами |
| `/sushi on e` | активирует WF-E |
| `/sushi off d` | деактивирует WF-D |
| `/sushi run rb` | прогоняет wf-b-test-runner |
| `/sushi seed nps-within` | заполняет БД для тест-сценария NPS-within |
| `/sushi run rd` | прогоняет wf-d-test-runner (внутри n8n WF-D ждёт Wait) |
| `/sushi exec d 5` | последние 5 executions WF-D |
| `/sushi inspect 270014 "Format Welcome"` | содержимое ноды Format Welcome в exec 270014 |
| `/sushi kill 270050` | удаляет execution 270050 (спрашивает подтверждение) |
| `/sushi cleanup` | дроп тестовых строк из БД |
| `/sushi db "SELECT count(*) FROM order_events"` | возвращает счётчик |

## После каждой операции

Краткий вывод: что сделано, текущее состояние затронутого WF (если применимо), либо результат запроса. Без длинных простыней — этот командный режим должен ощущаться быстрым.
