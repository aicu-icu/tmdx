package billing

import (
	"math"

	"cloud/internal/db"
)

const DefaultTier = "pro"

type TierLimits struct {
	Agents        int     `json:"agents"`
	TerminalPanes int     `json:"terminalPanes"`
	FilePanes     float64 `json:"filePanes"` // Infinity = unlimited
	Notes         float64 `json:"notes"`
	GitGraphs     float64 `json:"gitGraphs"`
	NoteImages    int     `json:"noteImages"` // 0 = unlimited
	Relay         bool    `json:"relay"`
	Collaboration bool    `json:"collaboration"`
}

// Hardcoded defaults used as fallback when DB is unavailable
var TIERS = map[string]TierLimits{
	"free": {
		Agents:        2,
		TerminalPanes: 7,
		FilePanes:     math.Inf(1),
		Notes:         math.Inf(1),
		GitGraphs:     math.Inf(1),
		NoteImages:    0,
		Relay:         true,
		Collaboration: false,
	},
	"pro": {
		Agents:        6,
		TerminalPanes: 40,
		FilePanes:     math.Inf(1),
		Notes:         math.Inf(1),
		GitGraphs:     math.Inf(1),
		NoteImages:    0,
		Relay:         true,
		Collaboration: false,
	},
	"poweruser": {
		Agents:        24,
		TerminalPanes: 160,
		FilePanes:     math.Inf(1),
		Notes:         math.Inf(1),
		GitGraphs:     math.Inf(1),
		NoteImages:    0,
		Relay:         true,
		Collaboration: false,
	},
}

func GetTierLimits(tier string) TierLimits {
	if cfg, err := db.GetTierConfig(tier); err == nil && cfg != nil {
		return TierLimits{
			Agents:        cfg.Agents,
			TerminalPanes: cfg.TerminalPanes,
			FilePanes:     math.Inf(1),
			Notes:         math.Inf(1),
			GitGraphs:     math.Inf(1),
			NoteImages:    0,
			Relay:         true,
			Collaboration: false,
		}
	}
	if t, ok := TIERS[tier]; ok {
		return t
	}
	return TIERS[DefaultTier]
}
