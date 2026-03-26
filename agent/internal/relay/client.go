package relay

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"agent/internal/config"
	"agent/internal/protocol"

	"github.com/gorilla/websocket"
)

const (
	initialReconnectDelay = 1000 * time.Millisecond
	maxReconnectDelay     = 30000 * time.Millisecond
	pingTimeout           = 45000 * time.Millisecond
)

// EventHandler is a function that handles events
type EventHandler func(payload interface{})

// Client represents a WebSocket relay client
type Client struct {
	cloudURL         string
	authToken        string
	conn             *websocket.Conn
	reconnectDelay   time.Duration
	reconnectTimer   *time.Timer
	pingTimer        *time.Timer
	authenticated    bool
	intentionalClose bool
	mu               sync.RWMutex
	writeMu          sync.Mutex
	eventHandlers    map[string][]EventHandler
	messageChan      chan protocol.Message
	done             chan struct{}
}

// New creates a new relay client
func New(cloudURL, authToken string) *Client {
	return &Client{
		cloudURL:       cloudURL,
		authToken:      authToken,
		reconnectDelay: initialReconnectDelay,
		eventHandlers:  make(map[string][]EventHandler),
		messageChan:    make(chan protocol.Message, 100),
		done:           make(chan struct{}),
	}
}

// On registers an event handler
func (c *Client) On(event string, handler EventHandler) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.eventHandlers[event] = append(c.eventHandlers[event], handler)
}

// emit triggers all handlers for an event
func (c *Client) emit(event string, payload interface{}) {
	c.mu.RLock()
	handlers := c.eventHandlers[event]
	c.mu.RUnlock()

	for _, handler := range handlers {
		handler(payload)
	}
}

// Connect establishes a WebSocket connection to the cloud relay
func (c *Client) Connect() error {
	url := fmt.Sprintf("%s/agent-ws", c.cloudURL)
	log.Printf("[RelayClient] Connecting to %s...", url)

	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}

	c.mu.Lock()
	c.conn = conn
	c.reconnectDelay = initialReconnectDelay
	c.mu.Unlock()

	log.Println("[RelayClient] Connected to cloud relay")

	// Authenticate
	c.authenticate()

	// Reset ping timer
	c.resetPingTimer()

	// Start message handling goroutine
	go c.readMessages()

	return nil
}

func (c *Client) authenticate() {
	msg := protocol.Message{
		Type: protocol.AgentAuth,
		Payload: map[string]interface{}{
			"token":    c.authToken,
			"hostname": getHostname(),
			"os":       getPlatform(),
			"version":  config.Version,
		},
	}
	c.Send(msg)
}

func (c *Client) handleMessage(msg protocol.Message) {
	switch msg.Type {
	case protocol.AgentAuthOK:
		log.Println("[RelayClient] Authentication successful")
		c.mu.Lock()
		c.authenticated = true
		c.mu.Unlock()
		c.emit("authenticated", msg.Payload)

	case protocol.AgentAuthFail:
		log.Printf("[RelayClient] Authentication failed: %v", msg.Payload)
		c.mu.Lock()
		c.authenticated = false
		c.intentionalClose = true
		c.mu.Unlock()
		c.emit("authFailed", msg.Payload)
		c.conn.Close()

	case protocol.AgentPing:
		pongMsg := protocol.Message{
			Type:    protocol.AgentPong,
			Payload: map[string]interface{}{"timestamp": time.Now().UnixMilli()},
		}
		c.Send(pongMsg)
		c.resetPingTimer()

	default:
		// Forward to message router
		c.emit("message", msg)
	}
}

func (c *Client) readMessages() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[RelayClient] Panic in readMessages: %v", r)
		}
	}()

	for {
		select {
		case <-c.done:
			return
		default:
			_, data, err := c.conn.ReadMessage()
			if err != nil {
				if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
					log.Println("[RelayClient] Connection closed normally")
				} else {
					log.Printf("[RelayClient] Read error: %v", err)
				}
				c.handleDisconnect()
				return
			}

			var msg protocol.Message
			if err := json.Unmarshal(data, &msg); err != nil {
				log.Printf("[RelayClient] Failed to parse message: %v", err)
				continue
			}

			c.handleMessage(msg)
		}
	}
}

func (c *Client) handleDisconnect() {
	c.mu.Lock()
	c.authenticated = false
	intentional := c.intentionalClose
	c.mu.Unlock()

	c.emit("disconnected", nil)

	if !intentional {
		c.scheduleReconnect()
	}
}

func (c *Client) resetPingTimer() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.pingTimer != nil {
		c.pingTimer.Stop()
	}

	c.pingTimer = time.AfterFunc(pingTimeout, func() {
		log.Println("[RelayClient] No ping received in 45s, reconnecting...")
		c.mu.RLock()
		conn := c.conn
		c.mu.RUnlock()

		if conn != nil {
			conn.Close()
		}
	})
}

func (c *Client) scheduleReconnect() {
	c.mu.Lock()
	if c.reconnectTimer != nil {
		c.mu.Unlock()
		return
	}

	delay := c.reconnectDelay
	log.Printf("[RelayClient] Reconnecting in %v...", delay)

	c.reconnectTimer = time.AfterFunc(delay, func() {
		c.mu.Lock()
		c.reconnectTimer = nil
		c.reconnectDelay = min(c.reconnectDelay*2, maxReconnectDelay)
		c.mu.Unlock()

		if err := c.Connect(); err != nil {
			log.Printf("[RelayClient] Reconnect failed: %v", err)
			c.scheduleReconnect()
		}
	})
	c.mu.Unlock()
}

// Send sends a message through the WebSocket connection
func (c *Client) Send(msg protocol.Message) bool {
	c.mu.RLock()
	conn := c.conn
	c.mu.RUnlock()

	if conn == nil {
		return false
	}

	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[RelayClient] Marshal error: %v", err)
		return false
	}

	c.writeMu.Lock()
	err = conn.WriteMessage(websocket.TextMessage, data)
	c.writeMu.Unlock()
	if err != nil {
		log.Printf("[RelayClient] Send error: %v", err)
		return false
	}

	return true
}

// Disconnect closes the WebSocket connection
func (c *Client) Disconnect() {
	c.mu.Lock()
	c.intentionalClose = true

	if c.pingTimer != nil {
		c.pingTimer.Stop()
		c.pingTimer = nil
	}

	if c.reconnectTimer != nil {
		c.reconnectTimer.Stop()
		c.reconnectTimer = nil
	}

	conn := c.conn
	c.mu.Unlock()

	close(c.done)

	if conn != nil {
		conn.Close()
	}
}

// IsConnected returns true if the client is connected and authenticated
func (c *Client) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.conn != nil && c.authenticated
}

// GetMessageChannel returns the message channel
func (c *Client) GetMessageChannel() <-chan protocol.Message {
	return c.messageChan
}

func getHostname() string {
	hostname, err := os.Hostname()
	if err != nil {
		return "unknown"
	}
	return hostname
}

func getPlatform() string {
	return os.Getenv("GOOS")
}

func min(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}
