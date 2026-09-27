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

-- Only while nothing has been recorded against them: kind_id is ON DELETE
-- RESTRICT, and deleting somebody's parental leave to let a down path pass
-- would be the wrong trade.
DELETE FROM team_schedule_absence_kind k
 WHERE k.code IN ('MATERNITY_LEAVE', 'PATERNITY_LEAVE')
   AND NOT EXISTS (SELECT 1 FROM team_schedule_absence a WHERE a.kind_id = k.id);
