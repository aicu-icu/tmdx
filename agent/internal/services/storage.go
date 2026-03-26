package metrics

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// TerminalState represents a stored terminal
type TerminalState struct {
	ID          string   `json:"id"`
	WorkingDir  string   `json:"workingDir"`
	Device      string   `json:"device"`
	TmuxSession string   `json:"tmuxSession"`
	Position    Position `json:"position"`
	Size        Size     `json:"size"`
}

// Position represents x,y coordinates
type Position struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// Size represents width and height
type Size struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

// Storage handles persistent storage operations
type Storage struct {
	dataDir         string
	terminalsFile   string
	filePanesFile   string
	notesFile       string
	gitGraphsFile   string
	iframesFile     string
	folderPanesFile string
}

// New creates a new Storage instance
func New(dataDir string) *Storage {
	return &Storage{
		dataDir:         dataDir,
		terminalsFile:   filepath.Join(dataDir, "terminals.json"),
		filePanesFile:   filepath.Join(dataDir, "file-panes.json"),
		notesFile:       filepath.Join(dataDir, "notes.json"),
		gitGraphsFile:   filepath.Join(dataDir, "git-graphs.json"),
		iframesFile:     filepath.Join(dataDir, "iframes.json"),
		folderPanesFile: filepath.Join(dataDir, "folder-panes.json"),
	}
}

func (s *Storage) ensureDataDir() error {
	if _, err := os.Stat(s.dataDir); os.IsNotExist(err) {
		return os.MkdirAll(s.dataDir, 0755)
	}
	return nil
}

// LoadTerminalState loads terminal state from disk
func (s *Storage) LoadTerminalState() ([]TerminalState, error) {
	if err := s.ensureDataDir(); err != nil {
		return nil, err
	}

	if _, err := os.Stat(s.terminalsFile); os.IsNotExist(err) {
		return []TerminalState{}, nil
	}

	data, err := os.ReadFile(s.terminalsFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read terminals file: %w", err)
	}

	var state struct {
		Terminals []TerminalState `json:"terminals"`
		Version   int             `json:"version"`
	}
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, fmt.Errorf("failed to parse terminals file: %w", err)
	}

	return state.Terminals, nil
}

// SaveTerminalState saves terminal state to disk
func (s *Storage) SaveTerminalState(terminals []TerminalState) error {
	if err := s.ensureDataDir(); err != nil {
		return err
	}

	state := struct {
		Terminals []TerminalState `json:"terminals"`
		Version   int             `json:"version"`
	}{
		Terminals: terminals,
		Version:   1,
	}

	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal terminals: %w", err)
	}

	return os.WriteFile(s.terminalsFile, data, 0644)
}

// RemoveTerminalFromStorage removes a terminal from storage
func (s *Storage) RemoveTerminalFromStorage(terminalID string) error {
	terminals, err := s.LoadTerminalState()
	if err != nil {
		return err
	}

	filtered := make([]TerminalState, 0, len(terminals))
	for _, t := range terminals {
		if t.ID != terminalID {
			filtered = append(filtered, t)
		}
	}

	return s.SaveTerminalState(filtered)
}

// Generic JSON storage helpers

type storageState struct {
	Data    interface{} `json:"data"`
	Version int         `json:"version"`
}

// LoadJSON loads JSON data from a file
func (s *Storage) LoadJSON(filename string, target interface{}) error {
	if err := s.ensureDataDir(); err != nil {
		return err
	}

	filePath := filepath.Join(s.dataDir, filename)
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return nil
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return err
	}

	return json.Unmarshal(data, target)
}

// SaveJSON saves data to a JSON file
func (s *Storage) SaveJSON(filename string, data interface{}) error {
	if err := s.ensureDataDir(); err != nil {
		return err
	}

	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}

	filePath := filepath.Join(s.dataDir, filename)
	return os.WriteFile(filePath, jsonData, 0644)
}
