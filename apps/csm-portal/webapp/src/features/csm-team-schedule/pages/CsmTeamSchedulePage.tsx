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
import QueryErrorState from "@components/QueryErrorState";
import { useCurrentUser } from "@context/current-user/CurrentUserContext";
import {
  useScheduleAbsences,
  useScheduleAssignments,
  useScheduleCatalogue,
} from "../api/useTeamSchedule";
import DayLadder, { type LadderLane } from "../components/DayLadder";
import MonthRoster from "../components/MonthRoster";
import MyWeekStrip from "../components/MyWeekStrip";
import WeekTable from "../components/WeekTable";
import type { ScheduleAssignment } from "../types";
import { resolveDisplayTimeZone } from "@utils/dateTime";
import { addDays, mondayOf, shiftsByCode, toIsoDate, zoneAbbreviation } from "../utils/rota";
import { zoneColour } from "../utils/rotaHues";
import { SCHEDULE_THEME_VARS } from "../utils/useScheduleTheme";
import "../teamSchedule.css";

type ViewTab = "mine" | "today" | "week" | "roster";
type Family = "CRE" | "SRE";

/** Teams per family, in rota order. Mirrors CSM_TEAM_REGISTRY. */
const TEAMS: Record<Family, string[]> = {
  CRE: ["castor", "draco", "vega", "sirius", "atlas", "phoenix", "rigel", "americas", "migration"],
  SRE: ["apollo", "artemis"],
};

const TITLE: Record<ViewTab, string> = {
  mine: "My week",
  today: "Who is working today",
  week: "Who is working this week",
  roster: "Month roster",
};

const fmtLong = (d: Date): string =>
  d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** Previous/Next moves by whatever the tab is about: a day, a week, a month. */
function stepBy(from: Date, tab: ViewTab, direction: 1 | -1): Date {
  if (tab === "today") return addDays(from, direction);
  if (tab === "roster") {
    const next = new Date(from);
    next.setDate(1);
    next.setMonth(next.getMonth() + direction);
    return next;
  }
  return addDays(from, 7 * direction);
}

const fmtShort = (d: Date): string =>
  d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * Team Schedule: who from CRE and SRE is working, when, and in which
 * escalation tier.
 */
export default function CsmTeamSchedulePage(): JSX.Element {
  const [tab, setTab] = useState<ViewTab>("today");
  const [family, setFamily] = useState<Family>("CRE");
  const [teamKey, setTeamKey] = useState<string>("");
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const { user } = useCurrentUser();
  // The clock this reader is on, and the only source of it: their CSM profile
  // timezone, through the portal's own resolver. Set it there once and every
  // view follows, including after a move from Colombo to San Francisco.
  //
  // There is deliberately no picker on this page. A second control could
  // disagree with the profile, and then two people comparing the same rota
  // over a call have no way of knowing whose clock they are each reading.
  const tz = resolveDisplayTimeZone(user?.timeZone);
  const catalogue = useScheduleCatalogue();

  const weekStart = useMemo(() => mondayOf(anchor), [anchor]);
  const dayView = tab === "today";
  const rosterView = tab === "roster";
  const monthStart = useMemo(
    () => new Date(anchor.getFullYear(), anchor.getMonth(), 1),
    [anchor],
  );
  const monthEnd = useMemo(
    () => new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0),
    [anchor],
  );
  const from = rosterView
    ? toIsoDate(monthStart)
    : dayView
      ? toIsoDate(anchor)
      : toIsoDate(weekStart);
  const to = rosterView
    ? toIsoDate(monthEnd)
    : dayView
      ? toIsoDate(anchor)
      : toIsoDate(addDays(weekStart, 6));
  const teamKeys = teamKey ? [teamKey] : undefined;

  const assignments = useScheduleAssignments({
    from,
    to,
    family,
    teamKeys,
    // Only the day view needs the crew that started last night and is still
    // working this morning; the week groups by rota date, so it does not.
    includeOvernight: dayView,
  });

  // My week is the signed-in engineer's own rota, found by the email the
  // portal knows them by.
  const mine = useScheduleAssignments(
    { from: toIsoDate(weekStart), to: toIsoDate(addDays(weekStart, 6)), userEmail: user?.email ?? "" },
    tab === "mine" && Boolean(user?.email),
  );

  // Off rota follows the CRE/SRE choice like everything else on the page.
  // Without this it showed every absence in the company, so SRE's column
  // carried CRE's migration allocations -- people SRE has no relationship to.
  // The search filters by team, so an unfiltered view passes the family's own
  // teams rather than nothing.
  const absenceTeamKeys = teamKeys ?? TEAMS[family];
  const absences = useScheduleAbsences(
    { from, to, teamKeys: absenceTeamKeys },
    dayView || rosterView,
  );

  const shifts = useMemo(() => shiftsByCode(catalogue.data?.shifts ?? []), [catalogue.data?.shifts]);
  const zones = catalogue.data?.zones ?? [];
  const rows = assignments.data?.assignments ?? [];

  // SRE works in time zones, so its day is a lane per zone. CRE runs on one
  // clock, so it gets one lane.
  const lanes: LadderLane[] = useMemo(() => {
    if (family === "CRE") {
      return [
        { name: "Rotations", sub: "on-call, the night and regular hours", colour: "var(--muted)", assignments: rows },
      ];
    }
    return zones.map((z) => ({
      name: z.code,
      sub: z.label,
      colour: zoneColour(z.code),
      assignments: rows.filter((a) => a.zoneCode === z.code),
      // Escalation on one side, everyone else in the zone on the other.
      layout: "zone" as const,
    }));
  }, [family, rows, zones]);

  if (catalogue.isError) {
    return <QueryErrorState message="Could not load the schedule catalogue." error={catalogue.error} />;
  }

  const busy = catalogue.isLoading || (tab === "mine" ? mine.isLoading : assignments.isLoading);

  return (
    <div className="csm-ts" style={SCHEDULE_THEME_VARS}>
      <div className="wrap">
        <h1>Team Schedule</h1>

        <div className="tabrow">
          <div className="tabs" role="tablist">
            {(["mine", "today", "week", "roster"] as ViewTab[]).map((t) => (
              <button
                key={t}
                className={`tab ${tab === t ? "on" : ""}`}
                role="tab"
                onClick={() => setTab(t)}
              >
                <span className="tl">{TITLE[t]}</span>
                <span className="tsub">
                  {t === "today"
                    ? fmtShort(anchor)
                    : t === "roster"
                      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
                      : `${fmtShort(weekStart)} – ${fmtShort(addDays(weekStart, 6))}`}
                </span>
              </button>
            ))}
          </div>

          <div className="tabright">
            <div className="controls">
              <div className="seg">
                {(["CRE", "SRE"] as Family[]).map((f) => (
                  <button
                    key={f}
                    className={family === f ? "on" : ""}
                    onClick={() => {
                      setFamily(f);
                      setTeamKey("");
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <select
                className="teampick"
                aria-label="Show one team"
                value={teamKey}
                onChange={(e) => setTeamKey(e.target.value)}
              >
                <option value="">All teams</option>
                {TEAMS[family].map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>

              <div className="monthnav">
                <button onClick={() => setAnchor(stepBy(anchor, tab, -1))} title="Previous">
                  &laquo;
                </button>
                <span className="lbl">
                  <b>
                    {dayView
                      ? fmtLong(anchor)
                      : rosterView
                        ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
                        : `${fmtShort(weekStart)} – ${fmtShort(addDays(weekStart, 6))}`}
                  </b>
                </span>
                <button onClick={() => setAnchor(stepBy(anchor, tab, 1))} title="Next">
                  &raquo;
                </button>
              </div>
              <button className="btn" onClick={() => setAnchor(new Date())}>
                Today
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          {assignments.isError ? (
            <QueryErrorState message="Could not load the rota." error={assignments.error} />
          ) : busy ? (
            <div className="offnone">Loading the rota…</div>
          ) : tab === "today" ? (
            <DayLadder
              day={anchor}
              tz={tz}
              zoneLabel={zoneAbbreviation(tz)}
              lanes={lanes}
              shifts={shifts}
              zones={zones}
              absences={absences.data?.absences ?? []}
              absenceKinds={catalogue.data?.absenceKinds ?? []}
            />
          ) : tab === "week" ? (
            <WeekTable weekStart={weekStart} assignments={rows} shifts={shifts} />
          ) : tab === "roster" ? (
            <MonthRoster
              month={monthStart}
              assignments={rows}
              absences={absences.data?.absences ?? []}
              shifts={shifts}
              absenceKinds={catalogue.data?.absenceKinds ?? []}
              scope={`${family} · ${teamKey ? teamKey.charAt(0).toUpperCase() + teamKey.slice(1) : "All teams"}`}
            />
          ) : (
            <MyWeekStrip
              weekStart={weekStart}
              mine={mine.data?.assignments ?? []}
              everyone={rows}
              shifts={shifts}
              tz={tz}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export type { ScheduleAssignment };
