package terminal

import (
	"strings"
	"testing"
)

func TestFilterCursorSequences(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "cursor home position",
			input:    "\x1b[HHello World",
			expected: "Hello World",
		},
		{
			name:     "cursor position with row and col",
			input:    "\x1b[5;10HHello World",
			expected: "Hello World",
		},
		{
			name:     "cursor position with f suffix",
			input:    "\x1b[3;5fHello World",
			expected: "Hello World",
		},
		{
			name:     "cursor up",
			input:    "\x1b[2AHello World",
			expected: "Hello World",
		},
		{
			name:     "cursor down",
			input:    "\x1b[3BHello World",
			expected: "Hello World",
		},
		{
			name:     "cursor forward",
			input:    "\x1b[5CHello World",
			expected: "Hello World",
		},
		{
			name:     "cursor back",
			input:    "\x1b[2DHello World",
			expected: "Hello World",
		},
		{
			name:     "cursor save",
			input:    "\x1b[sHello World",
			expected: "Hello World",
		},
		{
			name:     "cursor restore",
			input:    "\x1b[uHello World",
			expected: "Hello World",
		},
		{
			name:     "DEC save cursor",
			input:    "\x1b7Hello World",
			expected: "Hello World",
		},
		{
			name:     "DEC restore cursor",
			input:    "\x1b8Hello World",
			expected: "Hello World",
		},
		{
			name:     "erase display",
			input:    "\x1b[2JHello World",
			expected: "Hello World",
		},
		{
			name:     "erase line",
			input:    "\x1b[KHello World",
			expected: "Hello World",
		},
		{
			name:     "preserve color sequences",
			input:    "\x1b[31mRed Text\x1b[0m",
			expected: "\x1b[31mRed Text\x1b[0m",
		},
		{
			name:     "preserve bold and color",
			input:    "\x1b[1;32mBold Green\x1b[0m",
			expected: "\x1b[1;32mBold Green\x1b[0m",
		},
		{
			name:     "mixed sequences",
			input:    "\x1b[H\x1b[31mRed\x1b[0m\x1b[2A",
			expected: "\x1b[31mRed\x1b[0m",
		},
		{
			name:     "multiple cursor sequences",
			input:    "\x1b[H\x1b[5;10H\x1b[2A\x1b[3BText",
			expected: "Text",
		},
		{
			name:     "plain text unchanged",
			input:    "Hello World\nThis is a test",
			expected: "Hello World\nThis is a test",
		},
		{
			name:     "preserve other escape sequences",
			input:    "\x1b[?25h\x1b[?25l",
			expected: "\x1b[?25h\x1b[?25l",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := filterCursorSequences(tt.input)
			if result != tt.expected {
				t.Errorf("filterCursorSequences() = %q, want %q", result, tt.expected)
			}
		})
	}
}

func TestFilterCursorSequencesRealWorld(t *testing.T) {
	input := "\x1b[H\x1b[2J\x1b[3J\x1b[H\x1b[?25l\x1b[31mRed Text\x1b[0m\x1b[?25h\x1b[5;10HMore Text"
	result := filterCursorSequences(input)

	if strings.Contains(result, "\x1b[H") {
		t.Error("should remove cursor home sequence")
	}
	if strings.Contains(result, "\x1b[2J") {
		t.Error("should remove erase display sequence")
	}
	if strings.Contains(result, "\x1b[5;10H") {
		t.Error("should remove cursor position sequence")
	}
	if !strings.Contains(result, "\x1b[31m") {
		t.Error("should preserve color sequence")
	}
	if !strings.Contains(result, "\x1b[?25l") {
		t.Error("should preserve cursor visibility sequence")
	}
	if !strings.Contains(result, "Red Text") {
		t.Error("should preserve text content")
	}
}
