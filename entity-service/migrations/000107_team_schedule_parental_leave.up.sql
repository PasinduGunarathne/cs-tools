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

-- Maternity and paternity leave, beside annual and lieu leave.
--
-- They are leave like any other -- whole days out of the rota, marked by a
-- lead -- but long, planned well ahead, and not a lead's to question, so they
-- are worth telling apart from a fortnight of annual leave at a glance. Kinds
-- are rows (000090), so this is two inserts and no schema change. Each has a
-- colour of its own; the stylesheet defines MAT and PAT. Short codes ML and
-- PL are the ones both rota sheets use.
--
-- Numbered after 000103's table rename, and written against the new names,
-- on purpose. The runner applies any file it has not recorded, in basename
-- order, so a file numbered before 000103 that arrives after a database has
-- already taken 000103 runs against tables that no longer exist under the
-- names it uses, and fails the whole migrate step.
INSERT INTO team_schedule_absence_kind (code, short_code, label, bucket, colour_token, sort_order, created_by, updated_by)
VALUES
    ('MATERNITY_LEAVE', 'ML',  'Maternity leave', 'LEAVE', 'MAT', 21, 'migration', 'migration'),
    ('PATERNITY_LEAVE', 'PL',  'Paternity leave', 'LEAVE', 'PAT', 22, 'migration', 'migration')
ON CONFLICT (code) DO NOTHING;
