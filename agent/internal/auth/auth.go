package auth

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// ConfigData represents the stored configuration structure
type ConfigData struct {
	Token    string  `json:"token,omitempty"`
	CloudURL *string `json:"cloudUrl,omitempty"`
	SavedAt  string  `json:"savedAt,omitempty"`
}

// Manager handles authentication token operations
type Manager struct {
	configDir string
	tokenFile string
}

// New creates a new auth Manager
func New(configDir string) *Manager {
	return &Manager{
		configDir: configDir,
		tokenFile: filepath.Join(configDir, "agent.json"),
	}
}

// LoadToken loads the authentication token from disk
func (m *Manager) LoadToken() (string, error) {
	config, err := m.loadConfig()
	if err != nil {
		return "", err
	}
	return config.Token, nil
}

// LoadCloudURL loads the cloud URL from disk
func (m *Manager) LoadCloudURL() (string, error) {
	config, err := m.loadConfig()
	if err != nil {
		return "", err
	}
	if config.CloudURL == nil {
		return "", nil
	}
	return *config.CloudURL, nil
}

func (m *Manager) loadConfig() (*ConfigData, error) {
	if _, err := os.Stat(m.tokenFile); os.IsNotExist(err) {
		return &ConfigData{}, nil
	}

	data, err := os.ReadFile(m.tokenFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var config ConfigData
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	return &config, nil
}

// SaveConfig saves the token and cloud URL to disk
func (m *Manager) SaveConfig(token, cloudURL string) error {
	if err := m.ensureConfigDir(); err != nil {
		return fmt.Errorf("failed to create config dir: %w", err)
	}

	config := ConfigData{
		SavedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if token != "" {
		config.Token = token
	}
	if cloudURL != "" {
		config.CloudURL = &cloudURL
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(m.tokenFile, data, 0600); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

// ClearToken removes the stored authentication token
func (m *Manager) ClearToken() error {
	if _, err := os.Stat(m.tokenFile); os.IsNotExist(err) {
		return nil
	}
	return os.Remove(m.tokenFile)
}

func (m *Manager) ensureConfigDir() error {
	if _, err := os.Stat(m.configDir); os.IsNotExist(err) {
		return os.MkdirAll(m.configDir, 0755)
	}
	return nil
}

// GetConfigDir returns the config directory path
func (m *Manager) GetConfigDir() string {
	return m.configDir
}
