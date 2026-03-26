package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNew(t *testing.T) {
	cfg := New()

	if cfg.Version != Version {
		t.Errorf("Expected version %s, got %s", Version, cfg.Version)
	}

	homeDir, _ := os.UserHomeDir()
	expectedConfigDir := filepath.Join(homeDir, ".tmdx")

	if cfg.ConfigDir != expectedConfigDir {
		t.Errorf("Expected config dir %s, got %s", expectedConfigDir, cfg.ConfigDir)
	}

	if cfg.DataDir != expectedConfigDir {
		t.Errorf("Expected data dir %s, got %s", expectedConfigDir, cfg.DataDir)
	}
}

func TestGetPlatform(t *testing.T) {
	platform := GetPlatform()
	if platform == "" {
		t.Error("Platform should not be empty")
	}
}
