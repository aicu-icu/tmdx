package terminal

import (
	"sync"

	"agent/internal/sanitize"
)

type Manager struct {
	ptyManager *PtyManager
	mu         sync.RWMutex
}

func New() *Manager {
	return &Manager{
		ptyManager: NewPtyManager(),
	}
}

func (m *Manager) StopAll() {
	m.ptyManager.DisconnectAll()
}

func (m *Manager) ConnectPty(terminalID string, tmuxSession string, cols, rows int) error {
	return m.ptyManager.Connect(terminalID, tmuxSession, cols, rows)
}

func (m *Manager) GetPtyClient(terminalID string) *PtyClient {
	return m.ptyManager.GetClient(terminalID)
}

func (m *Manager) DisconnectPty(terminalID string) {
	m.ptyManager.Disconnect(terminalID)
}

func EscapeShellArg(arg string) string {
	return sanitize.EscapeShellArg(arg)
}
