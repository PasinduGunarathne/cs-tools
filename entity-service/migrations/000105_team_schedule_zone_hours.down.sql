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

-- Put the single zone-less regular window back, and return SRE_TZ1/SRE_TZ2
-- to carrying their zone's working day on the escalation row.
--
-- Going back loses information twice over: three regular windows collapse
-- into one 09:00-18:00 day that belongs to no zone, and the escalation block
-- stops being recorded anywhere at all. That is what the old shape could
-- express, and it is why the up migration exists.

INSERT INTO team_schedule_shift
    (code, label, family, zone_id, tier, day_scope,
     start_minute, end_minute, is_on_call, is_escalation, is_rotation,
     required_headcount, short_code, colour_token, sort_order,
     created_by, updated_by)
SELECT 'SRE_REGULAR', 'Regular hours', 'SRE'::team_schedule_shift_family_enum,
       NULL, NULL, 'WEEKDAY'::team_schedule_day_scope_enum,
       540, 1080, FALSE, FALSE,
       z.is_rotation, z.required_headcount, z.short_code, z.colour_token,
       100, 'migration', 'migration'
FROM team_schedule_shift z
WHERE z.code = 'SRE_TZ1_REGULAR'
ON CONFLICT (code) DO NOTHING;

UPDATE team_schedule_assignment a
SET shift_id = old.id, updated_on = NOW(), updated_by = 'migration'
FROM team_schedule_shift old, team_schedule_shift zoned
WHERE a.shift_id = zoned.id
  AND zoned.code IN ('SRE_TZ1_REGULAR', 'SRE_TZ2_REGULAR', 'SRE_TZ3_REGULAR')
  AND old.code = 'SRE_REGULAR';

DELETE FROM team_schedule_shift
WHERE code IN ('SRE_TZ1_REGULAR', 'SRE_TZ2_REGULAR', 'SRE_TZ3_REGULAR');

UPDATE team_schedule_shift
SET start_minute = 360, end_minute = 900, updated_on = NOW(), updated_by = 'migration'
WHERE code = 'SRE_TZ1';

UPDATE team_schedule_shift
SET start_minute = 720, end_minute = 1260, updated_on = NOW(), updated_by = 'migration'
WHERE code = 'SRE_TZ2';

UPDATE team_schedule_assignment a
SET starts_at = (a.rota_date::timestamp + make_interval(mins => s.start_minute))
                AT TIME ZONE s.authoring_time_zone,
    ends_at   = (a.rota_date::timestamp + make_interval(mins => s.end_minute))
                AT TIME ZONE s.authoring_time_zone,
    updated_on = NOW(),
    updated_by = 'migration'
FROM team_schedule_shift s
WHERE s.id = a.shift_id
  AND s.code IN ('SRE_TZ1', 'SRE_TZ2', 'SRE_REGULAR');
