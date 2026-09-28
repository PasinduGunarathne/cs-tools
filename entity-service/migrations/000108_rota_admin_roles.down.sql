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

-- Only while nobody holds them. user_role.role_id has no ON DELETE CASCADE
-- (000006), so deleting a held role would fail on the foreign key anyway --
-- but failing the whole down step on it is worse than leaving two unused rows
-- behind, and revoking somebody's real grant to let a down path pass would be
-- the wrong trade. Same posture as 000107's own down.
DELETE FROM role r
 WHERE r.name IN ('cre_rota_admin', 'sre_rota_admin')
   AND NOT EXISTS (SELECT 1 FROM user_role ur WHERE ur.role_id = r.id);
