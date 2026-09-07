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
	"fmt"
	"sort"
	"time"
)

// Trigger is what starts a ladder: an incident being created, or its priority
// being elevated.
type Trigger struct {
	IncidentID string
	// Number is the human-readable reference used in the voice message and
	// the execution summary, e.g. "INC0012345".
	Number string
	// WSO2CaseID is the platform's own identifier, e.g. "WSO2-1000".
	WSO2CaseID string
	// Priority keys the timing policy; accepts P-notation or severity labels.
	Priority string
	Title    string
	Account  string
	Team     string
	// Kind distinguishes the two triggers, which changes the instruction the
	// voice message gives (see VoiceMessage).
	Kind TriggerKind
	// At is when the trigger happened — every planned call is an offset from
	// this, never from plan time, so a delayed consume does not shift the
	// ladder later than the specification intends.
	At time.Time
	// Routing selects recipients per level.
	Routing RoutingContext
}

// TriggerKind is which of the two events started the ladder.
type TriggerKind string

const (
	TriggerNewIncident      TriggerKind = "New Case"
	TriggerPriorityElevated TriggerKind = "Priority Elevation"
)

// PlannedCall is one concrete call: who, when, at which level.
type PlannedCall struct {
	Level     Level
	Ordinal   int
	At        time.Time
	Recipient Recipient
}

// PlanIssue records something the plan could not do but which must not abort
// it — the specification's execution summary logs these and carries on.
type PlanIssue struct {
	Level Level
	// At is when the level would have opened. Recorded even though no call
	// came of it: the execution summary orders a level by this, which is the
	// only way a level whose every recipient was unreachable still appears.
	At     time.Time
	Reason string // e.g. "NO_NUMBER", "NO_RECIPIENTS", "RESOLVE_FAILED"
	Detail string // an email, or a resolver error
}

// Plan is a fully expanded ladder for one incident.
type Plan struct {
	Trigger Trigger
	Calls   []PlannedCall
	Issues  []PlanIssue
}

// BuildPlan expands a trigger into every call the ladder would place, with
// recipients resolved once per level.
//
// Once per level, not once per attempt: a level places several calls, and a
// resolver reading a live rotation roster could legitimately answer two
// attempts of the same level differently. The specification escalates to a
// level's people, so the level is the unit that gets resolved; every attempt
// of that level then calls the same set.
//
// Level 0 is included only when the incident was reported during a rotation
// (section 3.0). A level that resolves to nobody, or whose resolver fails, is
// recorded as an issue and skipped — never fatal, because one unreachable
// level must not stop the ladder reaching the next one.
//
// A recipient with no phone number yields a NO_NUMBER issue and no call,
// matching the execution summary's own
// [LEVEL_n][ERROR][NO_NUMBER][email] line.
func BuildPlan(ctx context.Context, t Trigger, policies map[string]PriorityPolicy, r Resolver) (Plan, error) {
	policy, ok := Lookup(policies, t.Priority)
	if !ok {
		return Plan{}, fmt.Errorf("escalation: no policy for priority %q", t.Priority)
	}

	// Group the flat schedule by level, keeping levels in the order they open.
	var order []Level
	attemptsByLevel := map[Level][]Attempt{}
	for _, a := range Schedule(policy, t.Routing.Shift.IsRotation()) {
		if _, seen := attemptsByLevel[a.Level]; !seen {
			order = append(order, a.Level)
		}
		attemptsByLevel[a.Level] = append(attemptsByLevel[a.Level], a)
	}

	plan := Plan{Trigger: t}
	for _, level := range order {
		attempts := attemptsByLevel[level]
		opensAt := t.At.Add(attempts[0].After)

		recipients, err := r.Resolve(ctx, level, t.Routing)
		if err != nil {
			plan.Issues = append(plan.Issues, PlanIssue{
				Level: level, At: opensAt, Reason: "RESOLVE_FAILED", Detail: err.Error(),
			})
			continue
		}
		if len(recipients) == 0 {
			plan.Issues = append(plan.Issues, PlanIssue{Level: level, At: opensAt, Reason: "NO_RECIPIENTS"})
			continue
		}

		reachable := make([]Recipient, 0, len(recipients))
		for _, rec := range recipients {
			if rec.Phone == "" {
				plan.Issues = append(plan.Issues, PlanIssue{
					Level: level, At: opensAt, Reason: "NO_NUMBER", Detail: rec.Email,
				})
				continue
			}
			reachable = append(reachable, rec)
		}

		for _, a := range attempts {
			for _, rec := range reachable {
				plan.Calls = append(plan.Calls, PlannedCall{
					Level:     level,
					Ordinal:   a.Ordinal,
					At:        t.At.Add(a.After),
					Recipient: rec,
				})
			}
		}
	}

	sort.SliceStable(plan.Calls, func(i, j int) bool { return plan.Calls[i].At.Before(plan.Calls[j].At) })
	return plan, nil
}

// Remaining returns the calls still due at or after `from` — what a ladder
// would go on to place. Acknowledging an incident cancels exactly this set.
func (p Plan) Remaining(from time.Time) []PlannedCall {
	out := make([]PlannedCall, 0, len(p.Calls))
	for _, c := range p.Calls {
		if !c.At.Before(from) {
			out = append(out, c)
		}
	}
	return out
}

// Delivered returns the calls that would already have been placed before
// `at` — used to report what actually happened when a ladder is cancelled.
func (p Plan) Delivered(at time.Time) []PlannedCall {
	out := make([]PlannedCall, 0, len(p.Calls))
	for _, c := range p.Calls {
		if c.At.Before(at) {
			out = append(out, c)
		}
	}
	return out
}

// VoiceMessage renders the SSML the specification defines for the Twilio
// alert, including the instruction that differs between the two triggers.
func (t Trigger) VoiceMessage() string {
	instruction := "Add a public comment to stop further notifications."
	if t.Kind == TriggerNewIncident {
		instruction = "Update the ticket status to 'Work In Progress' to stop further notifications."
	}
	return "<speak>" +
		"<s>WSO2 Support Alert.</s>" +
		fmt.Sprintf("<s>Trigger Type - %s.</s>", t.Kind) +
		fmt.Sprintf("<s>Priority - %s.</s>", t.Priority) +
		fmt.Sprintf("<s>Account - %s.</s>", t.Account) +
		fmt.Sprintf("<s>Case number - <break time='500ms' /> <prosody rate='90%%'>%s</prosody> .</s>", t.WSO2CaseID) +
		fmt.Sprintf("<s>Team - %s.</s>", t.Team) +
		fmt.Sprintf("<s><emphasis level='moderate'> %s</emphasis> </s> <break time='1s' /> ", instruction) +
		"</speak>"
}

// ExecutionSummary renders the plan in the format the specification writes
// back to the incident as a work note, so a dry run reads identically to a
// real one.
func (p Plan) ExecutionSummary(cancelledAt *time.Time) []string {
	const stamp = "2006-01-02 15:04:05"
	lines := []string{
		fmt.Sprintf("[%s][OK][Start : Notification Plan - %s][%s/%s]",
			p.Trigger.At.Format(stamp), p.Trigger.Kind, p.Trigger.Number, p.Trigger.WSO2CaseID),
	}

	// Order the levels by when each opens, taking that time from the level's
	// issues as readily as from its calls. Driving this off p.Calls alone hid
	// a whole level whenever none of its recipients had a phone number — the
	// one case the summary's NO_NUMBER line exists to report.
	type block struct {
		level  Level
		opensA time.Time
		calls  []PlannedCall
		issues []PlanIssue
	}
	blocks := map[Level]*block{}
	var order []Level
	at := func(level Level, t time.Time) *block {
		b, ok := blocks[level]
		if !ok {
			b = &block{level: level, opensA: t}
			blocks[level] = b
			order = append(order, level)
		}
		if t.Before(b.opensA) {
			b.opensA = t
		}
		return b
	}
	for _, is := range p.Issues {
		b := at(is.Level, is.At)
		b.issues = append(b.issues, is)
	}
	for _, c := range p.Calls {
		b := at(c.Level, c.At)
		b.calls = append(b.calls, c)
	}
	sort.SliceStable(order, func(i, j int) bool {
		bi, bj := blocks[order[i]], blocks[order[j]]
		if !bi.opensA.Equal(bj.opensA) {
			return bi.opensA.Before(bj.opensA)
		}
		return bi.level < bj.level
	})

	for _, level := range order {
		b := blocks[level]
		if cancelledAt != nil && !b.opensA.Before(*cancelledAt) {
			continue
		}
		lines = append(lines, fmt.Sprintf("[%s][%s][OK][Start : Escalation Step]", b.opensA.Format(stamp), b.level))
		for _, is := range b.issues {
			lines = append(lines, fmt.Sprintf("[%s][%s][ERROR][%s][%s]",
				is.At.Format(stamp), is.Level, is.Reason, is.Detail))
		}
		for _, c := range b.calls {
			if cancelledAt != nil && !c.At.Before(*cancelledAt) {
				continue
			}
			lines = append(lines, fmt.Sprintf("[%s][%s][OK][Call][%s][%s]",
				c.At.Format(stamp), c.Level, c.Recipient.Email, c.Recipient.Phone))
		}
	}

	if cancelledAt != nil {
		lines = append(lines, fmt.Sprintf("[%s][OK][Acknowledged : %d call(s) cancelled]",
			cancelledAt.Format(stamp), len(p.Remaining(*cancelledAt))))
	}
	return lines
}
