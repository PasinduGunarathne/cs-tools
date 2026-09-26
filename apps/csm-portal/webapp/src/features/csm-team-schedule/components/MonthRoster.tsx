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

import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type {
  ScheduleAbsence,
  ScheduleAbsenceKind,
  ScheduleAssignment,
  ScheduleShift,
} from "../types";
import { initialsOf, isRotationShift, toIsoDate } from "../utils/rota";
import { teamColour } from "../utils/rotaHues";

interface MonthRosterProps {
  month: Date;
  assignments: ScheduleAssignment[];
  absences: ScheduleAbsence[];
  shifts: Map<string, ScheduleShift>;
  absenceKinds: ScheduleAbsenceKind[];
  /** The day the date picker is sitting on, as YYYY-MM-DD.
   *
   *  Distinct from today: today is a fact, this is a choice. The roster is a
   *  month wide, so a choice the grid does not show is a choice the reader
   *  cannot see they made. */
  selectedIso: string;
  /** The group and team the page is filtered to, and the means to change them.
   *
   *  The prototype puts these in the card's own head rather than only in the
   *  page toolbar, and it is right to: the roster is the view where "which
   *  engineers am I looking at" is the whole question, so the answer belongs
   *  where the answer is read. They are the page's own state passed down, not
   *  a second copy -- one control rendered in two places, which is why the
   *  toolbar above stays in step with them. */
  family: "CRE" | "SRE";
  onFamilyChange: (family: "CRE" | "SRE") => void;
  teamKey: string;
  onTeamKeyChange: (teamKey: string) => void;
  teams: string[];
}

interface Cell {
  code: string;
  token: string;
  title: string;
  /** A turn on the rota, as opposed to leave, an allocation, or the standing
   *  regular-hours window that most of the team sits in on a normal day. */
  isRotation: boolean;
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
  selectedIso,
  family,
  onFamilyChange,
  teamKey,
  onTeamKeyChange,
  teams,
}: MonthRosterProps): JSX.Element {
  const [query, setQuery] = useState("");
  /** Fade everything that is not a turn on the rota.
   *
   *  A month of 122 engineers is mostly leave and allocations by volume, and
   *  they are the same size and weight as the rota chips, so "who is actually
   *  on next Tuesday" is a hard question to read off the grid. This does not
   *  filter -- the cells stay where they are, so the shape of the month does
   *  not change under the reader; they simply stop competing. */
  const [rotationsOnly, setRotationsOnly] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const touched = useRef(false);

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
      // The helper reads the shift's code; when the catalogue has not got the
      // shift we still hold that code on the assignment, so fall back to it
      // rather than calling a real rota turn something else.
      const isRotation = shift ? isRotationShift(shift) : !a.shiftCode.includes("REGULAR");
      if (!existing || a.tier) {
        row.days.set(a.rotaDate, { code, token, title: shift?.label ?? a.shiftCode, isRotation });
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
            isRotation: false,
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

  /** The month as a stable key: the Date itself is a fresh object each render. */
  const monthIso = toIsoDate(days[0]);

  // Open on today, the way the day view opens on the current hour. A month is
  // thirty-odd columns and only a third of them fit, so landing on the 1st
  // means every reader starts by scrolling to where they already were.
  //
  // Today is what they asked for, but it is not always on screen to give: the
  // roster follows the date picker, so in any other month the picked day is
  // the thing they just chose and the honest place to open.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // A new month is a new question, so it re-centres even if they scrolled
    // the last one. Within a month their scroll position is theirs.
    touched.current = false;
    const go = (): void => {
      if (touched.current) return;
      const target =
        el.querySelector<HTMLElement>("thead th.day.today") ??
        el.querySelector<HTMLElement>("thead th.day.sel");
      if (!target) return;
      // The engineer column is sticky, so it covers the left of the scroller;
      // anything parked under it is parked out of sight.
      const nameWidth = el.querySelector<HTMLElement>("thead th.lab")?.offsetWidth ?? 0;
      const inset = Math.round((el.clientWidth - nameWidth) * 0.25);
      const delta = target.getBoundingClientRect().left - el.getBoundingClientRect().left;
      el.scrollLeft = Math.max(0, el.scrollLeft + delta - nameWidth - inset);
    };
    go();
    // Once more after the grid has settled: on the first paint the columns
    // have not been laid out yet and every offset reads zero.
    const t = window.setTimeout(go, 120);
    return () => window.clearTimeout(t);
  }, [monthIso, selectedIso]);

  return (
    <>
      <div className="card-head">
        <div className="seg teamseg" role="tablist" aria-label="Show CRE or SRE">
          {(["CRE", "SRE"] as const).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={family === f}
              className={family === f ? "on" : ""}
              onClick={() => onFamilyChange(f)}
            >
              {f}
            </button>
          ))}
        </div>

        <h2>
          Roster <span className="count">{rows.length}</span>
        </h2>

        <div className="tools">
          <label className="rq">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              type="search"
              placeholder="Find an engineer"
              autoComplete="off"
              aria-label="Find an engineer"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query ? (
              <button type="button" className="rqx" aria-label="Clear" onClick={() => setQuery("")}>
                &times;
              </button>
            ) : null}
          </label>

          <select
            className="teampick"
            aria-label="Show one team"
            value={teamKey}
            onChange={(e) => onTeamKeyChange(e.target.value)}
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>

          <label className="rotonly" title="Fade leave and allocations">
            <input
              type="checkbox"
              checked={rotationsOnly}
              onChange={(e) => setRotationsOnly(e.target.checked)}
            />
            Rotations only
          </label>
        </div>
      </div>

      {/* The card's one scroller. Both axes live here, which is what lets the
          date row and the engineer column stay pinned to the grid they label
          instead of to the page. */}
      <div className="twwrap rostwrap" ref={wrapRef} onScroll={() => (touched.current = true)}>
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
                    className={`day ${weekend ? "wknd" : ""} ${iso === todayIso ? "today" : ""} ${
                      iso === selectedIso ? "sel" : ""
                    }`}
                    aria-current={iso === selectedIso ? "date" : undefined}
                  >
                    <span className="d">{d.getDate()}</span>
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
                      className={`${weekend ? "wknd" : ""} ${iso === todayIso ? "today" : ""} ${
                        iso === selectedIso ? "sel" : ""
                      } ${rotationsOnly && cell && !cell.isRotation ? "muted" : ""}`}
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
