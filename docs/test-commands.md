# Test commands — управление workflow для тестирования

Краткая шпаргалка: что говорить Claude в чате (через slash-команду `/sushi`), какой n8n-эндпоинт за этим стоит, и что нельзя делать без подтверждения.

> Это справочник для людей. Машинная инструкция для Claude — в [.claude/commands/sushi.md](../.claude/commands/sushi.md).

---

## Workflow IDs

| Алиас | Workflow | n8n ID | Тип триггера |
|---|---|---|---|
| `a` / `wf-a` / `detector` | wf-a-detector | `bLhdS9V4FioCdVZI` | **Schedule (15с)** — самозапускается при `active=true` |
| `b` / `wf-b` / `welcome` | wf-b-welcome | `gm8yPsQ0vZA7yNx3` | Execute Workflow (callable) |
| `c` / `wf-c` / `transit` | wf-c-in-transit | `NFKSGYx8koD1V55o` | Execute Workflow (callable) |
| `d` / `wf-d` / `nps` | wf-d-nps | `KeQBljsKESqkPTX3` | Execute Workflow (callable) |
| `e` / `wf-e` / `alerter` | wf-e-alerter | `O9Rt4HG7kDqxBrCv` | Execute Workflow (callable) |
| `rb` / `runner-b` | wf-b-test-runner | `0E5R5Wr7slLbkqtP` | Manual (ручной запуск) |
| `rc` / `runner-c` | wf-c-test-runner | `2hqo9MVxdxwEVmPd` | Manual |
| `rd` / `runner-d` | wf-d-test-runner | `Qr4U9RTRDPwQC7Nj` | Manual |

---

## Команды (через `/sushi`)

| Команда | Что делает | Безопасность |
|---|---|---|
| `/sushi status` | Таблица всех 8 WF с состоянием active/inactive | ✅ только чтение |
| `/sushi on <alias>` | Активирует WF (publish) | ⚠ `on a` запускает реальный polling 24/7 — Claude переспросит |
| `/sushi off <alias>` | Деактивирует WF (unpublish), Schedule стоп | ✅ безопасно |
| `/sushi run <alias>` | Manual execute с ожиданием результата (до 90 с) | ✅ для runner'ов и WF-A — безопасно |
| `/sushi exec <alias> [N]` | Последние N executions (по умолчанию 3) | ✅ только чтение |
| `/sushi inspect <exec_id> [<node>]` | Детали execution или конкретной ноды | ✅ только чтение |
| `/sushi kill <exec_id>` | Удаляет execution (например, спящую WF-D) | ⚠ необратимо, Claude переспросит |
| `/sushi seed <scenario>` | Заполняет БД тестовыми данными | ✅ только тестовые order_id |
| `/sushi cleanup` | Удаляет тестовые строки из БД | ✅ только наши тестовые номера |
| `/sushi db "<SELECT>"` | Произвольный SELECT в БД | ✅ только SELECT |
| `/sushi dryrun on/off` | Переключает константу `dry_run` в Config-нодах | ⚠ off = реальные WA-отправки |
| `/sushi redirect on/off` | Переключает operator-redirect | ⚠ off = клиентам полетят реальные сообщения |

---

## Сценарии для `seed`

| Сценарий | Что заполняется | Для какого теста |
|---|---|---|
| `welcome` | order 64488 → cooking, client_phone, client_name | `/sushi run rb` |
| `transit` | order 64488 → «Курьер в пути» | `/sushi run rc` |
| `nps-within` | order 64488 → completed, completed_at=NOW-119мин (target ≈ NOW+1мин) | `/sushi run rd`, ждать ~60с |
| `nps-late` | order 64488 → completed, completed_at=сегодня 21:30 Istanbul (target=23:30 → пропуск) | `/sushi run rd` (mode='late' в коде runner'а) |
| `closed` | order 99999999 → cooking (синтетика, на API нет) | `/sushi run a` (детектор увидит исчезновение из листинга) |

---

## Типичные потоки

### Тест WF-B (приветствие)
```
/sushi seed welcome
/sushi run rb
/sushi exec b 1
/sushi inspect <id> "Format Welcome"
/sushi cleanup
```

### Тест WF-D (NPS within window)
```
/sushi seed nps-within
/sushi run rd
# ждём ~60 секунд
/sushi exec d 1
/sushi inspect <id> "Format NPS"
/sushi cleanup
```

### Тест WF-A на синтетическом «закрытом» заказе
```
/sushi seed closed
/sushi run a
/sushi exec a 1
/sushi inspect <id> "Update Final"
# проверяем что 99999999 теперь last_status='canceled'
/sushi db "SELECT order_id, last_status FROM order_events WHERE order_id=99999999"
/sushi cleanup
```

### Включить детектор на 5 минут «посмотреть как идёт реальная нагрузка»
```
/sushi on a
# скажешь Claude "наблюдай 5 минут и выключи"
# или вручную через ~5 мин:
/sushi off a
/sushi exec a 10  # посмотреть что было
/sushi cleanup     # если хочешь сбросить тестовые order_id
```

⚠ Реальные order_id, что детектор найдёт за эти 5 минут, **останутся в БД**. Они не помечены как «тест», но тоже не ушли клиентам — сработал operator-redirect (вы получите все сообщения на свой номер).

---

## Что NE делает `/sushi`

- Не редактирует код Code-нод (для этого править JSON в `n8n/workflows/` и `workflow patch`).
- Не меняет credentials.
- Не пушит в git автоматически.
- Не отправляет реальные сообщения клиентам пока operator-redirect включён.

---

## Если что-то пошло не так

1. Сначала **`/sushi off <alias>`** — самое быстрое затыкание.
2. Если не помогло — **`/sushi off a`** (детектор), затем **`/sushi off b`, `c`, `d`** — обрубить всю цепочку.
3. Спящие executions WF-D в Wait-режиме не остановятся `off`-командой — нужно `kill <execution_id>` по списку из `/sushi exec d 20`.
4. Если БД в неконсистентном состоянии — `/sushi db "SELECT ..."` для диагностики, потом руками SQL через psql/Supabase Dashboard.
