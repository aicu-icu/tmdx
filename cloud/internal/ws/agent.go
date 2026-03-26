package ws

import (
	"encoding/json"
	"fmt"
	"time"

	"cloud/internal/auth"
	"cloud/internal/billing"
	"cloud/internal/db"
	"cloud/internal/utils"
)

func (r *Relay) handleAgentConnection(ws *SafeWS) {
	var authenticated bool
	var agentID string
	var userID string
	var connectedAt int64

	// Agent must authenticate within 10 seconds
	authTimeout := time.AfterFunc(10*time.Second, func() {
		if !authenticated {
			ws.WriteJSON(map[string]interface{}{
				"type":    "agent:auth:fail",
				"payload": map[string]string{"reason": "Auth timeout -- must authenticate within 10 seconds"},
			})
			ws.Close()
		}
	})

	defer func() {
		authTimeout.Stop()
		if authenticated && userID != "" && agentID != "" {
			r.mu.RLock()
			agentInfo := r.UserAgents[userID][agentID]
			r.mu.RUnlock()

			durationMs := time.Now().UnixMilli() - connectedAt
			var hostname string
			if agentInfo != nil {
				hostname = agentInfo.Hostname
			}
			db.RecordEvent("agent.disconnect", &userID, map[string]interface{}{
				"agentId":     agentID,
				"hostname":    hostname,
				"duration_ms": durationMs,
			})

			// Remove from state map
			r.mu.Lock()
			delete(r.UserAgents[userID], agentID)
			if len(r.UserAgents[userID]) == 0 {
				delete(r.UserAgents, userID)
			}
			r.mu.Unlock()

			fmt.Printf("[ws:agent] Disconnected: %s for user %s\n", agentID, userID)

			// Notify browsers
			r.broadcastToBrowsers(userID, map[string]interface{}{
				"type":    "agent:offline",
				"payload": map[string]string{"agentId": agentID},
			})
		}
		ws.Close()
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

		if !authenticated {
			msgType, _ := msg["type"].(string)
			if msgType == "agent:auth" {
				payload, _ := msg["payload"].(map[string]interface{})
				if payload == nil {
					ws.WriteJSON(map[string]interface{}{
						"type":    "agent:auth:fail",
						"payload": map[string]string{"reason": "Invalid auth payload"},
					})
					ws.Close()
					return
				}

				token, _ := payload["token"].(string)
				var err error
				agentID, userID, err = auth.VerifyAgentToken(token)
				if err != nil {
					fmt.Printf("[ws:agent] Auth failed: %v\n", err)
					ws.WriteJSON(map[string]interface{}{
						"type":    "agent:auth:fail",
						"payload": map[string]string{"reason": err.Error()},
					})
					ws.Close()
					return
				}

				authTimeout.Stop()
				authenticated = true

				// Check agent limit
				r.mu.RLock()
				isReconnect := false
				if agents, ok := r.UserAgents[userID]; ok {
					_, isReconnect = agents[agentID]
				}
				agentCount := 0
				if agents, ok := r.UserAgents[userID]; ok {
					agentCount = len(agents)
				}
				r.mu.RUnlock()

				if !isReconnect {
					if blocked := billing.CheckAgentLimit(userID, agentCount); blocked != nil {
						ws.WriteJSON(map[string]interface{}{
							"type":    "agent:auth:fail",
							"payload": map[string]string{"reason": blocked.Message},
						})
						r.broadcastToBrowsers(userID, map[string]interface{}{
							"type":    "tier:limit",
							"payload": blocked,
						})
						ws.Close()
						return
					}
				}

				// Register agent
				r.mu.Lock()
				if r.UserAgents[userID] == nil {
					r.UserAgents[userID] = make(map[string]*AgentInfo)
				}
				// Close existing connection if replacing
				if existing, ok := r.UserAgents[userID][agentID]; ok && existing.WS != ws {
					existing.Replaced = true
					existing.WS.Close()
				}

				// Normalize OS
				agentOS, _ := payload["os"].(string)
				if agentOS == "darwin" {
					agentOS = "macos"
				}
				if agentOS == "" {
					agentOS = "unknown"
				}

				hostname, _ := payload["hostname"].(string)
				if hostname == "" {
					hostname = "unknown"
				}
				version, _ := payload["version"].(string)

				// Get created_at from DB
				agentRecord, _ := db.GetAgentByID(agentID)
				createdAt := ""
				if agentRecord != nil {
					createdAt = agentRecord.CreatedAt
				}
				if createdAt == "" {
					createdAt = time.Now().Format(time.RFC3339)
				}

				var displayName *string
				if agentRecord != nil && agentRecord.DisplayName != nil {
					displayName = agentRecord.DisplayName
				}

				r.UserAgents[userID][agentID] = &AgentInfo{
					WS:          ws,
					Hostname:    hostname,
					DisplayName: displayName,
					OS:          agentOS,
					Version:     version,
					CreatedAt:   createdAt,
				}
				r.mu.Unlock()

				// Update last seen
				db.UpdateLastSeen(agentID)

				// Send auth success
				ws.WriteJSON(map[string]interface{}{
					"type":    "agent:auth:ok",
					"payload": map[string]string{"agentId": agentID},
				})

				connectedAt = time.Now().UnixMilli()
				db.RecordEvent("agent.connect", &userID, map[string]interface{}{
					"agentId":  agentID,
					"hostname": hostname,
					"os":       agentOS,
					"version":  version,
				})
				fmt.Printf("[ws:agent] Authenticated: %s (%s) for user %s\n", agentID, hostname, userID)

				// Notify browsers
				onlineMsg := map[string]interface{}{
					"type": "agent:online",
					"payload": map[string]interface{}{
						"agentId":   agentID,
						"hostname":  hostname,
						"os":        agentOS,
						"version":   version,
						"createdAt": createdAt,
					},
				}
				if displayName != nil {
					onlineMsg["payload"].(map[string]interface{})["displayName"] = *displayName
				}
				r.broadcastToBrowsers(userID, onlineMsg)

				// Check if outdated
				if r.LatestAgentVersion != "" && utils.IsVersionOutdated(version, r.LatestAgentVersion) {
					updatePayload := map[string]interface{}{
						"agentId":        agentID,
						"currentVersion": version,
						"latestVersion":  r.LatestAgentVersion,
					}
					ws.WriteJSON(map[string]interface{}{
						"type":    "update:available",
						"payload": updatePayload,
					})
					r.broadcastToBrowsers(userID, map[string]interface{}{
						"type":    "update:available",
						"payload": updatePayload,
					})
				}
			} else {
				// First message was not agent:auth
				ws.WriteJSON(map[string]interface{}{
					"type":    "agent:auth:fail",
					"payload": map[string]string{"reason": "Must authenticate first -- send agent:auth as first message"},
				})
				ws.Close()
				return
			}
			continue
		}

		// --- Authenticated message handling ---
		msgType, _ := msg["type"].(string)

		// Handle pong
		if msgType == "agent:pong" {
			db.UpdateLastSeen(agentID)
			continue
		}

		// Forward update:progress to browsers
		if msgType == "update:progress" {
			fmt.Printf("[ws:agent] Forwarding update:progress from %s\n", agentID)
			msg["agentId"] = agentID
			r.broadcastToBrowsers(userID, msg)
			continue
		}

		// Forward all other messages to browsers with agentId
		msg["agentId"] = agentID
		r.broadcastToBrowsers(userID, msg)
	}
}
