package routes

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"cloud/internal/auth"
	"cloud/internal/billing"
	"cloud/internal/db"
)

// Pending pairing requests
type pendingPairing struct {
	UserID    string    `json:"userId"`
	Hostname  string    `json:"hostname"`
	OS        string    `json:"os"`
	Version   string    `json:"version"`
	Status    string    `json:"status"` // pending | approved
	Token     string    `json:"token"`
	AgentID   string    `json:"agentId"`
	ExpiresAt time.Time `json:"expiresAt"`
}

var (
	pairingMu       sync.Mutex
	pendingPairings = make(map[string]*pendingPairing)

	// Rate limiter for pair-status
	pairStatusMu   sync.Mutex
	pairStatusReqs = make(map[string]*pairStatusEntry)
)

type pairStatusEntry struct {
	count       int
	windowStart time.Time
}

const (
	pairingTTL     = 10 * time.Minute
	pairRateWindow = 10 * time.Second
	pairRateMax    = 5
)

func init() {
	// Cleanup expired pairings every 2 minutes
	go func() {
		ticker := time.NewTicker(2 * time.Minute)
		for range ticker.C {
			now := time.Now()
			pairingMu.Lock()
			for code, p := range pendingPairings {
				if now.After(p.ExpiresAt) {
					delete(pendingPairings, code)
				}
			}
			pairingMu.Unlock()
		}
	}()

	// Cleanup rate limiter entries
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		for range ticker.C {
			cutoff := time.Now().Add(-2 * pairRateWindow)
			pairStatusMu.Lock()
			for ip, entry := range pairStatusReqs {
				if entry.windowStart.Before(cutoff) {
					delete(pairStatusReqs, ip)
				}
			}
			pairStatusMu.Unlock()
		}
	}()
}

func SetupApiRoutes(r *gin.Engine) {
	api := r.Group("/api")
	authApi := r.Group("")

	// GET /api/me
	api.GET("/me", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		agents, _ := db.GetAgentsByUser(user.ID)
		c.JSON(200, buildUserResponse(user, agents))
	})

	// GET /auth/me (alias)
	authApi.GET("/auth/me", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		agents, _ := db.GetAgentsByUser(user.ID)
		c.JSON(200, buildUserResponse(user, agents))
	})

	// GET /api/agents
	api.GET("/agents", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		agents, _ := db.GetAgentsByUser(user.ID)
		// Strip token_hash
		type safeAgent struct {
			ID          string  `json:"id"`
			UserID      string  `json:"user_id"`
			Hostname    string  `json:"hostname"`
			DisplayName *string `json:"display_name"`
			OS          *string `json:"os"`
			Version     *string `json:"version"`
			LastSeenAt  *string `json:"last_seen_at"`
			CreatedAt   string  `json:"created_at"`
		}
		var sanitized []safeAgent
		for _, a := range agents {
			sanitized = append(sanitized, safeAgent{
				ID: a.ID, UserID: a.UserID, Hostname: a.Hostname,
				DisplayName: a.DisplayName, OS: a.OS, Version: a.Version,
				LastSeenAt: a.LastSeenAt, CreatedAt: a.CreatedAt,
			})
		}
		c.JSON(200, gin.H{"agents": sanitized})
	})

	// POST /api/agents/token
	api.POST("/agents/token", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		var body struct {
			Hostname string `json:"hostname"`
			OS       string `json:"os"`
			Version  string `json:"version"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Hostname == "" {
			c.JSON(400, gin.H{"error": "hostname is required"})
			return
		}

		placeholderHash := "pending"
		agent, err := db.RegisterAgent(user.ID, body.Hostname, body.OS, placeholderHash)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to generate agent token"})
			return
		}

		token, err := auth.GenerateAgentToken(user.ID, agent.ID, body.Hostname)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to generate agent token"})
			return
		}

		tokenHash := sha256.Sum256([]byte(token))
		hashHex := hex.EncodeToString(tokenHash[:])
		db.GetDB().Exec("UPDATE agents SET token_hash=?, version=? WHERE id=?", hashHex, body.Version, agent.ID)

		c.JSON(200, gin.H{"agentId": agent.ID, "token": token, "hostname": body.Hostname})
	})

	// DELETE /api/agents/:id
	api.DELETE("/agents/:id", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		agentID := c.Param("id")
		agent, _ := db.GetAgentByID(agentID)
		if agent == nil {
			c.JSON(404, gin.H{"error": "Agent not found"})
			return
		}
		if agent.UserID != user.ID {
			c.JSON(403, gin.H{"error": "Forbidden"})
			return
		}
		db.DeleteLayoutsByAgent(user.ID, agentID)
		db.DeleteAgent(agentID)
		c.JSON(200, gin.H{"ok": true})
	})

	// PATCH /api/agents/:id
	api.PATCH("/agents/:id", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		agentID := c.Param("id")
		agent, _ := db.GetAgentByID(agentID)
		if agent == nil {
			c.JSON(404, gin.H{"error": "Agent not found"})
			return
		}
		if agent.UserID != user.ID {
			c.JSON(403, gin.H{"error": "Forbidden"})
			return
		}
		var body struct {
			DisplayName *string `json:"displayName"`
		}
		c.ShouldBindJSON(&body)
		var trimmed *string
		if body.DisplayName != nil {
			t := (*body.DisplayName)
			if len(t) > 50 {
				t = t[:50]
			}
			trimmed = &t
			if t == "" {
				trimmed = nil
			}
		}
		db.UpdateAgentDisplayName(agentID, trimmed)
		c.JSON(200, gin.H{"ok": true, "displayName": trimmed})
	})

	// --- Agent Pairing Flow ---

	// POST /api/agents/pair
	api.POST("/agents/pair", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		var body struct {
			Hostname string `json:"hostname"`
			OS       string `json:"os"`
			Version  string `json:"version"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Hostname == "" {
			c.JSON(400, gin.H{"error": "hostname is required"})
			return
		}

		code := generatePairingCode()
		pairingMu.Lock()
		attempts := 0
		for _, exists := pendingPairings[code]; exists && attempts < 10; _, exists = pendingPairings[code] {
			code = generatePairingCode()
			attempts++
		}
		pendingPairings[code] = &pendingPairing{
			UserID:    user.ID,
			Hostname:  body.Hostname,
			OS:        body.OS,
			Version:   body.Version,
			Status:    "pending",
			ExpiresAt: time.Now().Add(pairingTTL),
		}
		pairingMu.Unlock()

		fmt.Printf("[api] Pairing code generated: %s for user %s (%s)\n", code, user.ID, body.Hostname)
		c.JSON(200, gin.H{
			"code":      code,
			"pairUrl":   fmt.Sprintf("/pair?code=%s", code),
			"expiresIn": int(pairingTTL.Seconds()),
		})
	})

	// GET /api/agents/pair-status (no auth, rate-limited)
	api.GET("/agents/pair-status", func(c *gin.Context) {
		ip := c.ClientIP()
		if !checkPairRateLimit(ip) {
			c.JSON(429, gin.H{"error": "Too many requests"})
			return
		}
		code := c.Query("code")
		if code == "" {
			c.JSON(400, gin.H{"error": "code is required"})
			return
		}

		pairingMu.Lock()
		pairing, ok := pendingPairings[code]
		if !ok {
			pairingMu.Unlock()
			c.JSON(404, gin.H{"error": "Pairing code not found or expired"})
			return
		}
		if time.Now().After(pairing.ExpiresAt) {
			delete(pendingPairings, code)
			pairingMu.Unlock()
			c.JSON(410, gin.H{"error": "Pairing code has expired"})
			return
		}
		if pairing.Status == "approved" {
			resp := gin.H{"status": "approved", "token": pairing.Token, "agentId": pairing.AgentID}
			delete(pendingPairings, code)
			pairingMu.Unlock()
			c.JSON(200, resp)
			return
		}
		pairingMu.Unlock()
		c.JSON(200, gin.H{"status": "pending"})
	})

	// POST /api/agents/approve
	api.POST("/agents/approve", auth.RequireAuth(), func(c *gin.Context) {
		user := auth.GetUser(c)
		if user == nil {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		var body struct {
			Code string `json:"code"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Code == "" {
			c.JSON(400, gin.H{"error": "code is required"})
			return
		}

		pairingMu.Lock()
		pairing, ok := pendingPairings[body.Code]
		if !ok {
			pairingMu.Unlock()
			c.JSON(404, gin.H{"error": "Pairing code not found or expired"})
			return
		}
		if time.Now().After(pairing.ExpiresAt) {
			delete(pendingPairings, body.Code)
			pairingMu.Unlock()
			c.JSON(410, gin.H{"error": "Pairing code has expired"})
			return
		}
		if pairing.UserID != user.ID {
			pairingMu.Unlock()
			c.JSON(403, gin.H{"error": "This pairing code does not belong to your account"})
			return
		}
		if pairing.Status == "approved" {
			pairingMu.Unlock()
			c.JSON(200, gin.H{"ok": true, "agentId": pairing.AgentID, "message": "Already approved"})
			return
		}
		pairingMu.Unlock()

		// Register agent
		placeholderHash := "pending"
		agent, err := db.RegisterAgent(user.ID, pairing.Hostname, pairing.OS, placeholderHash)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to approve pairing"})
			return
		}

		token, err := auth.GenerateAgentToken(user.ID, agent.ID, pairing.Hostname)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to approve pairing"})
			return
		}

		tokenHash := sha256.Sum256([]byte(token))
		hashHex := hex.EncodeToString(tokenHash[:])
		db.GetDB().Exec("UPDATE agents SET token_hash=?, version=? WHERE id=?", hashHex, pairing.Version, agent.ID)

		pairingMu.Lock()
		pairing.Status = "approved"
		pairing.Token = token
		pairing.AgentID = agent.ID
		pairingMu.Unlock()

		fmt.Printf("[api] Pairing approved: %s -> agent %s for user %s\n", body.Code, agent.ID, user.ID)
		c.JSON(200, gin.H{"ok": true, "agentId": agent.ID})
	})

	// --- Admin Routes ---
	adminApi := api.Group("/admin", auth.RequireAuth(), auth.RequireAdmin())

	// GET /api/admin/users
	adminApi.GET("/users", func(c *gin.Context) {
		users, err := db.ListUsers()
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to list users"})
			return
		}
		type safeUser struct {
			ID          string  `json:"id"`
			Username    string  `json:"username"`
			DisplayName *string `json:"displayName"`
			Role        string  `json:"role"`
			Tier        string  `json:"tier"`
			CreatedAt   string  `json:"createdAt"`
		}
		result := make([]safeUser, 0, len(users))
		for _, u := range users {
			result = append(result, safeUser{
				ID: u.ID, Username: u.Username, DisplayName: u.DisplayName,
				Role: u.Role, Tier: u.Tier, CreatedAt: u.CreatedAt,
			})
		}
		c.JSON(200, gin.H{"users": result})
	})

	// PATCH /api/admin/users/:id
	adminApi.PATCH("/users/:id", func(c *gin.Context) {
		targetID := c.Param("id")
		currentUser := auth.GetUser(c)

		target, err := db.GetUserByID(targetID)
		if err != nil || target == nil {
			c.JSON(404, gin.H{"error": "User not found"})
			return
		}

		var body struct {
			Role *string `json:"role"`
			Tier *string `json:"tier"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request body"})
			return
		}

		// Validate and update role
		if body.Role != nil {
			role := strings.ToLower(*body.Role)
			if role != "admin" && role != "user" {
				c.JSON(400, gin.H{"error": "Invalid role, must be 'admin' or 'user'"})
				return
			}
			// Prevent self-demotion
			if targetID == currentUser.ID && role != "admin" {
				c.JSON(400, gin.H{"error": "Cannot change your own admin role"})
				return
			}
			db.UpdateUserRole(targetID, role)
		}

		// Validate and update tier
		if body.Tier != nil {
			tier := strings.ToLower(*body.Tier)
			if tier != "free" && tier != "pro" && tier != "poweruser" {
				c.JSON(400, gin.H{"error": "Invalid tier, must be 'free', 'pro', or 'poweruser'"})
				return
			}
			db.UpdateUserTier(targetID, tier)
		}

		updated, _ := db.GetUserByID(targetID)
		if updated == nil {
			c.JSON(500, gin.H{"error": "Failed to fetch updated user"})
			return
		}
		c.JSON(200, gin.H{"ok": true, "role": updated.Role, "tier": updated.Tier})
	})
}

func buildUserResponse(user *db.User, agents []db.Agent) gin.H {
	limits := billing.GetTierLimits(user.Tier)
	features := gin.H{
		"maxAgents":        limits.Agents,
		"maxTerminalPanes": limits.TerminalPanes,
		"relay":            limits.Relay,
		"collaboration":    limits.Collaboration,
	}

	agentList := make([]gin.H, 0, len(agents))
	for _, a := range agents {
		agentList = append(agentList, gin.H{
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

	return gin.H{
		"id":       user.ID,
		"username": user.Username,
		"name":     name,
		"login":    user.Username,
		"role":     user.Role,
		"tier":     user.Tier,
		"features": features,
		"agents":   agentList,
	}
}

func generatePairingCode() string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 6)
	rand.Read(b)
	code := make([]byte, 6)
	for i := range code {
		code[i] = chars[int(b[i])%len(chars)]
	}
	return string(code)
}

func checkPairRateLimit(ip string) bool {
	now := time.Now()
	pairStatusMu.Lock()
	defer pairStatusMu.Unlock()
	entry, ok := pairStatusReqs[ip]
	if !ok || now.Sub(entry.windowStart) > pairRateWindow {
		pairStatusReqs[ip] = &pairStatusEntry{count: 1, windowStart: now}
		return true
	}
	entry.count++
	return entry.count <= pairRateMax
}
