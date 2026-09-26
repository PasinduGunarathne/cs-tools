-- Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
--
-- WSO2 LLC. licenses this file to you under the Apache License,
-- Version 2.0 (the "License"); you may not use this file except
-- in compliance with the License.
-- You may obtain a copy of the License at
--
-- http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing,
-- software distributed under the License is distributed on an
-- "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
-- KIND, either express or implied.  See the License for the
-- specific language governing permissions and limitations
-- under the License.

-- LOCAL DEVELOPMENT ONLY. Dummy Team Schedule data: the CRE and SRE teams,
-- their engineers, and a rota either side of today so every view has
-- something to show.
--
-- This is a seed, not the allocator. It fills the shape the UI reads -- two
-- L1 and two L2 per zone per day, one of each from both SRE teams; one
-- morning slot, one morning on-call and three evening slots per CRE weekday
-- -- by round-robin over a stable ordering. The real allocator, with leave
-- awareness and swap handling, belongs in entity-service.
--
-- Ids are derived with md5() so re-running changes nothing and a given
-- engineer keeps the same id across rebuilds.
--
-- Everyone not holding a rotation gets a regular-hours row rather than being
-- inferred by subtraction: team_member carries no validity dates, so a
-- derived view of a past day would silently apply today's membership to it.

BEGIN;

-- ── teams ─────────────────────────────────────────────────────────────────
-- headcounts mirror the ABT rota plan the prototype was drawn from
CREATE TEMP TABLE _team (key TEXT, display TEXT, family TEXT, headcount INT, ord INT) ON COMMIT DROP;
INSERT INTO _team VALUES
    ('castor',   'Castor',    'cre-abt', 15,  1),
    ('draco',    'Draco',     'cre-abt', 16,  2),
    ('vega',     'Vega',      'cre-abt', 20,  3),
    ('sirius',   'Sirius',    'cre-abt', 12,  4),
    ('atlas',    'Atlas',     'cre-abt', 12,  5),
    ('phoenix',  'Phoenix',   'cre-abt', 14,  6),
    ('rigel',    'Rigel',     'cre-abt', 11,  7),
    ('americas', 'Americas',  'cre',     12,  8),
    ('migration','Migration', 'cre',     10,  9),
    ('apollo',   'Apollo',    'sre-abt', 18, 10),
    ('artemis',  'Artemis',   'sre-abt', 18, 11);

INSERT INTO team (id, created_on, updated_on, created_by, updated_by, name, type)
SELECT md5('seed-team-'||key)::uuid, now(), now(), 'seed', 'seed', display, family
FROM _team
ON CONFLICT (id) DO NOTHING;

-- ── engineers ─────────────────────────────────────────────────────────────
CREATE TEMP TABLE _eng (id UUID, team_key TEXT, family TEXT, seq INT, is_lead BOOLEAN) ON COMMIT DROP;
INSERT INTO _eng
SELECT md5('seed-eng-'||t.key||'-'||g)::uuid, t.key, t.family, g, (g = 1)
FROM _team t, generate_series(1, t.headcount) g;

INSERT INTO "user" (id, created_on, updated_on, created_by, updated_by,
                    user_name, name, first_name, last_name, email, is_active, is_system_user)
SELECT e.id, now(), now(), 'seed', 'seed',
       e.team_key||'.'||lpad(e.seq::text,2,'0')||'@example.com',
       t.display||' Engineer '||lpad(e.seq::text,2,'0'),
       t.display, 'Engineer '||lpad(e.seq::text,2,'0'),
       e.team_key||'.'||lpad(e.seq::text,2,'0')||'@example.com', TRUE, FALSE
FROM _eng e JOIN _team t ON t.key = e.team_key
ON CONFLICT (id) DO NOTHING;

INSERT INTO team_member (id, created_on, updated_on, created_by, updated_by, team_id, user_id, role)
SELECT md5('seed-tm-'||e.team_key||'-'||e.seq)::uuid, now(), now(), 'seed', 'seed',
       md5('seed-team-'||e.team_key)::uuid, e.id,
       CASE WHEN e.is_lead THEN 'lead' ELSE 'member' END
FROM _eng e
ON CONFLICT (id) DO NOTHING;

-- ── the window we roster ──────────────────────────────────────────────────
-- three weeks back and three weeks forward, so "my week", "this week" and
-- "next rotation" all have data whenever the stack is brought up
CREATE TEMP TABLE _day (d DATE, dow INT, is_weekend BOOLEAN, n INT) ON COMMIT DROP;
INSERT INTO _day
SELECT g::date, EXTRACT(isodow FROM g)::int, EXTRACT(isodow FROM g)::int > 5,
       (g::date - (CURRENT_DATE - 21))::int
FROM generate_series(CURRENT_DATE - 21, CURRENT_DATE + 21, interval '1 day') g;

DELETE FROM schedule_assignment WHERE created_by = 'seed';
DELETE FROM schedule_absence   WHERE created_by = 'seed';

-- resolve a window on a date, in the clock it was authored in
CREATE OR REPLACE FUNCTION _seed_span(p_day DATE, p_code TEXT)
RETURNS TABLE (shift_id UUID, zone_id UUID, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ)
LANGUAGE sql STABLE AS $$
  SELECT s.id, s.zone_id,
         (p_day::timestamp + make_interval(mins => s.start_minute)) AT TIME ZONE s.authoring_time_zone,
         (p_day::timestamp + make_interval(mins => s.end_minute))   AT TIME ZONE s.authoring_time_zone
  FROM schedule_shift s WHERE s.code = p_code;
$$;

-- ── CRE: the ABT rotations ────────────────────────────────────────────────
-- one morning, one morning on-call and three evening slots each weekday,
-- rotating through the ABT engineers in a stable order
CREATE TEMP TABLE _abt (id UUID, team_key TEXT, rn INT, total INT) ON COMMIT DROP;
INSERT INTO _abt
SELECT e.id, e.team_key,
       (row_number() OVER (ORDER BY t.ord, e.seq))::int,
       (count(*) OVER ())::int
FROM _eng e JOIN _team t ON t.key = e.team_key
WHERE e.family = 'cre-abt';

INSERT INTO schedule_assignment
  (user_id, team_id, team_key, shift_id, zone_id, tier, rota_date, starts_at, ends_at, is_on_call, source, created_by, updated_by)
SELECT a.id, md5('seed-team-'||a.team_key)::uuid, a.team_key, sp.shift_id, sp.zone_id, NULL,
       d.d, sp.starts_at, sp.ends_at, v.code = 'CRE_MORNING_OC', 'GENERATED', 'seed', 'seed'
FROM _day d
CROSS JOIN (VALUES ('CRE_MORNING',0),('CRE_MORNING_OC',1),('CRE_EVENING',2),('CRE_EVENING',3),('CRE_EVENING',4)) AS v(code, slot)
JOIN _abt a ON a.rn = ((d.n * 5 + v.slot) % a.total) + 1
CROSS JOIN LATERAL _seed_span(d.d, v.code) sp
WHERE NOT d.is_weekend
ON CONFLICT DO NOTHING;

-- the weekend rotation: three ABT engineers a day
INSERT INTO schedule_assignment
  (user_id, team_id, team_key, shift_id, zone_id, tier, rota_date, starts_at, ends_at, is_on_call, source, created_by, updated_by)
SELECT a.id, md5('seed-team-'||a.team_key)::uuid, a.team_key, sp.shift_id, sp.zone_id, NULL,
       d.d, sp.starts_at, sp.ends_at, FALSE, 'GENERATED', 'seed', 'seed'
FROM _day d
CROSS JOIN generate_series(0,2) AS slot
JOIN _abt a ON a.rn = ((d.n * 3 + slot) % a.total) + 1
CROSS JOIN LATERAL _seed_span(d.d, 'CRE_WEEKEND') sp
WHERE d.is_weekend
ON CONFLICT DO NOTHING;

-- Americas cover the night, every day
INSERT INTO schedule_assignment
  (user_id, team_id, team_key, shift_id, zone_id, tier, rota_date, starts_at, ends_at, is_on_call, source, created_by, updated_by)
SELECT e.id, md5('seed-team-americas')::uuid, 'americas', sp.shift_id, sp.zone_id, NULL,
       d.d, sp.starts_at, sp.ends_at, FALSE, 'GENERATED', 'seed', 'seed'
FROM _day d
JOIN _eng e ON e.team_key = 'americas'
CROSS JOIN LATERAL _seed_span(d.d, 'CRE_AMERICAS') sp
ON CONFLICT DO NOTHING;

-- ── SRE: two L1 and two L2 per zone per weekday, one of each per team ─────
CREATE TEMP TABLE _sre (id UUID, team_key TEXT, rn INT, total INT) ON COMMIT DROP;
INSERT INTO _sre
SELECT e.id, e.team_key,
       (row_number() OVER (PARTITION BY e.team_key ORDER BY e.seq))::int,
       (count(*) OVER (PARTITION BY e.team_key))::int
FROM _eng e WHERE e.family = 'sre-abt';

INSERT INTO schedule_assignment
  (user_id, team_id, team_key, shift_id, zone_id, tier, rota_date, starts_at, ends_at, is_on_call, source, created_by, updated_by)
SELECT s.id, md5('seed-team-'||s.team_key)::uuid, s.team_key, sp.shift_id, sp.zone_id,
       v.tier::schedule_tier_enum, d.d, sp.starts_at, sp.ends_at, FALSE, 'GENERATED', 'seed', 'seed'
FROM _day d
CROSS JOIN (VALUES
      ('SRE_TZ1_L1','L1',0), ('SRE_TZ1','L2',1),
      ('SRE_TZ2_L1','L1',2), ('SRE_TZ2','L2',3),
      ('SRE_TZ3',   'L1',4), ('SRE_TZ3','L2',5)
  ) AS v(code, tier, slot)
CROSS JOIN (VALUES ('apollo'),('artemis')) AS tm(team_key)
JOIN _sre s ON s.team_key = tm.team_key AND s.rn = ((d.n * 6 + v.slot) % s.total) + 1
CROSS JOIN LATERAL _seed_span(d.d, v.code) sp
WHERE NOT d.is_weekend
ON CONFLICT DO NOTHING;

-- the weekend runs two zones, one crew each
INSERT INTO schedule_assignment
  (user_id, team_id, team_key, shift_id, zone_id, tier, rota_date, starts_at, ends_at, is_on_call, source, created_by, updated_by)
SELECT s.id, md5('seed-team-'||s.team_key)::uuid, s.team_key, sp.shift_id, sp.zone_id,
       'L1'::schedule_tier_enum, d.d, sp.starts_at, sp.ends_at, FALSE, 'GENERATED', 'seed', 'seed'
FROM _day d
CROSS JOIN (VALUES ('SRE_WE_TZ1',0),('SRE_WE_TZ2',1)) AS v(code, slot)
CROSS JOIN (VALUES ('apollo'),('artemis')) AS tm(team_key)
JOIN _sre s ON s.team_key = tm.team_key AND s.rn = ((d.n * 2 + v.slot) % s.total) + 1
CROSS JOIN LATERAL _seed_span(d.d, v.code) sp
WHERE d.is_weekend
ON CONFLICT DO NOTHING;

-- ── leave and allocations ─────────────────────────────────────────────────
-- a few ranges, plus one standing allocation with no end date
INSERT INTO schedule_absence (user_id, team_key, kind_id, starts_on, ends_on, note, created_by, updated_by)
SELECT e.id, e.team_key, k.id,
       CURRENT_DATE + ((e.seq % 11) - 4), CURRENT_DATE + ((e.seq % 11) - 4) + 3,
       'seeded leave', 'seed', 'seed'
FROM _eng e
JOIN schedule_absence_kind k ON k.code = CASE WHEN e.seq % 2 = 0 THEN 'ANNUAL_LEAVE' ELSE 'LIEU_LEAVE' END
WHERE e.seq IN (4, 9);

-- Standing allocations, and the two groups do not draw from the same list.
-- CRE carries migration work; SRE does not -- an SRE engineer is either on
-- R&D or sitting with a customer, on site or off. Seeding migration against
-- SRE would put a category in their off-rota column that does not exist for
-- them.
INSERT INTO schedule_absence (user_id, team_key, kind_id, starts_on, ends_on, note, created_by, updated_by)
SELECT e.id, e.team_key, k.id, CURRENT_DATE - 60, NULL, 'standing allocation', 'seed', 'seed'
FROM _eng e
JOIN schedule_absence_kind k
  ON k.code = CASE
       WHEN e.family = 'sre-abt' THEN
         CASE e.seq WHEN 5 THEN 'RND'
                    WHEN 6 THEN 'CUSTOMER_ONSITE'
                    ELSE 'CUSTOMER_OFFSITE' END
       ELSE
         CASE e.seq WHEN 5 THEN 'RND'
                    WHEN 6 THEN 'CUSTOMER'
                    ELSE 'MIGRATION' END
     END
WHERE e.seq IN (5, 6, 7);

-- ── everyone else works regular hours ─────────────────────────────────────
-- stored, not derived: see the note at the top
INSERT INTO schedule_assignment
  (user_id, team_id, team_key, shift_id, zone_id, tier, rota_date, starts_at, ends_at, is_on_call, source, created_by, updated_by)
SELECT e.id, md5('seed-team-'||e.team_key)::uuid, e.team_key, sp.shift_id,
       -- SRE regular hours carry a zone of their own: the window has none (every
       -- zone keeps the same 09:00-18:00), but the engineer still belongs to one
       -- that day, and that is what the "others in TZ" card groups by
       CASE WHEN e.family = 'sre-abt' THEN z.id ELSE sp.zone_id END, NULL,
       d.d, sp.starts_at, sp.ends_at, FALSE, 'GENERATED', 'seed', 'seed'
FROM _day d
JOIN _eng e ON TRUE
CROSS JOIN LATERAL _seed_span(d.d, CASE WHEN e.family = 'sre-abt' THEN 'SRE_REGULAR' ELSE 'CRE_REGULAR' END) sp
LEFT JOIN LATERAL (
    SELECT id FROM schedule_zone
    WHERE e.family = 'sre-abt'
    ORDER BY sort_order OFFSET ((e.seq + d.n) % 3) LIMIT 1
) z ON TRUE
WHERE NOT d.is_weekend
  AND e.team_key <> 'americas'
  AND NOT EXISTS (SELECT 1 FROM schedule_assignment a
                   WHERE a.user_id = e.id AND a.rota_date = d.d AND a.created_by = 'seed')
ON CONFLICT DO NOTHING;

DROP FUNCTION IF EXISTS _seed_span(DATE, TEXT);

COMMIT;
