package ws

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/gorilla/websocket"

	"cloud/internal/billing"
	"cloud/internal/db"
)

func (r *Relay) handleBrowserConnection(ws *SafeWS, userID string) {
	connectedAt := time.Now().UnixMilli()

	// Register browser
	r.mu.Lock()
	if r.UserBrowsers[userID] == nil {
		r.UserBrowsers[userID] = make(map[*SafeWS]*BrowserInfo)
	}
	r.UserBrowsers[userID][ws] = &BrowserInfo{
		ConnectedAt: connectedAt,
		UserID:      userID,
	}
	r.mu.Unlock()

	db.RecordEvent("browser.connect", &userID, nil)
	fmt.Printf("[ws:browser] Connected for user %s\n", userID)

	// Send current agent list
	agents := r.getOnlineAgents(userID)
	ws.WriteJSON(map[string]interface{}{
		"type":    "agents:list",
		"payload": agents,
	})

	// Send tier info
	tierInfo := billing.GetTierInfo(userID)
	ws.WriteJSON(map[string]interface{}{
		"type":    "tier:info",
		"payload": tierInfo,
	})

	// Send outdated agent notifications
	if r.LatestAgentVersion != "" {
		r.mu.RLock()
		if agentMap, ok := r.UserAgents[userID]; ok {
			for agentID, info := range agentMap {
				if isVersionOutdated(info.Version, r.LatestAgentVersion) {
					ws.WriteJSON(map[string]interface{}{
						"type": "update:available",
						"payload": map[string]interface{}{
							"agentId":        agentID,
							"currentVersion": info.Version,
							"latestVersion":  r.LatestAgentVersion,
						},
					})
				}
			}
		}
		r.mu.RUnlock()
	}

	// Read loop
	defer func() {
		r.mu.Lock()
		delete(r.UserBrowsers[userID], ws)
		if len(r.UserBrowsers[userID]) == 0 {
			delete(r.UserBrowsers, userID)
		}
		r.mu.Unlock()

		durationMs := time.Now().UnixMilli() - connectedAt
		db.RecordEvent("browser.disconnect", &userID, map[string]interface{}{
			"duration_ms": durationMs,
		})
		ws.Close()
		fmt.Printf("[ws:browser] Disconnected for user %s\n", userID)
	}()

	for {
		_, raw, err := ws.ReadMessage()
		if err != nil {
			break
		}

		var msg map[string]interface{}
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}

		msgType, _ := msg["type"].(string)

		// Handle ping
		if msgType == "ping" {
			ws.WriteJSON(map[string]string{"type": "pong"})
			continue
		}

		// Handle update:install - route directly to target agent
		if msgType == "update:install" {
			agentID, _ := msg["agentId"].(string)
			if agentID != "" {
				r.mu.RLock()
				agentInfo := r.UserAgents[userID][agentID]
				r.mu.RUnlock()
				if agentInfo != nil {
					installMsg := map[string]interface{}{
						"type":    "update:install",
						"payload": msg["payload"],
					}
					data, _ := json.Marshal(installMsg)
					agentInfo.WS.WriteMessage(websocket.TextMessage, data)
				} else {
					ws.WriteJSON(map[string]interface{}{
						"type":    "error",
						"payload": map[string]string{"message": fmt.Sprintf("Agent %s is not online", agentID)},
					})
				}
			}
			continue
		}

		// Every message must have agentId
		agentID, _ := msg["agentId"].(string)
		if agentID == "" {
			ws.WriteJSON(map[string]interface{}{
				"type":    "error",
				"payload": map[string]string{"message": "Missing agentId in message"},
			})
			continue
		}

		// Enforce tier limits
		if msgType == "request" {
			payload, _ := msg["payload"].(map[string]interface{})
			if payload != nil {
				method, _ := payload["method"].(string)
				path, _ := payload["path"].(string)
				r.mu.RLock()
				agentCount := 0
				if agents, ok := r.UserAgents[userID]; ok {
					agentCount = len(agents)
				}
				r.mu.RUnlock()
				if blocked := billing.Check(userID, msgType, method, path, agentCount); blocked != nil {
					ws.WriteJSON(map[string]interface{}{
						"type":    "tier:limit",
						"payload": blocked,
					})
					// Also send error response if this was a request
					if msg["id"] != nil {
						ws.WriteJSON(map[string]interface{}{
							"type": "response",
							"id":   msg["id"],
							"payload": map[string]interface{}{
								"status": 403,
								"body":   map[string]string{"error": blocked.Message},
							},
						})
					}
					continue
				}
			}
		}

		incrementRelayCounter(userID)

		// Track last activity for user actions
		if msgType == "terminal:input" || (msgType == "request" && msg["payload"] != nil) {
			r.mu.Lock()
			if bi, ok := r.UserBrowsers[userID][ws]; ok {
				bi.LastActivity = time.Now().UnixMilli()
			}
			r.mu.Unlock()
		}

		// Forward to agent
		r.mu.RLock()
		agentInfo := r.UserAgents[userID][agentID]
		r.mu.RUnlock()

		if agentInfo != nil {
			// Strip agentId before forwarding
			delete(msg, "agentId")
			data, _ := json.Marshal(msg)
			agentInfo.WS.WriteMessage(websocket.TextMessage, data)
		} else {
			ws.WriteJSON(map[string]interface{}{
				"type":    "error",
				"payload": map[string]string{"message": fmt.Sprintf("Agent %s is not online", agentID)},
			})
		}
	}
}

// BuildUserResponse is used by the /api/me endpoint
func BuildUserResponse(user *db.User, agents []db.Agent) map[string]interface{} {
	limits := billing.GetTierLimits(user.Tier)
	features := map[string]interface{}{
		"maxAgents":        limits.Agents,
		"maxTerminalPanes": limits.TerminalPanes,
		"relay":            limits.Relay,
		"collaboration":    limits.Collaboration,
	}

	agentList := make([]map[string]interface{}, 0, len(agents))
	for _, a := range agents {
		agentList = append(agentList, map[string]interface{}{
			"id":       a.ID,
			"hostname": a.Hostname,
			"os":       a.OS,
			"version":  a.Version,
			"lastSeen": a.LastSeenAt,
		})
	}

	name := user.Username
	if user.DisplayName != nil && *user.DisplayName != "" {
		name = *user.DisplayName
	}

	resp := map[string]interface{}{
		"id":       user.ID,
		"username": user.Username,
		"name":     name,
		"login":    user.Username,
		"role":     user.Role,
		"tier":     user.Tier,
		"features": features,
		"agents":   agentList,
	}
	return resp
}

// BuildAgentResponse strips sensitive fields from agent data
func BuildAgentResponse(agents []db.Agent) []map[string]interface{} {
	result := make([]map[string]interface{}, 0, len(agents))
	for _, a := range agents {
		result = append(result, map[string]interface{}{
			"id":           a.ID,
			"user_id":      a.UserID,
			"hostname":     a.Hostname,
			"display_name": a.DisplayName,
			"os":           a.OS,
			"version":      a.Version,
			"last_seen_at": a.LastSeenAt,
			"created_at":   a.CreatedAt,
		})
	}
	return result
}
