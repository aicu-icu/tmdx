package sanitize

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// SanitizeIdentifier sanitizes a session/identifier name
func SanitizeIdentifier(name string) (string, error) {
	var sanitized strings.Builder
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			sanitized.WriteRune(r)
		}
	}

	result := sanitized.String()
	if result == "" {
		return "", fmt.Errorf("invalid identifier: must contain alphanumeric, dash, or underscore characters")
	}

	if len(result) > 64 {
		result = result[:64]
	}

	return result, nil
}

// EscapeShellArg escapes a string for safe use in shell commands
func EscapeShellArg(arg string) string {
	return "'" + strings.ReplaceAll(arg, "'", "'\\''") + "'"
}

// ValidatePositiveInt validates that a number is a positive integer within bounds
func ValidatePositiveInt(value, max int) (int, error) {
	if value <= 0 || value > max {
		return 0, fmt.Errorf("invalid number: must be a positive integer up to %d", max)
	}
	return value, nil
}

// ValidateWorkingDirectory validates and resolves a working directory path
func ValidateWorkingDirectory(workingDir string) (string, error) {
	home := os.Getenv("HOME")
	if home == "" {
		home = "/home"
	}

	expandedPath := workingDir
	if strings.HasPrefix(expandedPath, "~") {
		expandedPath = strings.Replace(expandedPath, "~", home, 1)
	}

	// Basic path validation - must be under home or /tmp
	allowedPrefixes := []string{home, "/tmp"}
	for _, prefix := range allowedPrefixes {
		if expandedPath == prefix || strings.HasPrefix(expandedPath, prefix+"/") {
			return expandedPath, nil
		}
	}

	return "", fmt.Errorf("working directory path not allowed: %s", workingDir)
}

// ExpandAndValidatePath expands ~ and validates the resolved path
func ExpandAndValidatePath(p string) (string, error) {
	expanded := ExpandHome(p)
	resolved := filepath.Clean(expanded)
	_, err := ValidateWorkingDirectory(resolved)
	if err != nil {
		return "", err
	}
	return resolved, nil
}

// ExpandHome expands ~ to home directory
func ExpandHome(p string) string {
	if p == "~" || p == "~/" {
		home, _ := os.UserHomeDir()
		return home
	}
	if strings.HasPrefix(p, "~/") {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, p[2:])
	}
	return p
}
