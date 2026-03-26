package ws

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"cloud/internal/auth"
	"cloud/internal/db"
	"cloud/internal/utils"
)

// SafeWS wraps a websocket.Conn with a mutex to serialize writes.
type SafeWS struct {
	Conn *websocket.Conn
	mu   sync.Mutex
}

func NewSafeWS(conn *websocket.Conn) *SafeWS {
	return &SafeWS{Conn: conn}
}

func (s *SafeWS) WriteMessage(msgType int, data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.Conn.WriteMessage(msgType, data)
}

func (s *SafeWS) WriteJSON(v interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.Conn.WriteJSON(v)
}

func (s *SafeWS) ReadMessage() (messageType int, p []byte, err error) {
	return s.Conn.ReadMessage()
}

func (s *SafeWS) SetReadLimit(limit int64) {
	s.Conn.SetReadLimit(limit)
}

func (s *SafeWS) Close() error {
	return s.Conn.Close()
}

// AgentInfo holds the connection state for a connected agent.
type AgentInfo struct {
	WS          *SafeWS
	Hostname    string
	DisplayName *string
	OS          string
	Version     string
	CreatedAt   string
	Replaced    bool
}

// Relay manages all WebSocket connections.
type Relay struct {
	mu           sync.RWMutex
	UserAgents   map[string]map[string]*AgentInfo    // userID -> agentID -> AgentInfo
	UserBrowsers map[string]map[*SafeWS]*BrowserInfo // userID -> ws -> BrowserInfo

	LatestAgentVersion string

	// Browser WS upgrader
	browserUpgrader websocket.Upgrader
	// Agent WS upgrader
	agentUpgrader websocket.Upgrader
}

type BrowserInfo struct {
	ConnectedAt  int64
	LastActivity int64
	UserID       string
}

func NewRelay() *Relay {
	return &Relay{
		UserAgents:   make(map[string]map[string]*AgentInfo),
		UserBrowsers: make(map[string]map[*SafeWS]*BrowserInfo),
		browserUpgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin:     func(r *http.Request) bool { return true },
		},
		agentUpgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin:     func(r *http.Request) bool { return true },
		},
	}
}

// Setup registers the WebSocket routes on the Gin engine.
func (r *Relay) Setup(engine *gin.Engine) {
	// GET /ws - Browser WebSocket
	engine.GET("/ws", func(c *gin.Context) {
		userID := r.authenticateBrowser(c)
		if userID == "" {
			c.Status(401)
			return
		}

		ws, err := r.browserUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			fmt.Printf("[ws] Browser upgrade error: %v\n", err)
			return
		}

		safeWS := NewSafeWS(ws)
		safeWS.SetReadLimit(1024 * 1024) // 1 MB

		r.handleBrowserConnection(safeWS, userID)
	})

	// GET /agent-ws - Agent WebSocket
	engine.GET("/agent-ws", func(c *gin.Context) {
		ws, err := r.agentUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			fmt.Printf("[ws] Agent upgrade error: %v\n", err)
			return
		}

		safeWS := NewSafeWS(ws)
		safeWS.SetReadLimit(1024 * 1024) // 1 MB

		r.handleAgentConnection(safeWS)
	})

	// Start heartbeat goroutine
	go r.heartbeat()
}

func (r *Relay) authenticateBrowser(c *gin.Context) string {
	// Try access token
	accessToken, _ := c.Cookie("tc_access")
	if accessToken != "" {
		claims, err := auth.VerifyToken(accessToken)
		if err == nil {
			user, _ := db.GetUserByID(claims.Sub)
			if user != nil {
				return user.ID
			}
		}
	}

	// Try refresh token
	refreshToken, _ := c.Cookie("tc_refresh")
	if refreshToken != "" {
		claims, err := auth.VerifyToken(refreshToken)
		if err == nil && claims.Type == "refresh" {
			user, _ := db.GetUserByID(claims.Sub)
			if user != nil {
				return user.ID
			}
		}
	}

	return ""
}

func (r *Relay) broadcastToBrowsers(userID string, message interface{}) {
	data, err := json.Marshal(message)
	if err != nil {
		return
	}

	r.mu.RLock()
	browsers, ok := r.UserBrowsers[userID]
	if !ok || len(browsers) == 0 {
		r.mu.RUnlock()
		return
	}
	// Copy connections to avoid holding lock during writes
	conns := make([]*SafeWS, 0, len(browsers))
	for ws := range browsers {
		conns = append(conns, ws)
	}
	r.mu.RUnlock()

	for _, ws := range conns {
		if err := ws.WriteMessage(websocket.TextMessage, data); err != nil {
			// Connection is dead, it will be cleaned up by the read loop
		}
	}
}

func (r *Relay) getOnlineAgents(userID string) []map[string]interface{} {
	r.mu.RLock()
	defer r.mu.RUnlock()

	agents := r.UserAgents[userID]
	if agents == nil {
		return []map[string]interface{}{}
	}

	type agentSort struct {
		agentID   string
		createdAt string
		info      *AgentInfo
	}

	var sorted []agentSort
	for id, info := range agents {
		sorted = append(sorted, agentSort{agentID: id, createdAt: info.CreatedAt, info: info})
	}

	// Sort by creation date
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[i].createdAt > sorted[j].createdAt {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}

	result := make([]map[string]interface{}, 0, len(sorted))
	for _, s := range sorted {
		m := map[string]interface{}{
			"agentId":   s.agentID,
			"hostname":  s.info.Hostname,
			"os":        s.info.OS,
			"version":   s.info.Version,
			"online":    true,
			"createdAt": s.info.CreatedAt,
		}
		if s.info.DisplayName != nil {
			m["displayName"] = *s.info.DisplayName
		}
		result = append(result, m)
	}
	return result
}

func (r *Relay) heartbeat() {
	ticker := time.NewTicker(30 * time.Second)
	for range ticker.C {
		r.mu.RLock()
		for _, agents := range r.UserAgents {
			for _, info := range agents {
				msg := map[string]string{"type": "agent:ping"}
				data, _ := json.Marshal(msg)
				info.WS.WriteMessage(websocket.TextMessage, data)
			}
		}
		r.mu.RUnlock()
	}
}

func strPtr(s string) *string { return &s }

// RecordRelayBatch records relay message counts (called periodically)
var relayCounters = make(map[string]int)
var relayMu sync.Mutex

func init() {
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		for range ticker.C {
			relayMu.Lock()
			for uid, count := range relayCounters {
				if count > 0 {
					u := uid
					db.RecordEvent("ws.relay", &u, map[string]interface{}{"count": count})
				}
			}
			relayCounters = make(map[string]int)
			relayMu.Unlock()
		}
	}()
}

func incrementRelayCounter(userID string) {
	relayMu.Lock()
	relayCounters[userID]++
	relayMu.Unlock()
}

// Version checking
func isVersionOutdated(current, latest string) bool {
	return utils.IsVersionOutdated(current, latest)
}
