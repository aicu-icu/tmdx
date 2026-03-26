package billing

import (
	"encoding/json"
	"fmt"
	"math"

	"cloud/internal/db"
)

var createPathMap = map[string]string{
	"/api/terminals":  "terminalPanes",
	"/api/file-panes": "filePanes",
	"/api/notes":      "notes",
	"/api/git-graphs": "gitGraphs",
	"/api/iframes":    "filePanes",
}

var dbTypeMap = map[string]string{
	"terminalPanes": "terminal",
	"filePanes":     "file",
	"notes":         "note",
	"gitGraphs":     "git-graph",
}

// LimitResult is returned when a tier limit blocks an action.
type LimitResult struct {
	Feature    string `json:"feature"`
	Message    string `json:"message"`
	UpgradeURL string `json:"upgradeUrl"`
}

// Check enforces tier limits on browser→agent messages (POST only).
func Check(userID string, msgType string, method string, path string, agentCount int) *LimitResult {
	user, err := db.GetUserByID(userID)
	if err != nil || user == nil {
		return nil
	}

	tier := user.Tier
	if tier == "" {
		tier = "free"
	}
	limits := GetTierLimits(tier)

	if msgType != "request" || method != "POST" {
		return nil
	}

	// Strip query string
	cleanPath := path
	if idx := indexOf(path, '?'); idx >= 0 {
		cleanPath = path[:idx]
	}

	limitKey, ok := createPathMap[cleanPath]
	if !ok {
		return nil
	}

	var limit int
	switch limitKey {
	case "terminalPanes":
		limit = limits.TerminalPanes
	case "filePanes":
		if math.IsInf(limits.FilePanes, 1) {
			return nil
		}
		limit = int(limits.FilePanes)
	case "notes":
		if math.IsInf(limits.Notes, 1) {
			return nil
		}
		limit = int(limits.Notes)
	case "gitGraphs":
		if math.IsInf(limits.GitGraphs, 1) {
			return nil
		}
		limit = int(limits.GitGraphs)
	default:
		return nil
	}

	dbType := dbTypeMap[limitKey]
	if dbType == "" {
		return nil
	}

	count := countPanes(userID, dbType)
	if count >= limit {
		featureNames := map[string]string{
			"terminalPanes": "terminal panes",
			"filePanes":     "file panes",
			"notes":         "notes",
			"gitGraphs":     "git graph panes",
		}
		uid := userID
		db.RecordEvent("tier.limit_hit", &uid, map[string]interface{}{
			"feature": limitKey,
			"tier":    tier,
			"limit":   limit,
		})
		return &LimitResult{
			Feature:    limitKey,
			Message:    fmt.Sprintf("Your plan allows %d %s. Upgrade to Pro for more.", limit, featureNames[limitKey]),
			UpgradeURL: "/upgrade",
		}
	}
	return nil
}

// CheckAgentLimit checks if a new agent connection should be allowed.
func CheckAgentLimit(userID string, agentCount int) *LimitResult {
	user, err := db.GetUserByID(userID)
	if err != nil || user == nil {
		return nil
	}

	tier := user.Tier
	if tier == "" {
		tier = "free"
	}
	limits := GetTierLimits(tier)

	if agentCount >= limits.Agents {
		uid := userID
		db.RecordEvent("tier.limit_hit", &uid, map[string]interface{}{
			"feature": "agents",
			"tier":    tier,
			"limit":   limits.Agents,
		})
		s := ""
		if limits.Agents > 1 {
			s = "s"
		}
		return &LimitResult{
			Feature:    "agents",
			Message:    fmt.Sprintf("Your plan allows %d device%s. Upgrade to Pro for more.", limits.Agents, s),
			UpgradeURL: "/upgrade",
		}
	}
	return nil
}

// CheckImageLimit checks if adding images would exceed the user's tier limit.
func CheckImageLimit(userID string, newImageCount int) *LimitResult {
	user, err := db.GetUserByID(userID)
	if err != nil || user == nil {
		return nil
	}

	tier := user.Tier
	if tier == "" {
		tier = "free"
	}
	limits := GetTierLimits(tier)
	if limits.NoteImages == 0 || math.IsInf(float64(limits.NoteImages), 1) {
		return nil
	}

	current := countUserImages(userID)
	if current+newImageCount > limits.NoteImages {
		return &LimitResult{
			Feature:    "noteImages",
			Message:    fmt.Sprintf("Your plan allows %d images across all notes. You have %d. Upgrade for more.", limits.NoteImages, current),
			UpgradeURL: "/upgrade",
		}
	}
	return nil
}

// GetTierInfo returns tier info for a user.
func GetTierInfo(userID string) map[string]interface{} {
	user, err := db.GetUserByID(userID)
	tier := "free"
	if err == nil && user != nil && user.Tier != "" {
		tier = user.Tier
	}
	return map[string]interface{}{
		"tier":   tier,
		"limits": GetTierLimits(tier),
	}
}

func countPanes(userID, paneType string) int {
	var count int
	db.GetDB().QueryRow("SELECT COUNT(*) FROM pane_layouts WHERE user_id=? AND pane_type=?", userID, paneType).Scan(&count)
	return count
}

func countUserImages(userID string) int {
	rows, err := db.GetDB().Query("SELECT images FROM notes WHERE user_id=?", userID)
	if err != nil {
		return 0
	}
	defer rows.Close()
	total := 0
	for rows.Next() {
		var imagesJSON string
		rows.Scan(&imagesJSON)
		// Simple count: count "[" occurrences as proxy for array length
		// More accurate would be JSON parse, but this works for the count
		if imagesJSON == "" || imagesJSON == "[]" {
			continue
		}
		// Parse images JSON to count
		imgs := jsonUnmarshalImages(imagesJSON)
		total += len(imgs)
	}
	return total
}

func jsonUnmarshalImages(s string) []string {
	var imgs []string
	_ = json.Unmarshal([]byte(s), &imgs)
	return imgs
}

func indexOf(s string, c byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == c {
			return i
		}
	}
	return -1
}
