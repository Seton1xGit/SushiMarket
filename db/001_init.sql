-- ============================================================================
-- SushiMarket TR — initial schema
-- Реализует §3.2 DESIGN.md.
-- Идемпотентно (можно прогонять повторно).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- order_events: одна строка на заказ. Агрегирует все этапы жизненного цикла,
-- включая флаги отправки уведомлений (для идемпотентности AC-4).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_events (
    order_id              BIGINT       PRIMARY KEY,
    client_phone          TEXT,
    order_type            SMALLINT,                                       -- 1=delivery (TBD-1)
    last_status           TEXT         NOT NULL,
    last_seen_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at          TIMESTAMPTZ,
    welcome_sent_at       TIMESTAMPTZ,
    transit_sent_at       TIMESTAMPTZ,
    transit_skipped       BOOLEAN      NOT NULL DEFAULT FALSE,
    feedback_scheduled_at TIMESTAMPTZ,
    feedback_sent_at      TIMESTAMPTZ,
    feedback_skipped      BOOLEAN      NOT NULL DEFAULT FALSE,
    escalated_no_phone_at TIMESTAMPTZ,
    raw_listing_snapshot  JSONB,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_events_last_status ON order_events(last_status);
CREATE INDEX IF NOT EXISTS idx_order_events_seen        ON order_events(last_seen_at);

-- ---------------------------------------------------------------------------
-- notification_log: подробный аудит всех исходящих сообщений.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_log (
    id            BIGSERIAL    PRIMARY KEY,
    order_id      BIGINT       NOT NULL,
    template      TEXT         NOT NULL,
    channel       TEXT         NOT NULL DEFAULT 'whatsapp',
    target_phone  TEXT,
    payload       JSONB,
    response      JSONB,
    success       BOOLEAN      NOT NULL,
    error_text    TEXT,
    sent_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_order ON notification_log(order_id, template);

-- ---------------------------------------------------------------------------
-- alert_throttle: анти-флуд для WF-E (одинаковый reason+order_id не чаще
-- ALERT_THROTTLE_MIN минут).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alert_throttle (
    reason        TEXT         NOT NULL,
    order_id      BIGINT       NOT NULL DEFAULT 0,
    last_sent_at  TIMESTAMPTZ  NOT NULL,
    PRIMARY KEY (reason, order_id)
);

-- ---------------------------------------------------------------------------
-- Trigger для автообновления updated_at в order_events.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_events_updated ON order_events;
CREATE TRIGGER trg_order_events_updated
    BEFORE UPDATE ON order_events
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Полезные view для отладки и мониторинга.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_active_orders AS
SELECT *
FROM order_events
WHERE last_status NOT IN ('completed', 'canceled')
  AND last_seen_at > NOW() - INTERVAL '7 days';

CREATE OR REPLACE VIEW v_today_summary AS
SELECT
    DATE(created_at AT TIME ZONE 'Europe/Istanbul') AS day,
    COUNT(*)                                          AS total_orders,
    COUNT(welcome_sent_at)                            AS welcomed,
    COUNT(transit_sent_at)                            AS in_transit_sent,
    COUNT(*) FILTER (WHERE transit_skipped)           AS in_transit_skipped,
    COUNT(feedback_sent_at)                           AS feedback_sent,
    COUNT(*) FILTER (WHERE feedback_skipped)          AS feedback_skipped,
    COUNT(escalated_no_phone_at)                      AS no_phone_escalations
FROM order_events
GROUP BY DATE(created_at AT TIME ZONE 'Europe/Istanbul')
ORDER BY day DESC;
