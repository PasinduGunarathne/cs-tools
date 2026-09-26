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

import { useMemo, type JSX } from "react";
import type { ScheduleAssignment, ScheduleShift } from "../types";
import { addDays, groupBy, initialsOf, shortDayName, toIsoDate } from "../utils/rota";
import { teamColour } from "../utils/rotaHues";

interface WeekTableProps {
  weekStart: Date;
  assignments: ScheduleAssignment[];
  shifts: Map<string, ScheduleShift>;
}

/** Minutes past the authoring midnight as HH:MM, wrapping past 24h. */
function fmtMinute(m: number): string {
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * The week as rotations down the side and days across the top.
 *
 * The time column carries each rotation's window once. Repeating it against
 * every name -- which the first draft of the prototype did -- tells the reader
 * nothing they have not already read on the left.
 */
export default function WeekTable({ weekStart, assignments, shifts }: WeekTableProps): JSX.Element {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const rows = useMemo(() => {
    const byShift = groupBy(assignments, (a) => a.shiftCode);
    return [...byShift.entries()]
      .map(([code, list]) => ({ code, shift: shifts.get(code), list }))
      .sort((a, b) => (a.shift?.sortOrder ?? 999) - (b.shift?.sortOrder ?? 999));
  }, [assignments, shifts]);

  const todayIso = toIsoDate(new Date());

  if (rows.length === 0) {
    return <div className="offnone">Nobody is on the rota this week.</div>;
  }

  return (
    <div className="twwrap">
      <table className="tw">
        <thead>
          <tr>
            <th className="lab">Time</th>
            {days.map((d) => {
              const iso = toIsoDate(d);
              const weekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <th key={iso} className={`${weekend ? "wknd" : ""} ${iso === todayIso ? "today" : ""}`}>
                  {shortDayName(d)} <small>{d.getDate()}</small>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ code, shift, list }) => {
            const byDay = groupBy(list, (a) => a.rotaDate);
            const token = shift?.colourToken ?? "";
            return (
              <tr
                key={code}
                className="hued"
                style={{ ["--rc" as string]: `var(--${token.toLowerCase()}-fg, var(--faint))` }}
              >
                <th className="lab">
                  <span className={`chip sm ${token}`}>
                    {shift ? `${fmtMinute(shift.startMinute)} – ${fmtMinute(shift.endMinute)}` : code}
                  </span>
                  <small>{shift?.label ?? code}</small>
                </th>
                {days.map((d) => {
                  const iso = toIsoDate(d);
                  const cell = byDay.get(iso) ?? [];
                  const weekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <td
                      key={iso}
                      className={`${weekend ? "wknd" : ""} ${iso === todayIso ? "today" : ""}`}
                    >
                      {cell.length === 0 ? (
                        <span className="none">—</span>
                      ) : (
                        cell.slice(0, 6).map((a) => (
                          <div className="nm" key={a.id} title={`${a.engineer.name} · ${a.teamKey}`}>
                            <span className="av" style={{ background: teamColour(a.teamKey) }}>{initialsOf(a.engineer.name)}</span>
                            <span className="who">{a.engineer.name}</span>
                            {a.tier ? <span className="tier-t">{a.tier}</span> : null}
                            <span className="team">{a.teamKey}</span>
                          </div>
                        ))
                      )}
                      {cell.length > 6 ? <span className="lmore">+{cell.length - 6} more</span> : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
