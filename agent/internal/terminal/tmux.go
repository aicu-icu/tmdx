package terminal

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"agent/internal/sanitize"
	metrics "agent/internal/services"

	"github.com/google/uuid"
)

// Terminal represents a tmux terminal
type Terminal struct {
	ID          string           `json:"id"`
	WorkingDir  string           `json:"workingDir"`
	Device      string           `json:"device"`
	TmuxSession string           `json:"tmuxSession"`
	Position    metrics.Position `json:"position"`
	Size        metrics.Size     `json:"size"`
	FullOutput  string           `json:"-"`
}

// TmuxService manages tmux sessions
type TmuxService struct {
	terminals    map[string]*Terminal
	storage      *metrics.Storage
	mu           sync.RWMutex
	nextPosition metrics.Position
	hostname     string
}

// NewTmuxService creates a new TmuxService
func NewTmuxService(storage *metrics.Storage) *TmuxService {
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "localhost"
	}

	return &TmuxService{
		terminals:    make(map[string]*Terminal),
		storage:      storage,
		nextPosition: metrics.Position{X: 50, Y: 50},
		hostname:     hostname,
	}
}

func (ts *TmuxService) getNextPosition() metrics.Position {
	pos := ts.nextPosition
	ts.nextPosition.X += 50
	ts.nextPosition.Y += 30
	if ts.nextPosition.X > 400 {
		ts.nextPosition.X = 50
	}
	if ts.nextPosition.Y > 300 {
		ts.nextPosition.Y = 50
	}
	return pos
}

// DiscoverExistingTerminals discovers existing tmux sessions
func (ts *TmuxService) DiscoverExistingTerminals() ([]*Terminal, error) {
	savedTerminals, err := ts.storage.LoadTerminalState()
	if err != nil {
		log.Printf("[TmuxService] Error loading terminal state: %v", err)
		savedTerminals = []metrics.TerminalState{}
	}

	// Set scroll speed
	exec.Command("tmux", "bind-key", "-T", "copy-mode", "WheelUpPane", "send-keys", "-X", "-N", "2", "scroll-up").Run()
	exec.Command("tmux", "bind-key", "-T", "copy-mode", "WheelDownPane", "send-keys", "-X", "-N", "2", "scroll-down").Run()
	exec.Command("tmux", "bind-key", "-T", "copy-mode-vi", "WheelUpPane", "send-keys", "-X", "-N", "2", "scroll-up").Run()
	exec.Command("tmux", "bind-key", "-T", "copy-mode-vi", "WheelDownPane", "send-keys", "-X", "-N", "2", "scroll-down").Run()

	// List tmux sessions
	cmd := exec.Command("tmux", "list-sessions", "-F", "#{session_name}")
	output, err := cmd.Output()
	if err != nil {
		// No sessions
		return []*Terminal{}, nil
	}

	sessions := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, session := range sessions {
		if !strings.HasPrefix(session, "tmdx-") {
			continue
		}

		var savedTerminal *metrics.TerminalState
		for _, st := range savedTerminals {
			if st.TmuxSession == session {
				savedTerminal = &st
				break
			}
		}

		id := strings.TrimPrefix(session, "tmdx-")
		if savedTerminal != nil {
			id = savedTerminal.ID
		}

		position := metrics.Position{X: 50, Y: 50}
		size := metrics.Size{Width: 600, Height: 400}
		workingDir := "~"

		if savedTerminal != nil {
			position = savedTerminal.Position
			size = savedTerminal.Size
			workingDir = savedTerminal.WorkingDir
		}

		terminal := &Terminal{
			ID:          id,
			WorkingDir:  workingDir,
			Device:      ts.hostname,
			TmuxSession: session,
			Position:    position,
			Size:        size,
		}

		ts.mu.Lock()
		ts.terminals[id] = terminal
		ts.mu.Unlock()

		// Configure tmux session
		exec.Command("tmux", "set-option", "-t", session, "status", "off").Run()
		exec.Command("tmux", "set-option", "-t", session, "mouse", "off").Run()
		exec.Command("tmux", "set-option", "-t", session, "history-limit", "50000").Run()
	}

	ts.PersistState()

	ts.mu.RLock()
	terminals := make([]*Terminal, 0, len(ts.terminals))
	for _, t := range ts.terminals {
		terminals = append(terminals, t)
	}
	ts.mu.RUnlock()

	return terminals, nil
}

// PersistState saves terminal state to disk
func (ts *TmuxService) PersistState() {
	ts.mu.RLock()
	terminalList := make([]metrics.TerminalState, 0, len(ts.terminals))
	for _, t := range ts.terminals {
		terminalList = append(terminalList, metrics.TerminalState{
			ID:          t.ID,
			WorkingDir:  t.WorkingDir,
			Device:      t.Device,
			TmuxSession: t.TmuxSession,
			Position:    t.Position,
			Size:        t.Size,
		})
	}
	ts.mu.RUnlock()

	ts.storage.SaveTerminalState(terminalList)
}

// ListTerminals returns all terminals
func (ts *TmuxService) ListTerminals() []*Terminal {
	ts.mu.RLock()
	defer ts.mu.RUnlock()

	terminals := make([]*Terminal, 0, len(ts.terminals))
	for _, t := range ts.terminals {
		terminals = append(terminals, t)
	}
	return terminals
}

// CreateTerminal creates a new tmux terminal
func (ts *TmuxService) CreateTerminal(workingDir string, position *metrics.Position, size *metrics.Size) (*Terminal, error) {
	id := uuid.New().String()
	sessionName := fmt.Sprintf("tmdx-%s", id)

	validatedDir, err := sanitize.ValidateWorkingDirectory(workingDir)
	if err != nil {
		return nil, err
	}

	// Create tmux session
	cmd := exec.Command("tmux", "new-session", "-d", "-s", sessionName, "-c", validatedDir)
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("failed to create tmux session: %w", err)
	}

	// Configure tmux session
	exec.Command("tmux", "set-option", "-t", sessionName, "status", "off").Run()
	exec.Command("tmux", "set-option", "-t", sessionName, "history-limit", "50000").Run()

	if position == nil {
		pos := ts.getNextPosition()
		position = &pos
	}
	if size == nil {
		size = &metrics.Size{Width: 600, Height: 400}
	}

	terminal := &Terminal{
		ID:          id,
		WorkingDir:  workingDir,
		Device:      ts.hostname,
		TmuxSession: sessionName,
		Position:    *position,
		Size:        *size,
	}

	ts.mu.Lock()
	ts.terminals[id] = terminal
	ts.mu.Unlock()

	ts.PersistState()

	return terminal, nil
}

// ResumeTerminal resumes a terminal with a new tmux session
func (ts *TmuxService) ResumeTerminal(terminalID, workingDir, command string) (*Terminal, error) {
	sessionName := fmt.Sprintf("tmdx-%s", terminalID)

	validatedDir, err := sanitize.ValidateWorkingDirectory(workingDir)
	if err != nil {
		return nil, err
	}

	// Kill old session if exists
	exec.Command("tmux", "kill-session", "-t", sessionName).Run()

	// Create fresh session
	cmd := exec.Command("tmux", "new-session", "-d", "-s", sessionName, "-c", validatedDir)
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("failed to create tmux session: %w", err)
	}

	// Configure tmux session
	exec.Command("tmux", "set-option", "-t", sessionName, "status", "off").Run()
	exec.Command("tmux", "set-option", "-t", sessionName, "history-limit", "50000").Run()

	// Run command if provided
	if command != "" {
		exec.Command("tmux", "send-keys", "-t", sessionName, command, "Enter").Run()
	}

	terminal := &Terminal{
		ID:          terminalID,
		WorkingDir:  workingDir,
		Device:      ts.hostname,
		TmuxSession: sessionName,
		Position:    metrics.Position{X: 0, Y: 0},
		Size:        metrics.Size{Width: 600, Height: 400},
	}

	ts.mu.Lock()
	ts.terminals[terminalID] = terminal
	ts.mu.Unlock()

	ts.PersistState()

	return terminal, nil
}

// CloseTerminal closes a terminal and kills its tmux session
func (ts *TmuxService) CloseTerminal(terminalID string) error {
	ts.mu.Lock()
	terminal, exists := ts.terminals[terminalID]
	if exists {
		delete(ts.terminals, terminalID)
	}
	ts.mu.Unlock()

	if !exists {
		return fmt.Errorf("terminal not found")
	}

	exec.Command("tmux", "kill-session", "-t", terminal.TmuxSession).Run()
	ts.storage.RemoveTerminalFromStorage(terminalID)

	return nil
}

// GetTerminal returns a terminal by ID
func (ts *TmuxService) GetTerminal(terminalID string) *Terminal {
	ts.mu.RLock()
	defer ts.mu.RUnlock()
	return ts.terminals[terminalID]
}

// CaptureOutput captures the output of a terminal
func (ts *TmuxService) CaptureOutput(terminalID string) (string, error) {
	ts.mu.RLock()
	terminal, exists := ts.terminals[terminalID]
	ts.mu.RUnlock()

	if !exists {
		return "", fmt.Errorf("terminal not found")
	}

	cmd := exec.Command("tmux", "capture-pane", "-t", terminal.TmuxSession, "-p", "-S", "-500")
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}

	return string(output), nil
}

// filterCursorSequences removes cursor positioning escape sequences from terminal output.
// These sequences cause display corruption when history is injected into xterm.js
// because they move the cursor position, causing new output to overwrite history content.
//
// Filtered sequences:
//   - CSI cursor positioning: ESC [ <params> H/f (cursor position)
//   - CSI cursor movement: ESC [ <n> A/B/C/D (up/down/forward/back)
//   - CSI cursor save/restore: ESC [ s/u
//   - CSI erase: ESC [ <n> J/K (erase display/line - can corrupt scrollback)
//   - DEC save/restore: ESC 7/8
func filterCursorSequences(data string) string {
	re := regexp.MustCompile(`\x1b\[(\d*;?\d*)?[Hf]|\x1b\[\d*[ABCD]|\x1b\[[su]|\x1b\[\d*[JK]|\x1b[78]`)
	return re.ReplaceAllString(data, "")
}

// CaptureHistory captures the full history of a terminal
func (ts *TmuxService) CaptureHistory(terminalID string) (string, error) {
	ts.mu.RLock()
	terminal, exists := ts.terminals[terminalID]
	ts.mu.RUnlock()

	if !exists {
		return "", nil
	}

	// Check if the pane is in alternate screen mode (vim, nano, htop, etc.)
	// TUI apps don't need scrollback history — skip capture entirely to
	// prevent stale scrollback that breaks scroll behavior after reattach.
	altCmd := exec.Command("tmux", "display-message", "-t", terminal.TmuxSession, "-p", "#{alternate_on}")
	altOutput, err := altCmd.Output()
	if err == nil && strings.TrimSpace(string(altOutput)) == "1" {
		return "", nil
	}

	cmd := exec.Command("tmux", "capture-pane", "-e", "-t", terminal.TmuxSession, "-p", "-S", "-", "-E", "-1")

	output, err := cmd.Output()
	if err != nil {
		return "", err
	}

	// Filter cursor positioning sequences to prevent display corruption
	// when history is injected into xterm.js. These sequences move the
	// cursor position, causing new output to overwrite history content.
	return filterCursorSequences(string(output)), nil
}

// ResizeTerminal resizes a terminal
func (ts *TmuxService) ResizeTerminal(terminalID string, cols, rows int, pixelWidth, pixelHeight *int) error {
	ts.mu.RLock()
	terminal, exists := ts.terminals[terminalID]
	ts.mu.RUnlock()

	if !exists {
		return fmt.Errorf("terminal not found")
	}

	validCols, err := sanitize.ValidatePositiveInt(cols, 500)
	if err != nil {
		return err
	}
	validRows, err := sanitize.ValidatePositiveInt(rows, 500)
	if err != nil {
		return err
	}

	cmd := exec.Command("tmux", "resize-pane", "-t", terminal.TmuxSession,
		"-x", fmt.Sprintf("%d", validCols),
		"-y", fmt.Sprintf("%d", validRows))
	cmd.Run()

	// Persist pixel dimensions if provided
	if pixelWidth != nil && pixelHeight != nil {
		ts.mu.Lock()
		terminal.Size = metrics.Size{Width: *pixelWidth, Height: *pixelHeight}
		ts.mu.Unlock()
		ts.PersistState()
	}

	return nil
}

// ForceRedraw forces a terminal redraw
func (ts *TmuxService) ForceRedraw(terminalID string, cols, rows int) error {
	ts.mu.RLock()
	terminal, exists := ts.terminals[terminalID]
	ts.mu.RUnlock()

	if !exists || cols == 0 || rows == 0 {
		return nil
	}

	validCols, _ := sanitize.ValidatePositiveInt(cols, 500)
	validRows, _ := sanitize.ValidatePositiveInt(rows, 500)

	exec.Command("tmux", "resize-pane", "-t", terminal.TmuxSession,
		"-x", fmt.Sprintf("%d", validCols),
		"-y", fmt.Sprintf("%d", validRows+1)).Run()

	exec.Command("tmux", "resize-pane", "-t", terminal.TmuxSession,
		"-x", fmt.Sprintf("%d", validCols),
		"-y", fmt.Sprintf("%d", validRows)).Run()

	return nil
}

// ScrollTerminal scrolls a terminal
func (ts *TmuxService) ScrollTerminal(terminalID string, lines int) {
	ts.mu.RLock()
	terminal, exists := ts.terminals[terminalID]
	ts.mu.RUnlock()

	if !exists {
		return
	}

	direction := "scroll-up"
	if lines > 0 {
		direction = "scroll-down"
	}

	count := abs(lines)
	if count > 15 {
		count = 15
	}

	exec.Command("tmux", "copy-mode", "-e", "-t", terminal.TmuxSession).Run()
	for i := 0; i < count; i++ {
		exec.Command("tmux", "send-keys", "-t", terminal.TmuxSession, "-X", direction).Run()
	}
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// GetProcessInfo returns process info for a terminal
func (ts *TmuxService) GetProcessInfo(terminalID string) map[string]interface{} {
	ts.mu.RLock()
	terminal, exists := ts.terminals[terminalID]
	ts.mu.RUnlock()

	if !exists {
		return nil
	}

	cmd := exec.Command("tmux", "display-message", "-t", terminal.TmuxSession, "-p", "#{pane_current_command}")
	output, err := cmd.Output()
	if err != nil {
		return nil
	}

	command := strings.TrimSpace(string(output))
	return map[string]interface{}{
		"command": command,
	}
}

// GetAllProcessInfo returns process info for all terminals
func (ts *TmuxService) GetAllProcessInfo() map[string]interface{} {
	ts.mu.RLock()
	terminals := make([]*Terminal, 0, len(ts.terminals))
	for _, t := range ts.terminals {
		terminals = append(terminals, t)
	}
	ts.mu.RUnlock()

	results := make(map[string]interface{})
	for _, terminal := range terminals {
		info := ts.GetProcessInfo(terminal.ID)
		if info != nil {
			results[terminal.ID] = info
		}
	}
	return results
}

// BatchGetSessionInfo batch-fetches session info for all tc2 terminals
func (ts *TmuxService) BatchGetSessionInfo() map[string]map[string]interface{} {
	results := make(map[string]map[string]interface{})

	cmd := exec.Command("tmux", "list-panes", "-a",
		"-F", "#{session_name}|#{pane_current_command}|#{pane_current_path}|#{pane_active}|#{pane_pid}|#{alternate_on}")

	output, err := cmd.Output()
	if err != nil {
		return results
	}

	ts.mu.RLock()
	terminalMap := make(map[string]*Terminal)
	for _, t := range ts.terminals {
		terminalMap[t.TmuxSession] = t
	}
	ts.mu.RUnlock()

	for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
		if !strings.HasPrefix(line, "tmdx-") {
			continue
		}

		parts := strings.Split(line, "|")
		if len(parts) < 6 {
			continue
		}

		session := parts[0]
		command := parts[1]
		cwd := parts[2]
		active := parts[3]
		pid := parts[4]
		altOn := parts[5]

		if active != "1" {
			continue
		}

		if _, exists := terminalMap[session]; !exists {
			continue
		}

		results[strings.TrimPrefix(session, "tmdx-")] = map[string]interface{}{
			"session":     session,
			"command":     command,
			"cwd":         cwd,
			"pid":         pid,
			"alternateOn": altOn == "1",
		}
	}

	return results
}

// IsTerminal checks if a file is a terminal
func IsTerminal(f *os.File) bool {
	fi, err := f.Stat()
	if err != nil {
		return false
	}
	return (fi.Mode() & os.ModeCharDevice) != 0
}

// ReadPassword reads a password from stdin
func ReadPassword() (string, error) {
	// Check if stdin is a terminal
	if !IsTerminal(os.Stdin) {
		reader := bufio.NewReader(os.Stdin)
		line, err := reader.ReadString('\n')
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(line), nil
	}

	// For actual terminal, we'd need to disable echo
	// For simplicity, just read the line
	reader := bufio.NewReader(os.Stdin)
	line, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(line), nil
}

// GetHomeDir returns the user's home directory
func GetHomeDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return os.TempDir()
	}
	return home
}

// ExpandPath expands ~ in path
func ExpandPath(path string) string {
	if strings.HasPrefix(path, "~/") {
		return filepath.Join(GetHomeDir(), path[2:])
	}
	if path == "~" {
		return GetHomeDir()
	}
	return path
}

// SendInput sends input to a tmux session
func (ts *TmuxService) SendInput(terminalID string, input string) {
	ts.mu.RLock()
	terminal, exists := ts.terminals[terminalID]
	ts.mu.RUnlock()

	if !exists {
		log.Printf("[TmuxService] Terminal not found for input: %s", terminalID[:8])
		return
	}

	// Escape special characters for tmux send-keys
	// Use literal mode to preserve exact input
	escapedInput := strings.ReplaceAll(input, "'", "'\\''")

	// Send keys to tmux session
	cmd := exec.Command("tmux", "send-keys", "-t", terminal.TmuxSession, "-l", escapedInput)
	if err := cmd.Run(); err != nil {
		log.Printf("[TmuxService] Failed to send input to %s: %v", terminalID[:8], err)
	}
}

// SendSpecialKey sends a special key (like Enter, Backspace, etc.) to a tmux session
func (ts *TmuxService) SendSpecialKey(terminalID string, key string) {
	ts.mu.RLock()
	terminal, exists := ts.terminals[terminalID]
	ts.mu.RUnlock()

	if !exists {
		log.Printf("[TmuxService] Terminal not found for key: %s", terminalID[:8])
		return
	}

	// Send special key to tmux session
	cmd := exec.Command("tmux", "send-keys", "-t", terminal.TmuxSession, key)
	if err := cmd.Run(); err != nil {
		log.Printf("[TmuxService] Failed to send key to %s: %v", terminalID[:8], err)
	}
}
