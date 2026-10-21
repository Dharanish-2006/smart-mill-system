-- PostgreSQL schema for the Rice Mill Energy & Motor Monitoring portal (PostgreSQL 14+).
--
-- Data flow: SELEC MFM384 meters --Modbus--> industrial IoT gateway --> AWS --> ingestion service
--            --> this database --> REST API (docs/API.md) --> React dashboard.
--
-- Design rules
--  * Store readings exactly as received. There are deliberately NO range CHECK constraints on the
--    measurement columns: implausible values must be kept so the dashboard can flag them as
--    "unexpected meter data". The dashboard validates and shows N/A instead of trusting them.
--  * NULL means "the meter did not provide this value". Never store 0 as a placeholder.
--  * Communication state is recorded separately from the motor state. A failed poll is a row in
--    meter_poll_log / a comm_status other than 'OK'; it must never be turned into "STOPPED".
--  * Energy and runtime are the meter's cumulative registers. Consumption over a period is the
--    difference between registers (see the views below), never a sum of power samples.

CREATE TABLE gateways (
  id            text PRIMARY KEY,                 -- e.g. 'GW-1'
  name          text NOT NULL,
  online        boolean NOT NULL DEFAULT true,    -- last reported state
  last_seen_at  timestamptz                       -- last heartbeat
);

CREATE TABLE sections (
  id        text PRIMARY KEY,                     -- 'S1' .. 'S11'
  sort_no   smallint NOT NULL UNIQUE,
  name      text NOT NULL
);

CREATE TABLE motors (
  id          text PRIMARY KEY,                   -- 'M1' .. 'M15'
  name        text NOT NULL,
  section_id  text NOT NULL REFERENCES sections (id)
);

-- One MFM384 meter per motor, addressed by Modbus slave id behind a gateway.
CREATE TABLE meters (
  motor_id    text PRIMARY KEY REFERENCES motors (id),
  gateway_id  text NOT NULL REFERENCES gateways (id),
  slave_id    smallint NOT NULL CHECK (slave_id BETWEEN 1 AND 247),
  model       text NOT NULL DEFAULT 'SELEC MFM384',
  UNIQUE (gateway_id, slave_id)
);

-- Time-series of successful meter reads. Partitioned by month so old data can be dropped or
-- archived cheaply. Create one partition per month ahead of time (cron / pg_partman).
CREATE TABLE meter_readings (
  motor_id               text        NOT NULL REFERENCES motors (id),
  ts                     timestamptz NOT NULL,     -- time the meter was read (gateway/meter clock, UTC)
  received_at            timestamptz NOT NULL DEFAULT now(),
  avg_current_a          numeric(10,3),
  power_factor           numeric(6,4),
  active_power_kw        numeric(12,4),
  reactive_power_kvar    numeric(12,4),
  apparent_power_kva     numeric(12,4),
  runtime_minutes        numeric(14,2),            -- cumulative
  active_energy_kwh      numeric(16,3),            -- cumulative
  reactive_energy_kvarh  numeric(16,3),            -- cumulative
  apparent_energy_kvah   numeric(16,3),            -- cumulative
  max_demand_kw          numeric(12,4),
  load_factor_pct        numeric(6,2),
  PRIMARY KEY (motor_id, ts)
) PARTITION BY RANGE (ts);

CREATE TABLE meter_readings_default PARTITION OF meter_readings DEFAULT;
-- Example monthly partition:
-- CREATE TABLE meter_readings_2026_10 PARTITION OF meter_readings
--   FOR VALUES FROM ('2026-10-01+05:30') TO ('2026-11-01+05:30');

CREATE INDEX meter_readings_ts_idx ON meter_readings USING brin (ts);

-- Every poll attempt outcome (successes are optional to log; failures are what matter).
-- The latest row per motor drives commStatus / lastPollAt in the live endpoint.
CREATE TABLE meter_poll_log (
  id            bigserial PRIMARY KEY,
  motor_id      text NOT NULL REFERENCES motors (id),
  polled_at     timestamptz NOT NULL,
  comm_status   text NOT NULL CHECK (comm_status IN ('OK', 'TIMEOUT', 'ERROR')),
  message       text
);
CREATE INDEX meter_poll_log_motor_time_idx ON meter_poll_log (motor_id, polled_at DESC);

-- Motor start / stop transitions, derived by the ingestion service from verified readings only.
-- A communication failure does NOT create a STOPPED row.
CREATE TABLE motor_events (
  id        bigserial PRIMARY KEY,
  motor_id  text NOT NULL REFERENCES motors (id),
  ts        timestamptz NOT NULL,
  state     text NOT NULL CHECK (state IN ('RUNNING', 'STOPPED', 'UNKNOWN')),
  message   text
);
CREATE INDEX motor_events_motor_time_idx ON motor_events (motor_id, ts DESC);

-- Alert history shown on the Alerts page ("History" tab).
CREATE TABLE alert_events (
  id           bigserial PRIMARY KEY,
  ts           timestamptz NOT NULL,
  motor_id     text NOT NULL REFERENCES motors (id),
  type         text NOT NULL CHECK (type IN (
                 'MODBUS_FAILURE', 'GATEWAY_OFFLINE', 'STALE_READING', 'UNEXPECTED_DATA',
                 'HIGH_CURRENT', 'HIGH_POWER', 'LOW_POWER_FACTOR', 'STATUS_CHANGE', 'RECOVERED')),
  severity     text NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  description  text NOT NULL
);
CREATE INDEX alert_events_time_idx ON alert_events (ts DESC);
CREATE INDEX alert_events_motor_time_idx ON alert_events (motor_id, ts DESC);

-- ---------------------------------------------------------------------------------------------
-- Views used by the REST API
-- ---------------------------------------------------------------------------------------------

-- Newest successful reading per motor (live endpoint).
CREATE VIEW latest_readings AS
SELECT DISTINCT ON (motor_id) *
FROM meter_readings
ORDER BY motor_id, ts DESC;

-- Daily energy / runtime per motor in plant local time (change the zone if the plant moves).
-- Consumption of a day = difference between that day's last register value and the previous
-- day's last register value. Days with no reading yield no row (never a fake 0).
CREATE VIEW motor_daily_energy AS
WITH day_end AS (
  SELECT motor_id,
         (ts AT TIME ZONE 'Asia/Kolkata')::date AS day,
         max(active_energy_kwh) AS energy_end,
         max(runtime_minutes)   AS runtime_end,
         min(active_energy_kwh) AS energy_start,
         min(runtime_minutes)   AS runtime_start
  FROM meter_readings
  WHERE active_energy_kwh IS NOT NULL
  GROUP BY motor_id, (ts AT TIME ZONE 'Asia/Kolkata')::date
)
SELECT motor_id,
       day,
       energy_end  - COALESCE(lag(energy_end)  OVER w, energy_start)  AS energy_kwh,
       runtime_end - COALESCE(lag(runtime_end) OVER w, runtime_start) AS runtime_minutes
FROM day_end
WINDOW w AS (PARTITION BY motor_id ORDER BY day);

CREATE VIEW motor_monthly_energy AS
SELECT motor_id,
       date_trunc('month', day)::date AS month,
       sum(energy_kwh)       AS energy_kwh,
       sum(runtime_minutes)  AS runtime_minutes,
       count(*)              AS days_covered
FROM motor_daily_energy
GROUP BY motor_id, date_trunc('month', day);

-- ---------------------------------------------------------------------------------------------
-- Seed: the 11 sections and 15 motors from the project specification
-- ---------------------------------------------------------------------------------------------
INSERT INTO sections (id, sort_no, name) VALUES
  ('S1', 1, 'Paddy Receiving & Cleaning'),
  ('S2', 2, 'Paddy Separation'),
  ('S3', 3, 'De-Stoner'),
  ('S4', 4, 'Husking'),
  ('S5', 5, 'Paddy Separation & Polishing'),
  ('S6', 6, 'Grading & Separation'),
  ('S7', 7, 'Broken Separator'),
  ('S8', 8, 'Rice Whitener'),
  ('S9', 9, 'Final Separation'),
  ('S10', 10, 'Rice Silos'),
  ('S11', 11, 'Packing Section');

INSERT INTO motors (id, name, section_id) VALUES
  ('M1',  'Receiving Hopper',          'S1'),
  ('M2',  'Pre-Cleaner',               'S1'),
  ('M3',  'Paddy Separator',           'S2'),
  ('M4',  'De-Stoner',                 'S3'),
  ('M5',  'Rubber Roll Husker',        'S4'),
  ('M6',  'Paddy Separator / Polisher','S5'),
  ('M7',  'Rice Polisher',             'S6'),
  ('M8',  'Vibro Separator',           'S6'),
  ('M9',  'Rice Grader',               'S6'),
  ('M10', 'Broken Rice Separator',     'S7'),
  ('M11', 'Rice Whitener',             'S8'),
  ('M12', 'Color Sorter',              'S9'),
  ('M13', 'Rice Silo 1 (Head Rice)',   'S10'),
  ('M14', 'Rice Silo 2 (Broken Rice)', 'S10'),
  ('M15', 'Rice Packing',              'S11');

-- Gateways and meter slave addresses are site-specific: insert them from the hardware team's
-- commissioning sheet, e.g.
--   INSERT INTO gateways (id, name) VALUES ('GW-1', 'Gateway 1');
--   INSERT INTO meters (motor_id, gateway_id, slave_id) VALUES ('M1', 'GW-1', 1);
