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

package notifications

import (
	"context"
	"fmt"
	"strings"
)

// EscalationAlert is one rung of an incident call-escalation ladder, delivered
// to a Google Chat space instead of (or alongside) a phone call.
//
// READ THIS BEFORE TREATING CHAT AS THE PAGING CHANNEL. The ladder exists to
// wake someone up. A chat message does not: the specification already sends
// one to the Incident Monitor space the moment an incident is raised, and the
// ladder exists precisely because that was not enough to get an unattended
// incident attended to at three in the morning. Delivering the ladder itself
// over chat changes it from a pager into a louder version of the notification
// that already failed.
//
// It is still worth having, for two reasons. It is the only channel that can
// be exercised end to end without a telephony account, which is what makes the
// flow demonstrable today. And it gives the room visibility of an escalation
// in progress, which the calls themselves do not: a call reaches one person,
// while the card shows everyone which rung an incident has reached and who is
// being asked to pick it up.
type EscalationAlert struct {
	// Product routes the card to a space, the same way every other alert in
	// this package routes.
	Product string
	// Rung is the level being contacted, e.g. "LEVEL_2".
	Rung string
	// RungRole names who that rung is, e.g. "ABT team leads".
	RungRole string
	// Attempt is which notification of this rung it is, 1-based.
	Attempt int
	// Priority is the incident's priority, which sets the whole clock.
	Priority string
	// IncidentRef is the human-readable reference, e.g. "INC0012345".
	IncidentRef string
	// Title is the incident subject, for recognising it at a glance.
	Title string
	// RecipientName is who this rung resolved to. Deliberately a name and
	// never a phone number: a space is a room, and the ladder's own logs
	// already keep numbers out of places people read.
	RecipientName string
	// Instruction is what stops the ladder, which differs by trigger.
	Instruction string
	// Rule is the section 5.0 row that selected these recipients, so the room
	// can see which path an alert took.
	Rule string
	// PortalURL opens the incident.
	PortalURL string
	// Elapsed is how long the incident has been unattended, e.g. "18m".
	Elapsed string
}

// SendEscalationAlert posts one rung of the ladder to the product's space.
//
// The card is deliberately unlike this package's case.* cards: those announce
// something that happened, while this one is asking the room to act, so the
// rung and the instruction carry the weight and everything else is context.
func (c *GoogleChatClient) SendEscalationAlert(ctx context.Context, a EscalationAlert) error {
	if a.Rung == "" {
		return fmt.Errorf("notifications: rung is required")
	}
	if a.IncidentRef == "" {
		return fmt.Errorf("notifications: incidentRef is required")
	}

	header := fmt.Sprintf("%s escalated to %s", escalationSeverityMark(a.Priority), a.Rung)
	subtitle := a.IncidentRef
	if a.Title != "" {
		subtitle = a.IncidentRef + " - " + a.Title
	}

	var body strings.Builder
	body.WriteString(caseAlertLine("<b>%s</b>", a.RungRole))
	if a.RecipientName != "" {
		body.WriteString("<br>")
		body.WriteString(caseAlertLine("Calling %s", a.RecipientName))
	}
	body.WriteString("<br>")
	body.WriteString(caseAlertLine(`<font color="#5F6368">Priority %s</font>`, a.Priority))
	if a.Elapsed != "" {
		body.WriteString(caseAlertLine(`<font color="#5F6368"> - unattended %s</font>`, a.Elapsed))
	}
	if a.Attempt > 1 {
		body.WriteString(caseAlertLine(`<font color="#5F6368"> - reminder %d</font>`, fmt.Sprint(a.Attempt)))
	}
	if a.Rule != "" {
		body.WriteString("<br>")
		body.WriteString(caseAlertLine(`<font color="#5F6368">path %s</font>`, a.Rule))
	}
	if a.Instruction != "" {
		body.WriteString("<br><br>")
		body.WriteString(caseAlertLine("<b>%s</b>", a.Instruction))
	}
	if a.PortalURL != "" {
		body.WriteString("<br>")
		body.WriteString(fmt.Sprintf(`<a href="%s">View incident</a>`, a.PortalURL))
	}

	msg := chatCardMessage{
		CardsV2: []chatCardWrapper{{
			CardID: "incident-escalation",
			Card: chatCard{
				Header: &chatCardHeader{Title: header, Subtitle: subtitle},
				Sections: []chatCardSection{{
					Widgets: []chatCardWidget{
						{TextParagraph: &chatTextParagraph{Text: body.String()}},
					},
				}},
			},
		}},
	}
	return c.sendCard(ctx, a.Product, msg)
}

// escalationSeverityMark gives the header a glyph that reads at a glance in a
// busy space. Only the two fastest priorities get the loud one: if every rung
// of every incident shouted, none of them would.
func escalationSeverityMark(priority string) string {
	switch strings.ToUpper(strings.TrimSpace(priority)) {
	case "P0", "P1", "CATASTROPHIC", "CRITICAL":
		return "\U0001F534" // red circle
	default:
		return "\U0001F7E0" // orange circle
	}
}
