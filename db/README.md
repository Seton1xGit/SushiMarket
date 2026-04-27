# DB migrations

Миграции применяются по порядку имени (`001_…`, `002_…`).

## Применение

Любым клиентом Postgres. Простой способ — через `psql` (если установлен):

```bash
psql "$POSTGRES_DSN" -f db/001_init.sql
```

Или через Python (используется в проекте):

```python
import psycopg
from pathlib import Path

dsn = "<POSTGRES_DSN из .env>"
sql = Path('db/001_init.sql').read_text(encoding='utf-8')
with psycopg.connect(dsn, autocommit=True) as conn:
    with conn.cursor() as cur:
        cur.execute(sql)
```

Все скрипты идемпотентны (`CREATE TABLE IF NOT EXISTS` / `CREATE OR REPLACE`),
повторный запуск не ломает схему.

## Содержание

- [001_init.sql](001_init.sql) — базовая схема: `order_events`, `notification_log`,
  `alert_throttle`, триггер `set_updated_at`, view `v_active_orders` / `v_today_summary`.
