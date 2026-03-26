package billing

import "math"

const DefaultTier = "pro"

type TierLimits struct {
	Agents        int     `json:"agents"`
	TerminalPanes int     `json:"terminalPanes"`
	FilePanes     float64 `json:"filePanes"` // Infinity = unlimited
	Notes         float64 `json:"notes"`
	GitGraphs     float64 `json:"gitGraphs"`
	NoteImages    int     `json:"noteImages"`
	Relay         bool    `json:"relay"`
	Collaboration bool    `json:"collaboration"`
}

var TIERS = map[string]TierLimits{
	"free": {
		Agents:        2,
		TerminalPanes: 7,
		FilePanes:     math.Inf(1),
		Notes:         math.Inf(1),
		GitGraphs:     math.Inf(1),
		NoteImages:    10,
		Relay:         true,
		Collaboration: false,
	},
	"pro": {
		Agents:        6,
		TerminalPanes: 40,
		FilePanes:     math.Inf(1),
		Notes:         math.Inf(1),
		GitGraphs:     math.Inf(1),
		NoteImages:    100,
		Relay:         true,
		Collaboration: false,
	},
	"poweruser": {
		Agents:        24,
		TerminalPanes: 160,
		FilePanes:     math.Inf(1),
		Notes:         math.Inf(1),
		GitGraphs:     math.Inf(1),
		NoteImages:    400,
		Relay:         true,
		Collaboration: false,
	},
}

func GetTierLimits(tier string) TierLimits {
	if t, ok := TIERS[tier]; ok {
		return t
	}
	return TIERS[DefaultTier]
}
