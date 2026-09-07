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

import "context"

// Shift is the "effective shift" at the time an incident is reported. Section
// 5.0's rule table selects recipients from the incident's own attributes plus
// this.
type Shift string

const (
	ShiftLK         Shift = "LK"          // 9AM - 6PM IST
	ShiftLKMorning  Shift = "LK_MORNING"  // 6-9 AM IST
	ShiftLKEvening  Shift = "LK_EVENING"  // 6-9 PM IST
	ShiftLKWeekend  Shift = "LK_WEEKEND"  // 6AM - 9PM IST
	ShiftUSA        Shift = "USA"         // 9PM - 6AM IST
	ShiftUSAWeekend Shift = "USA_WEEKEND" // 9PM - 6AM IST, weekends
)

// IsRotation reports whether this shift is a rotation, which is what decides
// if LEVEL_0 exists for an incident at all (section 3.0). The regular LK and
// USA business-hours shifts have no notification level.
func (s Shift) IsRotation() bool {
	switch s {
	case ShiftLKMorning, ShiftLKEvening, ShiftLKWeekend, ShiftUSAWeekend:
		return true
	default:
		return false
	}
}

// RoutingContext is the full input to section 5.0's rule table (R1–R14). Every
// field is drawn from the incident record except Shift, which is derived from
// when the incident was reported.
type RoutingContext struct {
	// Product is the WSO2 product on the incident; empty when absent, which
	// rules R7, R8, R13 and R14 route on explicitly (and which section 12.0
	// treats as an erroneous scenario worth emailing about).
	Product string
	// ABTEligible is whether the account qualifies for ABT-based support,
	// determined by the assigned product.
	ABTEligible bool
	// AssignedCRETeam is the CS team on the incident; empty when unassigned,
	// which rules R3 and R4 route on (and section 12.0 also flags).
	AssignedCRETeam string
	// Shift is the effective shift when the incident was reported.
	Shift Shift
}

// Recipient is one person to call or email at a level.
type Recipient struct {
	Email string
	Name  string
	// Phone is empty when the user profile has no mobile number. The
	// specification's execution summary logs that case as
	// [LEVEL_n][ERROR][NO_NUMBER][email] and carries on — a missing number
	// must never abort a level.
	Phone string
}

// Resolver turns a level plus routing context into the people to contact.
//
// NOT IMPLEMENTED YET, deliberately. The specification resolves recipients
// from organisation data that this platform does not hold: ServiceNow's
// sys_user_group_type (BU/shift tags per team), u_team_member_role (the
// escalation roles — sub lead, team lead, BU head, head of CRE) and the
// On-Call Scheduling module (effective shift and escalation paths). See the
// administrative guide for how each is configured today.
//
// Two of those have partial equivalents here already — CSM_TEAM_REGISTRY holds
// teams with a FAMILY, and the rotations tables hold who is on shift — but
// neither carries the BU/shift tags or the escalation roles. Closing that gap
// is its own piece of work; this interface is the seam it plugs into, so the
// scheduling half above can be built, reviewed and tested independently.
//
// Availability filtering applies only at LEVEL_0 (section 8.0): every other
// level is contacted regardless of whether they are on shift.
type Resolver interface {
	// Resolve returns the recipients for one level. An empty slice is valid
	// and means "nobody at this level" — the caller logs it and moves on to
	// the next level rather than failing.
	Resolve(ctx context.Context, level Level, rc RoutingContext) ([]Recipient, error)
}
