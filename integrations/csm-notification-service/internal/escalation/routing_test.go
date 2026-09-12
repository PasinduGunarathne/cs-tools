// Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

package escalation

import (
	"context"
	"testing"
)

// Section 6.0's matrix and section 5.0's rule table agree that LEVEL_0 on
// USA_WEEKEND depends on the business unit: R10 (ABT-eligible) has no
// notification level, while R12 and R14 (not ABT-eligible) do. Deciding this
// from the shift alone gave an ABT-eligible USA-weekend incident a LEVEL_0 the
// specification does not define, shifting every later level with it.
func TestHasNotificationLevel_MatchesTheRuleTable(t *testing.T) {
	tests := []struct {
		rule        string
		shift       Shift
		abtEligible bool
		want        bool
	}{
		{"R1 (business hours, ABT)", ShiftLK, true, false},
		{"R5 (business hours, sub team)", ShiftLK, false, false},
		{"R9 (USA business hours)", ShiftUSA, true, false},
		{"R2 (LK morning rotation, ABT)", ShiftLKMorning, true, true},
		{"R6 (LK morning rotation, sub team)", ShiftLKMorning, false, true},
		{"R4 (LK evening rotation)", ShiftLKEvening, true, true},
		{"R8 (LK weekend rotation)", ShiftLKWeekend, false, true},
		{"R10 (USA weekend, ABT-eligible)", ShiftUSAWeekend, true, false},
		{"R12 (USA weekend, not ABT-eligible)", ShiftUSAWeekend, false, true},
	}
	for _, tc := range tests {
		t.Run(tc.rule, func(t *testing.T) {
			rc := RoutingContext{Shift: tc.shift, ABTEligible: tc.abtEligible}
			if got := rc.HasNotificationLevel(); got != tc.want {
				t.Errorf("%s: HasNotificationLevel() = %v, want %v", tc.rule, got, tc.want)
			}
		})
	}
}

// The rule above has to reach the plan, not just the predicate.
func TestBuildPlan_ABTEligibleUSAWeekendStartsAtLevel1(t *testing.T) {
	tr := testTrigger("P2", ShiftUSAWeekend)
	tr.Routing.ABTEligible = true
	plan, err := BuildPlan(context.Background(), tr, DefaultPolicy, fullResolver())
	if err != nil {
		t.Fatal(err)
	}
	if plan.Calls[0].Level != Level1 {
		t.Errorf("first call is %s, want LEVEL_1 (R10 defines no notification level)", plan.Calls[0].Level)
	}

	tr.Routing.ABTEligible = false
	plan, err = BuildPlan(context.Background(), tr, DefaultPolicy, fullResolver())
	if err != nil {
		t.Fatal(err)
	}
	if plan.Calls[0].Level != Level0 {
		t.Errorf("first call is %s, want LEVEL_0 (R12 defines one)", plan.Calls[0].Level)
	}
}

// entity-service publishes ServiceNow's own incident priority enum, whose
// MODERATE is the spelling the case-severity vocabulary calls MEDIUM. Before
// this alias existed, a MODERATE incident resolved to no policy at all and got
// no ladder — two of the five incident priorities were silently uncovered.
func TestLookup_ResolvesIncidentPriorityVocabulary(t *testing.T) {
	for _, tc := range []struct {
		priority string
		want     string
	}{
		{"CRITICAL", "P1"}, // section 10.0's example reads "Critical (P1)"
		{"HIGH", "P2"},
		{"MODERATE", "P3"},
		{"MEDIUM", "P3"}, // the case-severity spelling still resolves
		{"LOW", "P4"},
		{"CATASTROPHIC", "P0"},
		{"P3", "P3"}, // P-notation passes through
	} {
		t.Run(tc.priority, func(t *testing.T) {
			got, ok := Lookup(DefaultPolicy, tc.priority)
			if !ok {
				t.Fatalf("Lookup(%q) found no policy", tc.priority)
			}
			if want := DefaultPolicy[tc.want]; got.InitialWait != want.InitialWait {
				t.Errorf("Lookup(%q) resolved to the wrong row: initial wait %v, want %v (%s)",
					tc.priority, got.InitialWait, want.InitialWait, tc.want)
			}
		})
	}
}

// PLANNING is deliberately absent: section 7.0 has no row below P4, so a
// planning-priority incident has no ladder at all rather than the wrong one.
func TestLookup_PlanningHasNoLadder(t *testing.T) {
	if _, ok := Lookup(DefaultPolicy, "PLANNING"); ok {
		t.Error("PLANNING resolved to a policy; section 7.0 defines no row for it")
	}
}

// The roster's three tiers are alternatives in the rule table's own
// specificity order, not additive: merging them would call a team's own sub
// lead alongside every other team's pooled sub leads.
func TestRosterResolver_PrefersTheMostSpecificTier(t *testing.T) {
	r := Roster{
		ByTeam: map[string]LevelRoster{
			"Atlas": {"LEVEL_1": {rec("atlas.lead@wso2.com", "+94770000001")}},
		},
		ByShift: map[string]LevelRoster{
			"LK_MORNING": {"LEVEL_1": {rec("pool.lead@wso2.com", "+94770000002")}},
		},
		Default: LevelRoster{
			"LEVEL_1": {rec("fallback.lead@wso2.com", "+94770000003")},
			"LEVEL_3": {rec("bu.head@wso2.com", "+94770000004")},
		},
	}
	resolver := NewRosterResolver(r)
	ctx := context.Background()

	got, err := resolver.Resolve(ctx, Level1, RoutingContext{AssignedCRETeam: "Atlas", Shift: ShiftLKMorning})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Email != "atlas.lead@wso2.com" {
		t.Errorf("an assigned team must win over the shift pool, got %v", got)
	}

	// No team on the incident (rules R3/R4) falls through to the shift pool.
	got, _ = resolver.Resolve(ctx, Level1, RoutingContext{Shift: ShiftLKMorning})
	if len(got) != 1 || got[0].Email != "pool.lead@wso2.com" {
		t.Errorf("an unassigned team must fall back to the shift pool, got %v", got)
	}

	// Leadership levels live only in the default tier.
	got, _ = resolver.Resolve(ctx, Level3, RoutingContext{AssignedCRETeam: "Atlas", Shift: ShiftLKMorning})
	if len(got) != 1 || got[0].Email != "bu.head@wso2.com" {
		t.Errorf("leadership levels must come from the default tier, got %v", got)
	}

	// A level nobody is configured for resolves to nobody, which BuildPlan
	// records as an issue and skips rather than failing.
	if got, _ := resolver.Resolve(ctx, Level4, RoutingContext{Shift: ShiftLK}); len(got) != 0 {
		t.Errorf("an unconfigured level must resolve to nobody, got %v", got)
	}
}

func TestParseRoster(t *testing.T) {
	r, err := ParseRoster(`{"default":{"LEVEL_1":[{"Email":"a@wso2.com","Name":"A","Phone":"+94770000001"}]}}`)
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Default["LEVEL_1"]) != 1 {
		t.Fatalf("expected one LEVEL_1 recipient, got %v", r.Default)
	}
	if r.IsEmpty() {
		t.Error("a roster with recipients must not report empty")
	}

	empty, err := ParseRoster("")
	if err != nil {
		t.Fatalf("an empty roster must not be an error: %v", err)
	}
	if !empty.IsEmpty() {
		t.Error("an empty roster must report empty so main.go can refuse to start the engine")
	}
	if _, err := ParseRoster("{not json"); err == nil {
		t.Error("expected an error for malformed roster JSON")
	}
}
