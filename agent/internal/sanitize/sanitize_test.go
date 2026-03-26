package sanitize

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSanitizeIdentifier(t *testing.T) {
	tests := []struct {
		input    string
		expected string
		hasError bool
	}{
		{"hello-world", "hello-world", false},
		{"test_123", "test_123", false},
		{"hello world", "helloworld", false},
		{"hello@world!", "helloworld", false},
		{"", "", true},
		{"@@@", "", true},
	}

	for _, test := range tests {
		result, err := SanitizeIdentifier(test.input)
		if test.hasError {
			if err == nil {
				t.Errorf("Expected error for input %q, got nil", test.input)
			}
		} else {
			if err != nil {
				t.Errorf("Unexpected error for input %q: %v", test.input, err)
			}
			if result != test.expected {
				t.Errorf("Expected %q for input %q, got %q", test.expected, test.input, result)
			}
		}
	}
}

func TestEscapeShellArg(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"hello", "'hello'"},
		{"hello world", "'hello world'"},
		{"hello'world", "'hello'\\''world'"},
		{"", "''"},
	}

	for _, test := range tests {
		result := EscapeShellArg(test.input)
		if result != test.expected {
			t.Errorf("Expected %q for input %q, got %q", test.expected, test.input, result)
		}
	}
}

func TestValidatePositiveInt(t *testing.T) {
	tests := []struct {
		value    int
		max      int
		expected int
		hasError bool
	}{
		{10, 100, 10, false},
		{1, 100, 1, false},
		{100, 100, 100, false},
		{0, 100, 0, true},
		{-1, 100, 0, true},
		{101, 100, 0, true},
	}

	for _, test := range tests {
		result, err := ValidatePositiveInt(test.value, test.max)
		if test.hasError {
			if err == nil {
				t.Errorf("Expected error for value %d, max %d", test.value, test.max)
			}
		} else {
			if err != nil {
				t.Errorf("Unexpected error for value %d, max %d: %v", test.value, test.max, err)
			}
			if result != test.expected {
				t.Errorf("Expected %d for value %d, got %d", test.expected, test.value, result)
			}
		}
	}
}

func TestValidateWorkingDirectory(t *testing.T) {
	home := os.Getenv("HOME")
	if home == "" {
		home = "/home"
	}

	tests := []struct {
		input    string
		expected string
		hasError bool
	}{
		{home, home, false},
		{filepath.Join(home, "Documents"), filepath.Join(home, "Documents"), false},
		{"/tmp", "/tmp", false},
		{filepath.Join("/tmp", "test"), filepath.Join("/tmp", "test"), false},
		{"/etc", "", true},
		{"/root", "", true},
	}

	for _, test := range tests {
		result, err := ValidateWorkingDirectory(test.input)
		if test.hasError {
			if err == nil {
				t.Errorf("Expected error for input %q", test.input)
			}
		} else {
			if err != nil {
				t.Errorf("Unexpected error for input %q: %v", test.input, err)
			}
			if result != test.expected {
				t.Errorf("Expected %q for input %q, got %q", test.expected, test.input, result)
			}
		}
	}
}

func TestExpandHome(t *testing.T) {
	home, _ := os.UserHomeDir()

	tests := []struct {
		input    string
		expected string
	}{
		{"~", home},
		{"~/Documents", filepath.Join(home, "Documents")},
		{"/tmp", "/tmp"},
		{"relative/path", "relative/path"},
	}

	for _, test := range tests {
		result := ExpandHome(test.input)
		if result != test.expected {
			t.Errorf("Expected %q for input %q, got %q", test.expected, test.input, result)
		}
	}
}
