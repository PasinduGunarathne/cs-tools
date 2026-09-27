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

-- Put the zone's ordinary members back on its escalation window, which is
-- where they were before 000106 and where they read the wrong hours.
UPDATE team_schedule_assignment a
SET shift_id = esc.id, updated_on = NOW(), updated_by = 'migration'
FROM team_schedule_shift reg, team_schedule_shift esc
WHERE a.shift_id = reg.id
  AND a.tier IS NULL
  AND reg.code IN ('SRE_TZ1_REGULAR', 'SRE_TZ2_REGULAR', 'SRE_TZ3_REGULAR')
  AND esc.code = replace(reg.code, '_REGULAR', '')
  AND esc.zone_id = reg.zone_id;

UPDATE team_schedule_assignment a
SET starts_at = (a.rota_date::timestamp + make_interval(mins => s.start_minute))
                AT TIME ZONE s.authoring_time_zone,
    ends_at   = (a.rota_date::timestamp + make_interval(mins => s.end_minute))
                AT TIME ZONE s.authoring_time_zone,
    updated_on = NOW(),
    updated_by = 'migration'
FROM team_schedule_shift s
WHERE s.id = a.shift_id
  AND s.code IN ('SRE_TZ1', 'SRE_TZ2', 'SRE_TZ3');
