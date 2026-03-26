package config

import (
	"fmt"
	"os/exec"
)

// CheckDeps verifies that required system dependencies are installed.
func CheckDeps() error {
	if _, err := exec.LookPath("tmux"); err != nil {
		return fmt.Errorf("missing dependency: tmux\n  Install with: apt install tmux / brew install tmux")
	}
	if _, err := exec.LookPath("git"); err != nil {
		return fmt.Errorf("missing dependency: git\n  Install with: apt install git / brew install git")
	}
	return nil
}
