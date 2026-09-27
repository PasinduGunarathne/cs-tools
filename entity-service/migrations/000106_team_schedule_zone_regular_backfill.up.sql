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

-- Move the zone's ordinary members off its escalation window.
--
-- 000105 gave each zone a regular-hours row and narrowed SRE_TZ1/SRE_TZ2 to
-- the escalation block they were always meant to describe. It corrected the
-- vocabulary but not the rows already written against it: an engineer who
-- works a zone without holding a tier was filed on SRE_TZn, which used to
-- carry the zone's whole working day and now carries only the escalation
-- block. Since 000105 those engineers read as finishing at 13:30 in TZ1 and
-- starting at 13:30 in TZ2 -- the escalation hours, not their own.
--
-- Holding no tier on a zoned escalation window is exactly what "works this
-- zone, is not on the escalation rota" looks like, so tier IS NULL is the
-- whole test. An engineer who does hold L1, L2 or L3 stays where they are.
UPDATE team_schedule_assignment a
SET shift_id = reg.id, updated_on = NOW(), updated_by = 'migration'
FROM team_schedule_shift esc, team_schedule_shift reg
WHERE a.shift_id = esc.id
  AND a.tier IS NULL
  AND esc.code IN ('SRE_TZ1', 'SRE_TZ2', 'SRE_TZ3')
  AND reg.code = esc.code || '_REGULAR'
  AND reg.zone_id = esc.zone_id;

-- The window moved, so the materialised span has to be recomputed -- the same
-- reason 000105 recomputed its own.
UPDATE team_schedule_assignment a
SET starts_at = (a.rota_date::timestamp + make_interval(mins => s.start_minute))
                AT TIME ZONE s.authoring_time_zone,
    ends_at   = (a.rota_date::timestamp + make_interval(mins => s.end_minute))
                AT TIME ZONE s.authoring_time_zone,
    updated_on = NOW(),
    updated_by = 'migration'
FROM team_schedule_shift s
WHERE s.id = a.shift_id
  AND s.code IN ('SRE_TZ1_REGULAR', 'SRE_TZ2_REGULAR', 'SRE_TZ3_REGULAR');
