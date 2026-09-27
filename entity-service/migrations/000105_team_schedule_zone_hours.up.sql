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

-- The SRE day, as the SRE leads actually run it.
--
--             L1 and L2        regular hours
--   TZ1       06:00-13:30      06:00-15:00
--   TZ2       13:30-21:00      12:00-21:00
--   TZ3       21:00-06:00      21:00-06:00
--
-- The catalogue held two of those four columns and was missing the other
-- two, which is the whole of what this migration corrects.

-- What SRE_TZ1 and SRE_TZ2 have carried since 000089 -- 06:00-15:00 and
-- 12:00-21:00 -- are not escalation blocks at all. They are the zones'
-- regular hours, sitting on the row the day view reads as "this zone's
-- escalation window". The working day was recorded correctly all along; it
-- was recorded in the wrong place, and the escalation block was never
-- recorded at all.
--
-- Both zones run L1 and L2 over one block, so each escalation row takes the
-- window its own L1 row already carries. TZ1's ran ninety minutes past its
-- L1 handover; TZ2's opened ninety minutes before its L1 arrived.

UPDATE team_schedule_shift
SET start_minute = 360, end_minute = 810, updated_on = NOW(), updated_by = 'migration'
WHERE code = 'SRE_TZ1';

UPDATE team_schedule_shift
SET start_minute = 810, end_minute = 1260, updated_on = NOW(), updated_by = 'migration'
WHERE code = 'SRE_TZ2';

-- Regular hours then need somewhere of their own to live, per zone.
--
-- SRE_REGULAR carried one window, 09:00-18:00, and no zone -- the zone rode
-- on the assignment instead. That holds only while every zone keeps the same
-- ordinary day, and none of the three does: TZ1 starts at six, TZ2 at
-- midday, TZ3 works the night. One row cannot answer "when are regular
-- hours" three different ways, so the window becomes what distinguishes the
-- rows, which means a row per zone. 09:00-18:00 was never any zone's day.
--
-- Giving each one its zone also brings it under the trigger from 000100: a
-- zone-fixed shift forces the assignment's own zone to agree, so a TZ2
-- engineer can no longer be filed against TZ1's hours without the write
-- failing. The zone-less row could never be checked that way.
--
-- TZ3's regular row holds the same window as its escalation one, and each of
-- the other two overlaps its own. The window is not what separates them: one
-- row is the escalation rota, the other is the rest of the zone, and the day
-- view reads that distinction to decide which column an engineer belongs in.
-- Collapsing them because the hours agree would file engineers who hold no
-- tier under escalation, which is the one thing that column exists to say.
INSERT INTO team_schedule_shift
    (code, label, family, zone_id, tier, day_scope,
     start_minute, end_minute, is_on_call, is_escalation, is_rotation,
     required_headcount, short_code, colour_token, sort_order,
     created_by, updated_by)
SELECT v.code, v.label, 'SRE'::team_schedule_shift_family_enum, z.id, NULL,
       'WEEKDAY'::team_schedule_day_scope_enum,
       v.start_minute, v.end_minute, FALSE, FALSE,
       old.is_rotation, old.required_headcount, old.short_code, old.colour_token,
       v.sort_order, 'migration', 'migration'
FROM (VALUES
    ('SRE_TZ1_REGULAR', 'TZ1 regular hours', 'TZ1',  360,  900, 101),
    ('SRE_TZ2_REGULAR', 'TZ2 regular hours', 'TZ2',  720, 1260, 102),
    ('SRE_TZ3_REGULAR', 'TZ3 regular hours', 'TZ3', 1260, 1800, 103)
) AS v(code, label, zone_code, start_minute, end_minute, sort_order)
JOIN team_schedule_zone z ON z.code = v.zone_code
CROSS JOIN (
    SELECT is_rotation, required_headcount, short_code, colour_token
    FROM team_schedule_shift WHERE code = 'SRE_REGULAR'
) AS old
ON CONFLICT (code) DO NOTHING;

-- Move everyone already filed against the old window onto their own zone's.
-- Anything with no zone stays where it is: there is no way to tell which of
-- the three it belonged to, and guessing would write a shift someone is not
-- on. The DELETE below is guarded, so such a row keeps SRE_REGULAR alive
-- rather than being silently orphaned.
UPDATE team_schedule_assignment a
SET shift_id = zoned.id, updated_on = NOW(), updated_by = 'migration'
FROM team_schedule_shift old, team_schedule_shift zoned
WHERE a.shift_id = old.id
  AND old.code = 'SRE_REGULAR'
  AND a.zone_id IS NOT NULL
  AND zoned.zone_id = a.zone_id
  AND zoned.code IN ('SRE_TZ1_REGULAR', 'SRE_TZ2_REGULAR', 'SRE_TZ3_REGULAR');

-- starts_at/ends_at are materialised from the window at write time, so a
-- corrected window does not reach a row that already exists. Recompute every
-- assignment on a window this migration moved -- the same arithmetic the
-- seed's own _seed_span does, kept here rather than borrowed so the migration
-- does not depend on a dev-only script existing.
UPDATE team_schedule_assignment a
SET starts_at = (a.rota_date::timestamp + make_interval(mins => s.start_minute))
                AT TIME ZONE s.authoring_time_zone,
    ends_at   = (a.rota_date::timestamp + make_interval(mins => s.end_minute))
                AT TIME ZONE s.authoring_time_zone,
    updated_on = NOW(),
    updated_by = 'migration'
FROM team_schedule_shift s
WHERE s.id = a.shift_id
  AND s.code IN ('SRE_TZ1', 'SRE_TZ2',
                 'SRE_TZ1_REGULAR', 'SRE_TZ2_REGULAR', 'SRE_TZ3_REGULAR');

-- Retire the old window, but only once nothing points at it.
DELETE FROM team_schedule_shift s
WHERE s.code = 'SRE_REGULAR'
  AND NOT EXISTS (
      SELECT 1 FROM team_schedule_assignment a WHERE a.shift_id = s.id
  );
