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

-- 000007's body, restored verbatim.
--
-- Written out in full for the same reason the up path is: the body is text,
-- so dropping the two names has to be an explicit rewrite. A down migration
-- that only deleted rows and left this function claiming a rota admin is
-- INTERNAL is the exact shape of bug CodeRabbit caught in 000103's own down.
CREATE OR REPLACE FUNCTION recompute_user_type(p_user_id UUID) RETURNS void AS $$
BEGIN
    UPDATE "user"
    SET user_type = (CASE
        WHEN is_system_user THEN 'SYSTEM'
        WHEN EXISTS (
            SELECT 1 FROM user_role ur JOIN role r ON r.id = ur.role_id
            WHERE ur.user_id = p_user_id AND r.name IN ('admin', 'internal')
        ) THEN 'INTERNAL'
        WHEN EXISTS (
            SELECT 1 FROM user_role ur JOIN role r ON r.id = ur.role_id
            WHERE ur.user_id = p_user_id
              AND r.name IN ('external', 'partner', 'customer', 'partner_admin', 'customer_admin')
        ) THEN 'EXTERNAL'
        ELSE 'NOT_AVAILABLE'
    END)::user_type_enum
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Re-derive anyone the up path may have moved, using the restored rules.
--
-- Scoped to holders of the two roles, the mirror of the up backfill's own
-- scope, and re-derived through the whole CASE rather than assumed back to
-- NOT_AVAILABLE: a rota admin who also holds 'internal' is still INTERNAL
-- afterwards, and one who holds 'customer' is EXTERNAL, neither of which a
-- blanket reset would get right.
UPDATE "user" u
   SET user_type = (CASE
        WHEN u.is_system_user THEN 'SYSTEM'
        WHEN EXISTS (SELECT 1 FROM user_role ur JOIN role r ON r.id = ur.role_id
                      WHERE ur.user_id = u.id AND r.name IN ('admin', 'internal')) THEN 'INTERNAL'
        WHEN EXISTS (SELECT 1 FROM user_role ur JOIN role r ON r.id = ur.role_id
                      WHERE ur.user_id = u.id
                        AND r.name IN ('external', 'partner', 'customer', 'partner_admin', 'customer_admin')) THEN 'EXTERNAL'
        ELSE 'NOT_AVAILABLE'
   END)::user_type_enum
 WHERE EXISTS (
       SELECT 1 FROM user_role ur JOIN role r ON r.id = ur.role_id
        WHERE ur.user_id = u.id
          AND r.name IN ('cre_rota_admin', 'sre_rota_admin')
   );
