package config

import (
	"os"
	"path/filepath"
	"runtime"
)

// Version set via -ldflags at build time
var Version = "dev"

// Config holds agent configuration
type Config struct {
	ConfigDir string
	DataDir   string
	Version   string
}

// New creates a new Config with defaults
func New() *Config {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = os.TempDir()
	}

	configDir := filepath.Join(homeDir, ".tmdx")

	return &Config{
		ConfigDir: configDir,
		DataDir:   configDir,
		Version:   Version,
	}
}

// GetPlatform returns the current OS platform
func GetPlatform() string {
	return runtime.GOOS
}
