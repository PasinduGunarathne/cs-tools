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

/**
 * The rotation hues, lifted from the reviewed prototype.
 *
 * Two sets, because a colour that reads on white is not the colour that reads
 * on near-black -- the prototype tuned each pair by eye. Which set applies is
 * decided by the portal's own palette mode, never by the operating system:
 * following `prefers-color-scheme` here is what left pale-on-white labels when
 * the OS was dark and the portal was light.
 *
 * These stay fixed across the portal's themes. They are identity colours -- the
 * evening shift, TZ2, annual leave -- in the way a calendar's categories are,
 * and tinting them per theme would mean two people looking at the same rota saw
 * the same rotation in different colours.
 */
export const ROTA_HUES_LIGHT: Record<string, string> = {
  "--al-bg": "#9a1b1b",
  "--al-fg": "#ffffff",
  "--am-bg": "#d9e8f8",
  "--am-fg": "#22508a",
  "--br-bg": "#a6d094",
  "--br-fg": "#1e4a1a",
  "--crit": "#c9302c",
  "--exc-bg": "#e98a2b",
  "--exc-fg": "#ffffff",
  "--ext-bg": "#4f86c6",
  "--ext-fg": "#ffffff",
  "--focus": "0 0 0 3px rgba(63,91,217,.28)",
  "--hero-oc": "#4a3aa8",
  "--hero-oc-2": "#6a54cf",
  "--hero-off": "#ffffff",
  "--hero-on": "#2e57cf",
  "--hero-on-2": "#4b74e6",
  "--ind-bg": "#efe4ec",
  "--ind-fg": "#6a4a60",
  "--int-bg": "#a9cbe9",
  "--int-fg": "#173d66",
  "--lk-bg": "#f4dfe7",
  "--lk-fg": "#7a3552",
  "--ll-bg": "#dd5c5c",
  "--ll-fg": "#ffffff",
  "--mig-bg": "#fbe4c7",
  "--mig-fg": "#7a4a10",
  "--nlk-bg": "#d7ebd0",
  "--nlk-fg": "#2c5a28",
  "--oc-bg": "#cfc7ec",
  "--oc-fg": "#3a2b7c",
  "--ok": "#1f8a4c",
  "--onb-bg": "#e457d3",
  "--onb-fg": "#ffffff",
  "--pm-bg": "#2e57cf",
  "--pm-fg": "#ffffff",
  "--sel": "#fff6dc",
  "--shadow": "0 1px 2px rgba(27,34,55,.06), 0 4px 16px rgba(27,34,55,.06)",
  "--warn": "#c77700",
  "--we-bg": "#f8dc78",
  "--we-fg": "#5b4300",
};

export const ROTA_HUES_DARK: Record<string, string> = {
  "--al-bg": "#a32323",
  "--am-bg": "#203552",
  "--am-fg": "#bcd6f5",
  "--br-bg": "#2f5a2a",
  "--br-fg": "#c7ecb9",
  "--crit": "#ff6b6e",
  "--exc-bg": "#d67a1f",
  "--ext-bg": "#3f76b8",
  "--ext-fg": "#fff",
  "--hero-oc": "#463a94",
  "--hero-oc-2": "#5f4fc0",
  "--hero-off": "#1c2133",
  "--hero-on": "#2f4fb8",
  "--hero-on-2": "#3f66d9",
  "--ind-bg": "#3d3040",
  "--ind-fg": "#e1cbe0",
  "--int-bg": "#274a6c",
  "--int-fg": "#c6dff5",
  "--lk-bg": "#4a2a3a",
  "--lk-fg": "#f2c7d8",
  "--ll-bg": "#c94c4c",
  "--mig-bg": "#5a401a",
  "--mig-fg": "#ffd9a3",
  "--nlk-bg": "#243d24",
  "--nlk-fg": "#bfe6b5",
  "--note-bg": "#3a3220",
  "--note-fg": "#ffe79b",
  "--note-line": "#6b5a1f",
  "--oc-bg": "#3a3160",
  "--oc-fg": "#d6ccf7",
  "--ok": "#5dcf8a",
  "--onb-bg": "#c944b9",
  "--pm-bg": "#3d67e0",
  "--pm-fg": "#fff",
  "--sel": "#3a3320",
  "--shadow": "0 1px 2px rgba(0,0,0,.4), 0 4px 16px rgba(0,0,0,.35)",
  "--warn": "#ffb54d",
  "--we-bg": "#6b5210",
  "--we-fg": "#ffe79b",
};

/**
 * Per-team avatar colours, as the prototype assigned them. A team keeps its
 * colour wherever it appears, so a reader learns "Vega is the red one" once.
 */
export const TEAM_COLOURS: Record<string, string> = {
  americas: "#3aa889",
  castor: "#4a7fe0",
  draco: "#e8962a",
  vega: "#d95c5c",
  sirius: "#2f9e8f",
  atlas: "#8a63d2",
  phoenix: "#c9a227",
  rigel: "#c0559b",
  migration: "#6b7280",
  apollo: "#2f9e8f",
  artemis: "#8a63d2",
};

/**
 * The SRE time zones, in the prototype's own hues.
 *
 * These were JS constants there, not CSS tokens -- which is why an earlier
 * version of this page referenced --tz1-fg and friends, found nothing, and
 * drew all three lanes in the same fallback grey. A zone's colour is how a
 * reader tells the three columns apart at a glance, so it is worth being
 * explicit about.
 */
export const ZONE_COLOURS: Record<string, string> = {
  TZ1: "#e8962a",
  TZ2: "#4a7fe0",
  TZ3: "#8a63d2",
};

/** The colour for a time zone, falling back to a neutral for one not listed. */
export function zoneColour(code: string): string {
  return ZONE_COLOURS[code.toUpperCase()] ?? "#6b7280";
}

/** The colour for a team, falling back to a neutral for one not listed. */
export function teamColour(teamKey: string): string {
  return TEAM_COLOURS[teamKey.toLowerCase()] ?? "#6b7280";
}
