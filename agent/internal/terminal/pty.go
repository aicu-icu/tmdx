package terminal

import (
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"sync"

	"github.com/creack/pty"
	"golang.org/x/term"
)

type PtyClient struct {
	terminalID  string
	tmuxSession string
	cmd         *exec.Cmd
	ptmx        *os.File
	oldState    *term.State
	outputChan  chan []byte
	errorChan   chan error
	done        chan struct{}
	mu          sync.RWMutex
	connected   bool
}

func NewPtyClient(terminalID, tmuxSession string) *PtyClient {
	return &PtyClient{
		terminalID:  terminalID,
		tmuxSession: tmuxSession,
		outputChan:  make(chan []byte, 100),
		errorChan:   make(chan error, 10),
		done:        make(chan struct{}),
	}
}

func (c *PtyClient) Connect(cols, rows int) error {
	c.cmd = exec.Command("tmux", "attach-session", "-t", c.tmuxSession)

	ptmx, err := pty.StartWithSize(c.cmd, &pty.Winsize{
		Cols: uint16(cols),
		Rows: uint16(rows),
	})
	if err != nil {
		return fmt.Errorf("failed to start pty: %w", err)
	}

	// Set raw mode — matches ttyd behavior.
	// Disables ECHO (input echo), ICANON (line buffering),
	// ISIG (signal chars like Ctrl+C), OPOST (output processing).
	// Without this, the kernel line discipline interferes with
	// tmux I/O, causing output corruption and broken mouse events.
	oldState, err := term.MakeRaw(int(ptmx.Fd()))
	if err != nil {
		ptmx.Close()
		return fmt.Errorf("failed to set raw mode: %w", err)
	}

	c.ptmx = ptmx
	c.oldState = oldState
	c.connected = true

	go c.readOutput()

	log.Printf("[PtyClient] Connected to tmux session %s with size %dx%d", c.tmuxSession, cols, rows)
	return nil
}

func (c *PtyClient) readOutput() {
	buf := make([]byte, 32768)
	for {
		select {
		case <-c.done:
			return
		default:
			n, err := c.ptmx.Read(buf)
			if err != nil {
				if err != io.EOF {
					select {
					case c.errorChan <- err:
					default:
					}
				}
				c.mu.Lock()
				c.connected = false
				c.mu.Unlock()
				return
			}
			if n > 0 {
				encoded := base64.StdEncoding.EncodeToString(buf[:n])
				select {
				case c.outputChan <- []byte(encoded):
				default:
					log.Println("[PtyClient] Output channel full, dropping message")
				}
			}
		}
	}
}

func (c *PtyClient) SendInput(base64Data string) error {
	c.mu.RLock()
	connected := c.connected
	ptmx := c.ptmx
	c.mu.RUnlock()

	if !connected || ptmx == nil {
		return fmt.Errorf("not connected")
	}

	inputData, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return fmt.Errorf("failed to decode input: %w", err)
	}

	_, err = ptmx.Write(inputData)
	if err != nil {
		return fmt.Errorf("failed to write input: %w", err)
	}

	return nil
}

func (c *PtyClient) Resize(cols, rows int) error {
	c.mu.RLock()
	connected := c.connected
	ptmx := c.ptmx
	c.mu.RUnlock()

	if !connected || ptmx == nil {
		return fmt.Errorf("not connected")
	}

	winsize := &pty.Winsize{
		Cols: uint16(cols),
		Rows: uint16(rows),
	}
	return pty.Setsize(ptmx, winsize)
}

func (c *PtyClient) GetOutputChannel() <-chan []byte {
	return c.outputChan
}

func (c *PtyClient) GetErrorChannel() <-chan error {
	return c.errorChan
}

func (c *PtyClient) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.connected
}

func (c *PtyClient) Close() {
	select {
	case <-c.done:
		return
	default:
		close(c.done)
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	// Restore terminal state before closing (if raw mode was set)
	if c.oldState != nil && c.ptmx != nil {
		_ = term.Restore(int(c.ptmx.Fd()), c.oldState)
		c.oldState = nil
	}
	if c.ptmx != nil {
		c.ptmx.Close()
		c.ptmx = nil
	}
	if c.cmd != nil && c.cmd.Process != nil {
		c.cmd.Process.Kill()
		c.cmd.Wait()
	}
	c.connected = false
}

type PtyManager struct {
	clients map[string]*PtyClient
	mu      sync.RWMutex
}

func NewPtyManager() *PtyManager {
	return &PtyManager{
		clients: make(map[string]*PtyClient),
	}
}

func (m *PtyManager) Connect(terminalID, tmuxSession string, cols, rows int) error {
	m.mu.RLock()
	if client, exists := m.clients[terminalID]; exists && client.IsConnected() {
		m.mu.RUnlock()
		return nil
	}
	m.mu.RUnlock()

	client := NewPtyClient(terminalID, tmuxSession)
	if err := client.Connect(cols, rows); err != nil {
		return err
	}

	m.mu.Lock()
	if existing, exists := m.clients[terminalID]; exists && existing.IsConnected() {
		m.mu.Unlock()
		client.Close()
		return nil
	}
	m.clients[terminalID] = client
	m.mu.Unlock()

	return nil
}

func (m *PtyManager) GetClient(terminalID string) *PtyClient {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.clients[terminalID]
}

func (m *PtyManager) Disconnect(terminalID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if client, exists := m.clients[terminalID]; exists {
		client.Close()
		delete(m.clients, terminalID)
	}
}

func (m *PtyManager) DisconnectAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for terminalID, client := range m.clients {
		client.Close()
		delete(m.clients, terminalID)
	}
}

func (m *PtyManager) ListConnections() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	connections := make([]string, 0, len(m.clients))
	for terminalID := range m.clients {
		connections = append(connections, terminalID)
	}
	return connections
}
