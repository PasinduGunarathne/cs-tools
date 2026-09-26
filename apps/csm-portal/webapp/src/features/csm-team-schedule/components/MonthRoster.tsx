/**
 * Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useMemo, useState, type JSX } from "react";
import type {
  ScheduleAbsence,
  ScheduleAbsenceKind,
  ScheduleAssignment,
  ScheduleShift,
} from "../types";
import { initialsOf, toIsoDate } from "../utils/rota";
import { teamColour } from "../utils/rotaHues";

interface MonthRosterProps {
  month: Date;
  assignments: ScheduleAssignment[];
  absences: ScheduleAbsence[];
  shifts: Map<string, ScheduleShift>;
  absenceKinds: ScheduleAbsenceKind[];
  /** What the page toolbar is currently filtered to, stated so the roster
   *  does not look like it is showing everyone when it is not. */
  scope: string;
}

interface Cell {
  code: string;
  token: string;
  title: string;
}

/**
 * The month as engineers down the side and days across the top -- the shape of
 * the rota sheet this replaces, so a lead reading it recognises it.
 *
 * Each cell is the short code the rest of the page uses, which is the point of
 * storing a short code alongside the label: the roster is only readable if a
 * day fits in a column three characters wide.
 */
export default function MonthRoster({
  month,
  assignments,
  absences,
  shifts,
  absenceKinds,
  scope,
}: MonthRosterProps): JSX.Element {
  const [query, setQuery] = useState("");

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: count }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1));
  }, [month]);

  const kindByCode = useMemo(
    () => new Map(absenceKinds.map((k) => [k.code, k])),
    [absenceKinds],
  );

  /** engineer -> rota date -> what they were doing */
  const grid = useMemo(() => {
    const people = new Map<
      string,
      { name: string; teamKey: string; days: Map<string, Cell> }
    >();

    const seat = (userId: string, name: string, teamKey: string) => {
      let row = people.get(userId);
      if (!row) {
        row = { name, teamKey, days: new Map() };
        people.set(userId, row);
      }
      return row;
    };

    for (const a of assignments) {
      const shift = shifts.get(a.shiftCode);
      const row = seat(a.engineer.userId, a.engineer.name, a.teamKey);
      const existing = row.days.get(a.rotaDate);
      // A tier beats the plain window it sits in: "L1" says more than "TZ1".
      const code = a.tier ?? shift?.shortCode ?? a.shiftCode;
      const token = a.tier ?? shift?.colourToken ?? "";
      if (!existing || a.tier) {
        row.days.set(a.rotaDate, { code, token, title: shift?.label ?? a.shiftCode });
      }
    }

    // Absences win: someone on leave is not on the rota that day, whatever a
    // generated row says.
    for (const ab of absences) {
      const kind = kindByCode.get(ab.kindCode);
      const row = seat(ab.engineer.userId, ab.engineer.name, ab.teamKey);
      const end = ab.endsOn ?? toIsoDate(days[days.length - 1]);
      for (const d of days) {
        const iso = toIsoDate(d);
        if (iso >= ab.startsOn && iso <= end) {
          row.days.set(iso, {
            code: kind?.shortCode ?? ab.kindCode,
            token: kind?.colourToken ?? "",
            title: kind?.label ?? ab.kindCode,
          });
        }
      }
    }

    return [...people.entries()]
      .map(([userId, row]) => ({ userId, ...row }))
      .sort((a, b) => a.teamKey.localeCompare(b.teamKey) || a.name.localeCompare(b.name));
  }, [absences, assignments, days, kindByCode, shifts]);

  const q = query.trim().toLowerCase();
  const rows = q
    ? grid.filter((r) => r.name.toLowerCase().includes(q) || r.teamKey.toLowerCase().includes(q))
    : grid;

  const todayIso = toIsoDate(new Date());

  return (
    <>
      <div className="rosterbar">
        <span className="scope">
          <b>{scope}</b> · {rows.length}
          {rows.length === grid.length ? "" : ` of ${grid.length}`} engineers
        </span>
        <input
          className="rosterq"
          type="search"
          placeholder="Search an engineer or team"
          aria-label="Search an engineer or team"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="twwrap">
        <table className="tw roster">
          <thead>
            <tr>
              <th className="lab">Engineer</th>
              {days.map((d) => {
                const iso = toIsoDate(d);
                const weekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <th
                    key={iso}
                    className={`${weekend ? "wknd" : ""} ${iso === todayIso ? "today" : ""}`}
                  >
                    {d.getDate()}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId}>
                <th className="lab">
                  <span className="nm">
                    <span className="av" style={{ background: teamColour(row.teamKey) }}>
                      {initialsOf(row.name)}
                    </span>
                    <span className="who">{row.name}</span>
                    <span className="team">{row.teamKey}</span>
                  </span>
                </th>
                {days.map((d) => {
                  const iso = toIsoDate(d);
                  const cell = row.days.get(iso);
                  const weekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <td
                      key={iso}
                      className={`${weekend ? "wknd" : ""} ${iso === todayIso ? "today" : ""}`}
                      title={cell ? `${row.name} · ${cell.title}` : undefined}
                    >
                      {cell ? (
                        <span className={`chip sm ${cell.token}`}>{cell.code}</span>
                      ) : (
                        <span className="none">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? <div className="offnone">No engineer matches “{query}”.</div> : null}
    </>
  );
}
