package router

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"agent/internal/config"
	"agent/internal/protocol"
	"agent/internal/sanitize"
	metrics "agent/internal/services"
	"agent/internal/terminal"
	"agent/internal/update"
)

const maxFileSize = 1 * 1024 * 1024

func isBinary(data []byte) bool {
	return bytes.Contains(data, []byte{0})
}

// SendFunc is a function that sends messages to the relay
type SendFunc func(msgType string, payload interface{}, extra map[string]interface{})

// Router handles message routing
type Router struct {
	sendToRelay           SendFunc
	tmuxService           *terminal.TmuxService
	terminalManager       *terminal.Manager
	storage               *metrics.Storage
	hostname              string
	wiredTerminals        map[string]bool
	mu                    sync.RWMutex
	usageCache            interface{}
	usageCacheTime        int64
	usageCacheTTL         int64
	filePanesCache        []FilePane
	notesCache            []Note
	gitGraphsCache        []GitGraph
	iframesCache          []Iframe
	folderPanesCache      []FolderPane
	pendingHistoryCapture map[string][][]byte // terminalId -> buffered output during history capture
	pendingMu             sync.Mutex
}

// FilePane represents a file pane
type FilePane struct {
	ID        string           `json:"id"`
	FileName  string           `json:"fileName"`
	FilePath  string           `json:"filePath,omitempty"`
	Device    string           `json:"device"`
	Content   string           `json:"content,omitempty"`
	Position  metrics.Position `json:"position"`
	Size      metrics.Size     `json:"size"`
	CreatedAt string           `json:"createdAt"`
}

// Note represents a note
type Note struct {
	ID        string           `json:"id"`
	Content   string           `json:"content"`
	FontSize  int              `json:"fontSize"`
	Position  metrics.Position `json:"position"`
	Size      metrics.Size     `json:"size"`
	CreatedAt string           `json:"createdAt"`
	Images    []string         `json:"images,omitempty"`
}

// GitGraph represents a git graph pane
type GitGraph struct {
	ID        string           `json:"id"`
	RepoPath  string           `json:"repoPath"`
	RepoName  string           `json:"repoName"`
	Position  metrics.Position `json:"position"`
	Size      metrics.Size     `json:"size"`
	Device    string           `json:"device"`
	CreatedAt string           `json:"createdAt"`
}

// Iframe represents an iframe pane
type Iframe struct {
	ID        string           `json:"id"`
	URL       string           `json:"url"`
	Position  metrics.Position `json:"position"`
	Size      metrics.Size     `json:"size"`
	CreatedAt string           `json:"createdAt"`
}

type FolderPane struct {
	ID         string           `json:"id"`
	FolderPath string           `json:"folderPath"`
	Position   metrics.Position `json:"position"`
	Size       metrics.Size     `json:"size"`
	CreatedAt  string           `json:"createdAt"`
}

// New creates a new Router
func New(sendToRelay SendFunc, tmuxService *terminal.TmuxService, manager *terminal.Manager, storage *metrics.Storage) *Router {
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "localhost"
	}

	r := &Router{
		sendToRelay:           sendToRelay,
		tmuxService:           tmuxService,
		terminalManager:       manager,
		storage:               storage,
		hostname:              hostname,
		wiredTerminals:        make(map[string]bool),
		pendingHistoryCapture: make(map[string][][]byte),
		usageCacheTTL:         5 * 60 * 1000, // 5 minutes
	}

	// Load caches from storage
	r.loadCaches()

	return r
}

func (r *Router) loadCaches() {
	// Load file panes
	var filePanes []FilePane
	r.storage.LoadJSON("file-panes.json", &filePanes)
	if filePanes == nil {
		filePanes = []FilePane{}
	}
	r.filePanesCache = filePanes

	// Load notes
	var notes []Note
	r.storage.LoadJSON("notes.json", &notes)
	if notes == nil {
		notes = []Note{}
	}
	r.notesCache = notes

	// Load git graphs
	var gitGraphs []GitGraph
	r.storage.LoadJSON("git-graphs.json", &gitGraphs)
	if gitGraphs == nil {
		gitGraphs = []GitGraph{}
	}
	r.gitGraphsCache = gitGraphs

	// Load iframes
	var iframes []Iframe
	r.storage.LoadJSON("iframes.json", &iframes)
	if iframes == nil {
		iframes = []Iframe{}
	}
	r.iframesCache = iframes

	// Load folder panes
	var folderPanes []FolderPane
	r.storage.LoadJSON("folder-panes.json", &folderPanes)
	if folderPanes == nil {
		folderPanes = []FolderPane{}
	}
	r.folderPanesCache = folderPanes
}

func (r *Router) saveCaches() {
	r.storage.SaveJSON("file-panes.json", r.filePanesCache)
	r.storage.SaveJSON("notes.json", r.notesCache)
	r.storage.SaveJSON("git-graphs.json", r.gitGraphsCache)
	r.storage.SaveJSON("iframes.json", r.iframesCache)
	r.storage.SaveJSON("folder-panes.json", r.folderPanesCache)
}

// HandleMessage handles incoming messages
func (r *Router) HandleMessage(msg protocol.Message) {
	switch msg.Type {
	case protocol.TerminalAttach:
		r.handleTerminalAttach(msg.Payload)
	case protocol.TerminalInput:
		r.handleTerminalInput(msg.Payload)
	case protocol.TerminalResize:
		r.handleTerminalResize(msg.Payload)
	case protocol.TerminalScroll:
		r.handleTerminalScroll(msg.Payload)
	case protocol.TerminalClose:
		r.handleTerminalClose(msg.Payload)
	case protocol.TerminalDetach:
		r.handleTerminalDetach(msg.Payload)
	case protocol.MsgRequest:
		r.handleRequest(msg)
	case "update:available":
		log.Printf("[Agent] Update available: %v", msg.Payload)
	case "update:install":
		log.Println("[Agent] Update requested by user")
		go r.handleUpdateInstall()
	default:
		log.Printf("[MessageRouter] Unknown message type: %s", msg.Type)
	}
}

func (r *Router) handleUpdateInstall() {
	suffix := config.GetPlatformSuffix()

	r.sendToRelay("update:progress", map[string]interface{}{
		"status": "checking",
	}, nil)

	info, err := update.CheckLatest(suffix)
	if err != nil {
		log.Printf("[Agent] Update check failed: %v", err)
		r.sendToRelay("update:progress", map[string]interface{}{
			"status": "failed",
			"error":  err.Error(),
		}, nil)
		return
	}

	if !info.HasAsset {
		r.sendToRelay("update:progress", map[string]interface{}{
			"status": "failed",
			"error":  "No release asset found for platform " + suffix,
		}, nil)
		return
	}

	var downloaded int64
	var totalSize int64
	onProgress := func(d, t int64) {
		downloaded = d
		totalSize = t
		// Throttle: only send every 200KB or at completion
		if d%(200*1024) < 8192 || d >= t {
			pct := 0.0
			if t > 0 {
				pct = float64(d) / float64(t) * 100
			}
			r.sendToRelay("update:progress", map[string]interface{}{
				"status":     "downloading",
				"percent":    int(pct),
				"downloaded": d,
				"total":      t,
			}, nil)
		}
	}

	r.sendToRelay("update:progress", map[string]interface{}{
		"status":     "downloading",
		"percent":    0,
		"downloaded": 0,
		"total":      info.Size,
	}, nil)

	if err := update.DownloadAndReplace(info.DownloadURL, onProgress); err != nil {
		log.Printf("[Agent] Update download failed: %v", err)
		r.sendToRelay("update:progress", map[string]interface{}{
			"status": "failed",
			"error":  err.Error(),
		}, nil)
		return
	}

	// Send final 100% progress
	_ = downloaded
	_ = totalSize
	r.sendToRelay("update:progress", map[string]interface{}{
		"status":  "complete",
		"percent": 100,
		"version": info.Version,
	}, nil)

	log.Printf("[Agent] Updated to v%s. Restart to apply.", info.Version)
}

func (r *Router) handleTerminalAttach(payload interface{}) {
	data, ok := payload.(map[string]interface{})
	if !ok {
		return
	}

	terminalID := data["terminalId"].(string)
	cols := int(data["cols"].(float64))
	rows := int(data["rows"].(float64))

	r.mu.Lock()
	alreadyWired := r.wiredTerminals[terminalID]
	r.mu.Unlock()

	// Get terminal info
	t := r.tmuxService.GetTerminal(terminalID)
	if t == nil {
		log.Printf("[Terminal] Terminal not found for attach: %s", terminalID[:8])
		return
	}

	// Connect to PTY
	err := r.terminalManager.ConnectPty(terminalID, t.TmuxSession, cols, rows)
	if err != nil {
		log.Printf("[Terminal] Failed to connect to PTY: %v", err)
		r.sendToRelay(protocol.TerminalError, map[string]interface{}{
			"terminalId": terminalID,
			"message":    "Failed to connect to terminal",
		}, nil)
		return
	}

	if !alreadyWired {
		r.mu.Lock()
		r.wiredTerminals[terminalID] = true
		r.mu.Unlock()

		// Activate buffering BEFORE starting forwardPtyOutput,
		// so output arriving during history capture gets buffered.
		r.pendingMu.Lock()
		r.pendingHistoryCapture[terminalID] = [][]byte{}
		r.pendingMu.Unlock()

		// Start goroutine to forward PTY output
		go r.forwardPtyOutput(terminalID)
	} else {
		// Re-attach: also activate buffering
		r.pendingMu.Lock()
		r.pendingHistoryCapture[terminalID] = [][]byte{}
		r.pendingMu.Unlock()
	}

	// Capture and send history (output is buffered during this time)
	r.captureHistoryAndFlush(terminalID, cols, rows)
}

func (r *Router) forwardPtyOutput(terminalID string) {
	client := r.terminalManager.GetPtyClient(terminalID)
	if client == nil {
		return
	}

	outputChan := client.GetOutputChannel()
	errorChan := client.GetErrorChannel()

	for {
		select {
		case output, ok := <-outputChan:
			if !ok {
				return
			}
			// Buffer output while history capture is in-flight
			r.pendingMu.Lock()
			pending, exists := r.pendingHistoryCapture[terminalID]
			if exists {
				r.pendingHistoryCapture[terminalID] = append(pending, output)
				r.pendingMu.Unlock()
				continue
			}
			r.pendingMu.Unlock()

			r.sendToRelay(protocol.TerminalOutput, map[string]interface{}{
				"terminalId": terminalID,
				"data":       string(output),
			}, nil)

		case err, ok := <-errorChan:
			if !ok {
				return
			}
			log.Printf("[Terminal] PTY error for %s: %v", terminalID[:8], err)
			r.sendToRelay(protocol.TerminalError, map[string]interface{}{
				"terminalId": terminalID,
				"message":    "Terminal connection error",
			}, nil)
		}
	}
}

func (r *Router) captureHistoryAndFlush(terminalID string, cols, rows int) {
	// Resize terminal
	r.tmuxService.ResizeTerminal(terminalID, cols, rows, nil, nil)

	// Wait for tmux to reflow content after resize.
	// tmux resize-pane is asynchronous - it updates the pane size but the
	// content reflow happens asynchronously. Without this delay, capture-pane
	// may capture content with stale dimensions, causing missing content at
	// the beginning or incorrect line wrapping.
	time.Sleep(50 * time.Millisecond)

	// Capture history
	history, err := r.tmuxService.CaptureHistory(terminalID)
	if err == nil && history != "" {
		normalized := strings.ReplaceAll(history, "\n", "\r\n")
		base64History := encodeBase64([]byte(normalized))
		r.sendToRelay(protocol.TerminalHistory, map[string]interface{}{
			"terminalId": terminalID,
			"data":       base64History,
		}, nil)
	}

	// Flush buffered output that arrived during capture
	r.pendingMu.Lock()
	buffered := r.pendingHistoryCapture[terminalID]
	delete(r.pendingHistoryCapture, terminalID)
	r.pendingMu.Unlock()

	for _, data := range buffered {
		r.sendToRelay(protocol.TerminalOutput, map[string]interface{}{
			"terminalId": terminalID,
			"data":       string(data),
		}, nil)
	}

	r.sendToRelay(protocol.TerminalAttached, map[string]interface{}{
		"terminalId": terminalID,
		"cols":       cols,
		"rows":       rows,
	}, nil)

	// Force tmux redraw after a short delay (matches Node.js behavior).
	// Ensures the tmux pane content is fully settled after resize + capture.
	go func() {
		time.Sleep(200 * time.Millisecond)
		r.tmuxService.ForceRedraw(terminalID, cols, rows)
	}()
}

func (r *Router) handleTerminalInput(payload interface{}) {
	data, ok := payload.(map[string]interface{})
	if !ok {
		return
	}

	terminalID := data["terminalId"].(string)
	base64Data := data["data"].(string)

	// Try to send via PTY client
	client := r.terminalManager.GetPtyClient(terminalID)
	if client != nil && client.IsConnected() {
		if err := client.SendInput(base64Data); err != nil {
			log.Printf("[Terminal] Failed to send input via PTY: %v", err)
			// Fallback to tmux send-keys
			r.fallbackSendInput(terminalID, base64Data)
		}
	} else {
		// Fallback to tmux send-keys
		r.fallbackSendInput(terminalID, base64Data)
	}
}

func (r *Router) fallbackSendInput(terminalID, base64Data string) {
	// Get terminal to find its tmux session
	t := r.tmuxService.GetTerminal(terminalID)
	if t == nil {
		log.Printf("[Terminal] Terminal not found: %s", terminalID[:8])
		return
	}

	// Decode base64 data and send to tmux session
	inputData, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		log.Printf("[Terminal] Failed to decode input: %v", err)
		return
	}

	// Send input to tmux session using tmux send-keys
	r.tmuxService.SendInput(terminalID, string(inputData))
}

func (r *Router) handleTerminalResize(payload interface{}) {
	data, ok := payload.(map[string]interface{})
	if !ok {
		return
	}

	terminalID := data["terminalId"].(string)
	cols := int(data["cols"].(float64))
	rows := int(data["rows"].(float64))

	var pixelWidth, pixelHeight *int
	if pw, ok := data["pixelWidth"].(float64); ok {
		pw := int(pw)
		pixelWidth = &pw
	}
	if ph, ok := data["pixelHeight"].(float64); ok {
		ph := int(ph)
		pixelHeight = &ph
	}

	// Resize in PTY if connected
	client := r.terminalManager.GetPtyClient(terminalID)
	if client != nil && client.IsConnected() {
		if err := client.Resize(cols, rows); err != nil {
			log.Printf("[Terminal] Failed to resize PTY: %v", err)
		}
	}

	// Also resize tmux pane
	r.tmuxService.ResizeTerminal(terminalID, cols, rows, pixelWidth, pixelHeight)
}

func (r *Router) handleTerminalScroll(payload interface{}) {
	data, ok := payload.(map[string]interface{})
	if !ok {
		return
	}

	terminalID := data["terminalId"].(string)
	lines := int(data["lines"].(float64))

	r.tmuxService.ScrollTerminal(terminalID, lines)
}

func (r *Router) handleTerminalClose(payload interface{}) {
	data, ok := payload.(map[string]interface{})
	if !ok {
		return
	}

	terminalID := data["terminalId"].(string)

	r.mu.Lock()
	delete(r.wiredTerminals, terminalID)
	r.mu.Unlock()

	// Clean up pending history capture buffer
	r.pendingMu.Lock()
	delete(r.pendingHistoryCapture, terminalID)
	r.pendingMu.Unlock()

	// Disconnect from PTY
	r.terminalManager.DisconnectPty(terminalID)

	// Close tmux terminal
	r.tmuxService.CloseTerminal(terminalID)
	r.sendToRelay(protocol.TerminalClosed, map[string]interface{}{
		"terminalId": terminalID,
	}, nil)
}

func (r *Router) handleTerminalDetach(payload interface{}) {
	data, ok := payload.(map[string]interface{})
	if !ok {
		return
	}

	terminalID := data["terminalId"].(string)

	r.mu.Lock()
	delete(r.wiredTerminals, terminalID)
	r.mu.Unlock()

	// Clean up pending history capture buffer
	r.pendingMu.Lock()
	delete(r.pendingHistoryCapture, terminalID)
	r.pendingMu.Unlock()

	// Disconnect from PTY (but keep tmux session alive)
	r.terminalManager.DisconnectPty(terminalID)

	r.sendToRelay("terminal:detached", map[string]interface{}{
		"terminalId": terminalID,
	}, nil)
}

func (r *Router) handleRequest(msg protocol.Message) {
	data, ok := msg.Payload.(map[string]interface{})
	if !ok {
		return
	}

	id := msg.ID
	method := data["method"].(string)
	path := data["path"].(string)
	body, _ := data["body"].(map[string]interface{})

	// Parse query params
	query := make(map[string]string)
	if idx := strings.Index(path, "?"); idx != -1 {
		qs := path[idx+1:]
		path = path[:idx]
		for _, pair := range strings.Split(qs, "&") {
			if idx := strings.Index(pair, "="); idx != -1 {
				key, _ := url.QueryUnescape(pair[:idx])
				value, _ := url.QueryUnescape(pair[idx+1:])
				query[key] = value
			}
		}
	}

	respond := func(status int, responseBody interface{}) {
		r.sendToRelay(protocol.MsgResponse, map[string]interface{}{
			"status": status,
			"body":   responseBody,
		}, map[string]interface{}{"id": id})
	}

	// Route based on method + path
	route := fmt.Sprintf("%s %s", method, path)

	switch route {
	case "GET /api/terminals":
		terminals := r.tmuxService.ListTerminals()
		respond(200, terminals)

	case "POST /api/terminals":
		workingDir := "~"
		if wd, ok := body["workingDir"].(string); ok {
			workingDir = wd
		}
		var position *metrics.Position
		if pos, ok := body["position"].(map[string]interface{}); ok {
			position = &metrics.Position{
				X: int(pos["x"].(float64)),
				Y: int(pos["y"].(float64)),
			}
		}
		var size *metrics.Size
		if s, ok := body["size"].(map[string]interface{}); ok {
			size = &metrics.Size{
				Width:  int(s["width"].(float64)),
				Height: int(s["height"].(float64)),
			}
		}
		terminal, err := r.tmuxService.CreateTerminal(workingDir, position, size)
		if err != nil {
			respond(500, map[string]interface{}{"error": err.Error()})
		} else {
			respond(200, terminal)
		}

	case "POST /api/terminals/resume":
		terminalID, _ := body["terminalId"].(string)
		if terminalID == "" {
			respond(400, map[string]interface{}{"error": "terminalId required"})
			return
		}
		workingDir, _ := body["workingDir"].(string)
		if workingDir == "" {
			workingDir = "~"
		}
		command, _ := body["command"].(string)
		terminal, err := r.tmuxService.ResumeTerminal(terminalID, workingDir, command)
		if err != nil {
			respond(500, map[string]interface{}{"error": err.Error()})
		} else {
			respond(200, terminal)
		}

	case "GET /api/terminals/processes":
		processes := r.tmuxService.GetAllProcessInfo()
		respond(200, processes)

	case "GET /api/files/browse":
		dirPath := query["path"]
		if dirPath == "" {
			dirPath = "~"
		}
		resolvedPath, err := sanitize.ExpandAndValidatePath(dirPath)
		if err != nil {
			respond(400, map[string]interface{}{"error": err.Error()})
			return
		}

		entries, err := os.ReadDir(resolvedPath)
		if err != nil {
			respond(500, map[string]interface{}{"error": err.Error()})
			return
		}

		var result []map[string]interface{}
		for _, entry := range entries {
			if _, showHidden := query["showHidden"]; !showHidden && strings.HasPrefix(entry.Name(), ".") {
				continue
			}

			info, err := entry.Info()
			if err != nil {
				continue
			}

			entryType := "file"
			if entry.IsDir() {
				entryType = "dir"
			}

			result = append(result, map[string]interface{}{
				"name": entry.Name(),
				"type": entryType,
				"size": info.Size(),
			})
		}

		respond(200, map[string]interface{}{
			"path":    resolvedPath,
			"entries": result,
		})

	case "GET /api/files/read":
		filePath := query["path"]
		if filePath == "" {
			respond(400, map[string]interface{}{"error": "path parameter required"})
			return
		}
		resolvedPath, err := sanitize.ExpandAndValidatePath(filePath)
		if err != nil {
			respond(400, map[string]interface{}{"error": err.Error()})
			return
		}

		content, err := os.ReadFile(resolvedPath)
		if err != nil {
			respond(500, map[string]interface{}{"error": err.Error()})
			return
		}

		fileName := filepath.Base(resolvedPath)
		respond(200, map[string]interface{}{
			"content":  string(content),
			"fileName": fileName,
			"filePath": resolvedPath,
			"device":   r.hostname,
		})

	case "POST /api/files/create":
		filePath, _ := body["path"].(string)
		if filePath == "" {
			respond(400, map[string]interface{}{"error": "path parameter required"})
			return
		}
		resolvedPath, err := sanitize.ExpandAndValidatePath(filePath)
		if err != nil {
			respond(400, map[string]interface{}{"error": err.Error()})
			return
		}

		if err := os.WriteFile(resolvedPath, []byte(""), 0644); err != nil {
			respond(500, map[string]interface{}{"error": err.Error()})
			return
		}

		respond(200, map[string]interface{}{
			"fileName": filepath.Base(filePath),
			"filePath": filePath,
			"device":   r.hostname,
		})

	case "DELETE /api/files/delete":
		filePath, _ := body["path"].(string)
		if filePath == "" {
			respond(400, map[string]interface{}{"error": "path parameter required"})
			return
		}
		resolvedPath, err := sanitize.ExpandAndValidatePath(filePath)
		if err != nil {
			respond(400, map[string]interface{}{"error": err.Error()})
			return
		}

		info, err := os.Stat(resolvedPath)
		if err != nil {
			respond(500, map[string]interface{}{"error": err.Error()})
			return
		}

		if info.IsDir() {
			err = os.RemoveAll(resolvedPath)
		} else {
			err = os.Remove(resolvedPath)
		}

		if err != nil {
			respond(500, map[string]interface{}{"error": err.Error()})
			return
		}

		respond(200, map[string]interface{}{"success": true})

	case "POST /api/files/rename":
		oldPath, _ := body["oldPath"].(string)
		newPath, _ := body["newPath"].(string)
		if oldPath == "" || newPath == "" {
			respond(400, map[string]interface{}{"error": "oldPath and newPath required"})
			return
		}

		resolvedOld, err := sanitize.ExpandAndValidatePath(oldPath)
		if err != nil {
			respond(400, map[string]interface{}{"error": err.Error()})
			return
		}

		resolvedNew, err := sanitize.ExpandAndValidatePath(newPath)
		if err != nil {
			respond(400, map[string]interface{}{"error": err.Error()})
			return
		}

		if err := os.Rename(resolvedOld, resolvedNew); err != nil {
			respond(500, map[string]interface{}{"error": err.Error()})
			return
		}

		respond(200, map[string]interface{}{"success": true, "newPath": resolvedNew})

	case "POST /api/files/mkdir":
		dirPath, _ := body["path"].(string)
		if dirPath == "" {
			respond(400, map[string]interface{}{"error": "path parameter required"})
			return
		}
		resolvedPath, err := sanitize.ExpandAndValidatePath(dirPath)
		if err != nil {
			respond(400, map[string]interface{}{"error": err.Error()})
			return
		}

		if err := os.MkdirAll(resolvedPath, 0755); err != nil {
			respond(500, map[string]interface{}{"error": err.Error()})
			return
		}

		respond(200, map[string]interface{}{"success": true, "path": resolvedPath})

	case "GET /api/file-panes":
		respond(200, r.filePanesCache)

	case "POST /api/file-panes":
		fileName, _ := body["fileName"].(string)
		filePath, _ := body["filePath"].(string)
		content, _ := body["content"].(string)

		if filePath != "" {
			expandedPath, err := sanitize.ExpandAndValidatePath(filePath)
			if err != nil {
				respond(400, map[string]interface{}{"error": "Invalid file path"})
				return
			}

			stat, err := os.Stat(expandedPath)
			if err != nil {
				respond(404, map[string]interface{}{"error": fmt.Sprintf("File not found: %s", err.Error())})
				return
			}

			if stat.Size() > maxFileSize {
				respond(413, map[string]interface{}{"error": "File too large (max 1MB)"})
				return
			}

			if fileName == "" {
				fileName = filepath.Base(expandedPath)
			}

			data, err := os.ReadFile(expandedPath)
			if err != nil {
				respond(500, map[string]interface{}{"error": fmt.Sprintf("Failed to read file: %s", err.Error())})
				return
			}

			if isBinary(data) {
				respond(415, map[string]interface{}{"error": "Binary file not supported"})
				return
			}

			content = string(data)
		}

		var position metrics.Position
		if pos, ok := body["position"].(map[string]interface{}); ok {
			position = metrics.Position{
				X: int(pos["x"].(float64)),
				Y: int(pos["y"].(float64)),
			}
		} else {
			position = metrics.Position{X: 100, Y: 100}
		}

		var size metrics.Size
		if s, ok := body["size"].(map[string]interface{}); ok {
			size = metrics.Size{
				Width:  int(s["width"].(float64)),
				Height: int(s["height"].(float64)),
			}
		} else {
			size = metrics.Size{Width: 600, Height: 400}
		}

		filePane := FilePane{
			ID:        generateUUID(),
			FileName:  fileName,
			FilePath:  filePath,
			Device:    r.hostname,
			Position:  position,
			Size:      size,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		}

		r.filePanesCache = append(r.filePanesCache, filePane)
		r.storage.SaveJSON("file-panes.json", r.filePanesCache)

		response := filePane
		response.Content = content
		respond(200, response)

	case "GET /api/notes":
		respond(200, r.notesCache)

	case "POST /api/notes":
		var position metrics.Position
		if pos, ok := body["position"].(map[string]interface{}); ok {
			position = metrics.Position{
				X: int(pos["x"].(float64)),
				Y: int(pos["y"].(float64)),
			}
		} else {
			position = metrics.Position{X: 100, Y: 100}
		}

		var size metrics.Size
		if s, ok := body["size"].(map[string]interface{}); ok {
			size = metrics.Size{
				Width:  int(s["width"].(float64)),
				Height: int(s["height"].(float64)),
			}
		} else {
			size = metrics.Size{Width: 200, Height: 100}
		}

		note := Note{
			ID:        generateUUID(),
			Content:   "",
			FontSize:  16,
			Position:  position,
			Size:      size,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		}

		r.notesCache = append(r.notesCache, note)
		r.storage.SaveJSON("notes.json", r.notesCache)

		respond(200, note)

	case "GET /api/git-repos":
		repos := r.scanForRepos()
		respond(200, repos)

	case "GET /api/git-repos/in-folder":
		folderPath := query["path"]
		if folderPath == "" {
			respond(400, map[string]interface{}{"error": "path query param required"})
			return
		}
		repos := r.scanReposInFolder(sanitize.ExpandHome(folderPath))
		respond(200, repos)

	case "GET /api/git-graphs":
		respond(200, r.gitGraphsCache)

	case "POST /api/git-graphs":
		repoPath, _ := body["repoPath"].(string)
		if repoPath == "" {
			respond(400, map[string]interface{}{"error": "repoPath is required"})
			return
		}

		resolvedPath, err := sanitize.ExpandAndValidatePath(repoPath)
		if err != nil {
			respond(400, map[string]interface{}{"error": err.Error()})
			return
		}

		var position metrics.Position
		if pos, ok := body["position"].(map[string]interface{}); ok {
			position = metrics.Position{
				X: int(pos["x"].(float64)),
				Y: int(pos["y"].(float64)),
			}
		} else {
			position = metrics.Position{X: 100, Y: 100}
		}

		var size metrics.Size
		if s, ok := body["size"].(map[string]interface{}); ok {
			size = metrics.Size{
				Width:  int(s["width"].(float64)),
				Height: int(s["height"].(float64)),
			}
		} else {
			size = metrics.Size{Width: 500, Height: 450}
		}

		var device string
		if d, ok := body["device"].(string); ok {
			device = d
		}

		gitGraph := GitGraph{
			ID:        generateUUID(),
			RepoPath:  resolvedPath,
			RepoName:  filepath.Base(resolvedPath),
			Position:  position,
			Size:      size,
			Device:    device,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		}

		r.gitGraphsCache = append(r.gitGraphsCache, gitGraph)
		r.storage.SaveJSON("git-graphs.json", r.gitGraphsCache)

		respond(200, gitGraph)

	case "GET /api/iframes":
		respond(200, r.iframesCache)

	case "POST /api/iframes":
		urlStr, _ := body["url"].(string)

		var position metrics.Position
		if pos, ok := body["position"].(map[string]interface{}); ok {
			position = metrics.Position{
				X: int(pos["x"].(float64)),
				Y: int(pos["y"].(float64)),
			}
		} else {
			position = metrics.Position{X: 100, Y: 100}
		}

		var size metrics.Size
		if s, ok := body["size"].(map[string]interface{}); ok {
			size = metrics.Size{
				Width:  int(s["width"].(float64)),
				Height: int(s["height"].(float64)),
			}
		} else {
			size = metrics.Size{Width: 800, Height: 600}
		}

		iframe := Iframe{
			ID:        generateUUID(),
			URL:       urlStr,
			Position:  position,
			Size:      size,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		}

		r.iframesCache = append(r.iframesCache, iframe)
		r.storage.SaveJSON("iframes.json", r.iframesCache)

		respond(200, iframe)

	case "GET /api/folder-panes":
		respond(200, r.folderPanesCache)

	case "POST /api/folder-panes":
		folderPath, _ := body["folderPath"].(string)
		if folderPath == "" {
			folderPath = "~"
		}

		var position metrics.Position
		if pos, ok := body["position"].(map[string]interface{}); ok {
			position = metrics.Position{
				X: int(pos["x"].(float64)),
				Y: int(pos["y"].(float64)),
			}
		} else {
			position = metrics.Position{X: 100, Y: 100}
		}

		var size metrics.Size
		if s, ok := body["size"].(map[string]interface{}); ok {
			size = metrics.Size{
				Width:  int(s["width"].(float64)),
				Height: int(s["height"].(float64)),
			}
		} else {
			size = metrics.Size{Width: 400, Height: 500}
		}

		folderPane := FolderPane{
			ID:         generateUUID(),
			FolderPath: folderPath,
			Position:   position,
			Size:       size,
			CreatedAt:  time.Now().UTC().Format(time.RFC3339),
		}

		r.folderPanesCache = append(r.folderPanesCache, folderPane)
		r.storage.SaveJSON("folder-panes.json", r.folderPanesCache)

		respond(200, folderPane)

	case "GET /api/git-status":
		gsPath := query["path"]
		if gsPath == "" {
			gsPath = "~"
		}
		gsPath = sanitize.ExpandHome(gsPath)

		cmd := exec.Command("git", "rev-parse", "--is-inside-work-tree")
		cmd.Dir = gsPath
		if err := cmd.Run(); err != nil {
			respond(200, map[string]interface{}{"isGit": false})
			return
		}

		// Get git info
		branchCmd := exec.Command("git", "branch", "--show-current")
		branchCmd.Dir = gsPath
		branchOutput, _ := branchCmd.Output()
		branch := strings.TrimSpace(string(branchOutput))
		if branch == "" {
			branch = "HEAD"
		}

		statusCmd := exec.Command("git", "status", "--porcelain")
		statusCmd.Dir = gsPath
		statusOutput, _ := statusCmd.Output()

		files := make(map[string]string)
		var staged, unstaged, untracked int

		for _, line := range strings.Split(string(statusOutput), "\n") {
			if len(line) < 4 {
				continue
			}

			x := line[0]
			y := line[1]
			filePath := line[3:]

			status := "modified"
			if x == '?' && y == '?' {
				status = "untracked"
				untracked++
			} else if x == 'A' || y == 'A' {
				status = "added"
				if x != ' ' {
					staged++
				}
				if y != ' ' && y != '?' {
					unstaged++
				}
			} else if x == 'D' || y == 'D' {
				status = "deleted"
				if x != ' ' {
					staged++
				}
				if y != ' ' && y != '?' {
					unstaged++
				}
			} else {
				if x != ' ' {
					staged++
				}
				if y != ' ' && y != '?' {
					unstaged++
				}
			}

			files[gsPath+"/"+filePath] = status
		}

		total := staged + unstaged + untracked
		respond(200, map[string]interface{}{
			"isGit":  true,
			"branch": branch,
			"clean":  total == 0,
			"uncommitted": map[string]interface{}{
				"total":     total,
				"staged":    staged,
				"unstaged":  unstaged,
				"untracked": untracked,
			},
			"files": files,
		})

	case "GET /api/metrics":
		m, err := metrics.GetLocalMetrics()
		if err != nil {
			respond(500, map[string]interface{}{"error": err.Error()})
			return
		}

		respond(200, []map[string]interface{}{
			{
				"name":    r.hostname,
				"ip":      "127.0.0.1",
				"os":      "linux",
				"online":  true,
				"isLocal": true,
				"metrics": m,
			},
		})

	case "GET /api/devices":
		respond(200, []map[string]interface{}{
			{
				"name":    r.hostname,
				"ip":      "127.0.0.1",
				"os":      "linux",
				"online":  true,
				"isLocal": true,
			},
		})

	default:
		// Handle parameterized routes
		if matched, _ := regexp.MatchString(`^DELETE /api/terminals/[^/]+$`, route); matched {
			parts := strings.Split(path, "/")
			id := parts[len(parts)-1]
			r.tmuxService.CloseTerminal(id)
			respond(200, map[string]interface{}{"success": true})
			return
		}

		if matched, _ := regexp.MatchString(`^(GET|PATCH|DELETE) /api/file-panes/[^/]+$`, route); matched {
			parts := strings.Split(path, "/")
			id := parts[len(parts)-1]

			switch method {
			case "GET":
				for _, fp := range r.filePanesCache {
					if fp.ID == id {
						result := fp
						if fp.FilePath != "" {
							expandedPath, err := sanitize.ExpandAndValidatePath(fp.FilePath)
							if err != nil {
								respond(400, map[string]interface{}{"error": "Invalid file path"})
								return
							}

							stat, err := os.Stat(expandedPath)
							if err != nil {
								respond(404, map[string]interface{}{"error": fmt.Sprintf("File not found: %s", err.Error())})
								return
							}

							if stat.Size() > maxFileSize {
								respond(413, map[string]interface{}{"error": "File too large (max 1MB)"})
								return
							}

							data, err := os.ReadFile(expandedPath)
							if err != nil {
								respond(500, map[string]interface{}{"error": fmt.Sprintf("Failed to read file: %s", err.Error())})
								return
							}

							if isBinary(data) {
								respond(415, map[string]interface{}{"error": "Binary file not supported"})
								return
							}

							result.Content = string(data)
						}
						respond(200, result)
						return
					}
				}
				respond(404, map[string]interface{}{"error": "File pane not found"})

			case "PATCH":
				for _, fp := range r.filePanesCache {
					if fp.ID == id {
						if content, ok := body["content"].(string); ok {
							if fp.FilePath != "" {
								expandedPath, err := sanitize.ExpandAndValidatePath(fp.FilePath)
								if err != nil {
									respond(400, map[string]interface{}{"error": "Invalid file path"})
									return
								}
								if err := os.WriteFile(expandedPath, []byte(content), 0644); err != nil {
									respond(500, map[string]interface{}{"error": fmt.Sprintf("Failed to write file: %s", err.Error())})
									return
								}
							}
						}
						respond(200, map[string]interface{}{"success": true})
						return
					}
				}
				respond(404, map[string]interface{}{"error": "File pane not found"})

			case "DELETE":
				for i, fp := range r.filePanesCache {
					if fp.ID == id {
						r.filePanesCache = append(r.filePanesCache[:i], r.filePanesCache[i+1:]...)
						r.storage.SaveJSON("file-panes.json", r.filePanesCache)
						respond(200, map[string]interface{}{"success": true})
						return
					}
				}
				respond(404, map[string]interface{}{"error": "File pane not found"})
			}
			return
		}

		if matched, _ := regexp.MatchString(`^(GET|PATCH|DELETE) /api/notes/[^/]+$`, route); matched {
			parts := strings.Split(path, "/")
			id := parts[len(parts)-1]

			switch method {
			case "GET":
				for _, n := range r.notesCache {
					if n.ID == id {
						respond(200, n)
						return
					}
				}
				respond(404, map[string]interface{}{"error": "Note not found"})

			case "PATCH":
				for i, n := range r.notesCache {
					if n.ID == id {
						if content, ok := body["content"].(string); ok {
							r.notesCache[i].Content = content
						}
						if fontSize, ok := body["fontSize"].(float64); ok {
							r.notesCache[i].FontSize = int(fontSize)
						}
						r.storage.SaveJSON("notes.json", r.notesCache)
						respond(200, map[string]interface{}{"success": true})
						return
					}
				}
				respond(404, map[string]interface{}{"error": "Note not found"})

			case "DELETE":
				for i, n := range r.notesCache {
					if n.ID == id {
						r.notesCache = append(r.notesCache[:i], r.notesCache[i+1:]...)
						r.storage.SaveJSON("notes.json", r.notesCache)
						respond(200, map[string]interface{}{"success": true})
						return
					}
				}
				respond(404, map[string]interface{}{"error": "Note not found"})
			}
			return
		}

		if matched, _ := regexp.MatchString(`^GET /api/git-graphs/[^/]+/data$`, route); matched {
			parts := strings.Split(path, "/")
			id := parts[len(parts)-2]

			for _, gg := range r.gitGraphsCache {
				if gg.ID == id {
					maxCommits := 50
					if mc, ok := query["maxCommits"]; ok {
						fmt.Sscanf(mc, "%d", &maxCommits)
					}
					data := r.fetchGraphData(gg.RepoPath, maxCommits)
					respond(200, data)
					return
				}
			}
			respond(404, map[string]interface{}{"error": "Git graph pane not found"})
			return
		}

		if matched, _ := regexp.MatchString(`^POST /api/git-graphs/[^/]+/push$`, route); matched {
			parts := strings.Split(path, "/")
			id := parts[len(parts)-2]

			for _, gg := range r.gitGraphsCache {
				if gg.ID == id {
					if _, err := sanitize.ExpandAndValidatePath(gg.RepoPath); err != nil {
						respond(400, map[string]interface{}{"error": err.Error()})
						return
					}
					ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
					defer cancel()
					cmd := exec.CommandContext(ctx,
						"git", "-c", "core.pager=cat", "-c", "core.sshCommand=ssh",
						"-c", "core.fsmonitor=", "-c", "core.hooksPath=",
						"push", "origin", "HEAD")
					cmd.Dir = gg.RepoPath
					cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
					out, err := cmd.CombinedOutput()
					if ctx.Err() == context.DeadlineExceeded {
						respond(500, map[string]interface{}{"error": "git push timed out"})
						return
					}
					if err != nil {
						respond(500, map[string]interface{}{"error": strings.TrimSpace(string(out))})
						return
					}
					respond(200, map[string]interface{}{"success": true, "output": strings.TrimSpace(string(out))})
					return
				}
			}
			respond(404, map[string]interface{}{"error": "Git graph pane not found"})
			return
		}

		if matched, _ := regexp.MatchString(`^PATCH /api/git-graphs/[^/]+$`, route); matched {
			parts := strings.Split(path, "/")
			id := parts[len(parts)-1]

			for i, gg := range r.gitGraphsCache {
				if gg.ID == id {
					if repoPath, ok := body["repoPath"].(string); ok {
						resolvedPath, err := sanitize.ExpandAndValidatePath(repoPath)
						if err != nil {
							respond(400, map[string]interface{}{"error": err.Error()})
							return
						}
						r.gitGraphsCache[i].RepoPath = resolvedPath
						r.gitGraphsCache[i].RepoName = filepath.Base(resolvedPath)
					}
					r.storage.SaveJSON("git-graphs.json", r.gitGraphsCache)
					respond(200, map[string]interface{}{"success": true})
					return
				}
			}
			respond(404, map[string]interface{}{"error": "Git graph pane not found"})
			return
		}

		if matched, _ := regexp.MatchString(`^DELETE /api/git-graphs/[^/]+$`, route); matched {
			parts := strings.Split(path, "/")
			id := parts[len(parts)-1]

			for i, gg := range r.gitGraphsCache {
				if gg.ID == id {
					r.gitGraphsCache = append(r.gitGraphsCache[:i], r.gitGraphsCache[i+1:]...)
					r.storage.SaveJSON("git-graphs.json", r.gitGraphsCache)
					respond(200, map[string]interface{}{"success": true})
					return
				}
			}
			respond(404, map[string]interface{}{"error": "Git graph pane not found"})
			return
		}

		if matched, _ := regexp.MatchString(`^(PATCH|DELETE) /api/iframes/[^/]+$`, route); matched {
			parts := strings.Split(path, "/")
			id := parts[len(parts)-1]

			switch method {
			case "PATCH":
				for i, iframe := range r.iframesCache {
					if iframe.ID == id {
						if urlStr, ok := body["url"].(string); ok {
							r.iframesCache[i].URL = urlStr
						}
						r.storage.SaveJSON("iframes.json", r.iframesCache)
						respond(200, r.iframesCache[i])
						return
					}
				}
				respond(404, map[string]interface{}{"error": "Iframe not found"})

			case "DELETE":
				for i, iframe := range r.iframesCache {
					if iframe.ID == id {
						r.iframesCache = append(r.iframesCache[:i], r.iframesCache[i+1:]...)
						r.storage.SaveJSON("iframes.json", r.iframesCache)
						respond(200, map[string]interface{}{"success": true})
						return
					}
				}
				respond(404, map[string]interface{}{"error": "Iframe not found"})
			}
			return
		}

		// ==================== Folder pane routes ====================

		if matched, _ := regexp.MatchString(`^(PATCH|DELETE) /api/folder-panes/[^/]+$`, route); matched {
			parts := strings.Split(path, "/")
			id := parts[len(parts)-1]

			switch method {
			case "PATCH":
				for i, fp := range r.folderPanesCache {
					if fp.ID == id {
						if folderPath, ok := body["folderPath"].(string); ok {
							r.folderPanesCache[i].FolderPath = folderPath
						}
						r.storage.SaveJSON("folder-panes.json", r.folderPanesCache)
						respond(200, r.folderPanesCache[i])
						return
					}
				}
				respond(404, map[string]interface{}{"error": "Folder pane not found"})

			case "DELETE":
				for i, fp := range r.folderPanesCache {
					if fp.ID == id {
						r.folderPanesCache = append(r.folderPanesCache[:i], r.folderPanesCache[i+1:]...)
						r.storage.SaveJSON("folder-panes.json", r.folderPanesCache)
						respond(200, map[string]interface{}{"success": true})
						return
					}
				}
				respond(404, map[string]interface{}{"error": "Folder pane not found"})
			}
			return
		}

		respond(404, map[string]interface{}{
			"error": fmt.Sprintf("Route not found: %s %s", method, path),
		})
	}
}

// Helper functions

func (r *Router) scanForRepos() []map[string]interface{} {
	home, _ := os.UserHomeDir()
	searchDirs := []string{
		home,
		filepath.Join(home, "Documents"),
		filepath.Join(home, "projects"),
		filepath.Join(home, "Music"),
		filepath.Join(home, "Music", "tmdx"),
	}

	var repos []map[string]interface{}
	seen := make(map[string]bool)

	for _, dir := range searchDirs {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			continue
		}
		r.scanDirForRepos(dir, &repos, seen, 1, 4, home)
	}

	return repos
}

func (r *Router) scanReposInFolder(folderPath string) []map[string]interface{} {
	var repos []map[string]interface{}
	seen := make(map[string]bool)

	// Check if folder itself is a git repo
	gitDir := filepath.Join(folderPath, ".git")
	if info, err := os.Stat(gitDir); err == nil && info.IsDir() {
		branch := "unknown"
		cmd := exec.Command("git", "branch", "--show-current")
		cmd.Dir = folderPath
		if output, err := cmd.Output(); err == nil {
			branch = strings.TrimSpace(string(output))
		}

		name := filepath.Base(folderPath)
		repos = append(repos, map[string]interface{}{
			"path":   folderPath,
			"name":   name,
			"branch": branch,
		})

		if realPath, err := filepath.EvalSymlinks(folderPath); err == nil {
			seen[realPath] = true
		} else {
			seen[folderPath] = true
		}
	}

	r.scanDirForRepos(folderPath, &repos, seen, 1, 4, folderPath)

	return repos
}

func (r *Router) scanDirForRepos(dir string, repos *[]map[string]interface{}, seen map[string]bool, depth, maxDepth int, root string) {
	if depth > maxDepth {
		return
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}

	skipDirs := map[string]bool{
		"node_modules": true, ".git": true, ".hg": true, ".svn": true,
		".worktrees": true, "vendor": true, "dist": true, "build": true,
		"__pycache__": true, ".cache": true, ".npm": true, ".yarn": true,
		".claude": true,
	}

	for _, entry := range entries {
		if skipDirs[entry.Name()] {
			continue
		}

		fullPath := filepath.Join(dir, entry.Name())
		info, err := entry.Info()
		if err != nil || !info.IsDir() {
			continue
		}

		// Resolve symlinks
		realPath := fullPath
		if resolved, err := filepath.EvalSymlinks(fullPath); err == nil {
			realPath = resolved
		}

		if seen[realPath] {
			continue
		}
		seen[realPath] = true

		gitDir := filepath.Join(fullPath, ".git")
		if gitInfo, err := os.Stat(gitDir); err == nil && gitInfo.IsDir() {
			branch := "unknown"
			cmd := exec.Command("git", "branch", "--show-current")
			cmd.Dir = fullPath
			if output, err := cmd.Output(); err == nil {
				branch = strings.TrimSpace(string(output))
			}

			name := filepath.Base(fullPath)
			*repos = append(*repos, map[string]interface{}{
				"path":   fullPath,
				"name":   name,
				"branch": branch,
			})
		} else {
			r.scanDirForRepos(fullPath, repos, seen, depth+1, maxDepth, root)
		}
	}
}

func countLines(output []byte) int {
	trimmed := strings.TrimSpace(string(output))
	if trimmed == "" {
		return 0
	}
	return len(strings.Split(trimmed, "\n"))
}

func gitOutput(dir string, args ...string) []byte {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, args[0], args[1:]...)
	cmd.Dir = dir
	out, _ := cmd.Output()
	return out
}

func (r *Router) fetchGraphData(repoPath string, maxCommits int) map[string]interface{} {
	// Validate path
	if _, err := sanitize.ValidateWorkingDirectory(repoPath); err != nil {
		return map[string]interface{}{
			"error":    err.Error(),
			"repoPath": repoPath,
		}
	}

	// Get branch
	branch := strings.TrimSpace(string(gitOutput(repoPath, "git", "branch", "--show-current")))

	// Get staged files count
	staged := countLines(gitOutput(repoPath, "git", "diff", "--cached", "--name-only"))

	// Get unstaged files count
	unstaged := countLines(gitOutput(repoPath, "git", "diff", "--name-only"))

	// Get untracked files count
	untracked := countLines(gitOutput(repoPath, "git", "ls-files", "--others", "--exclude-standard"))

	// Get log
	sep := "‡‡"
	fmtStr := []string{"%h", "%p", "%an", "%s", "%D", "%at"}
	logOutput := gitOutput(repoPath, "git", "log", "--all", "--topo-order",
		"--format="+strings.Join(fmtStr, sep),
		"-n", fmt.Sprintf("%d", maxCommits))

	var commits []map[string]interface{}
	for _, line := range strings.Split(strings.TrimSpace(string(logOutput)), "\n") {
		if line == "" {
			continue
		}

		parts := strings.Split(line, sep)
		if len(parts) < 6 {
			continue
		}

		hash := parts[0]
		parentStr := parts[1]
		author := parts[2]
		subject := parts[3]
		refs := parts[4]
		ts := parts[5]

		parents := []string{}
		if parentStr != "" {
			parents = strings.Split(parentStr, " ")
		}

		var timestamp int64
		fmt.Sscanf(ts, "%d", &timestamp)

		commits = append(commits, map[string]interface{}{
			"hash":      hash,
			"parents":   parents,
			"author":    author,
			"subject":   subject,
			"refs":      refs,
			"timestamp": timestamp,
		})
	}

	total := staged + unstaged + untracked

	return map[string]interface{}{
		"branch": branch,
		"uncommitted": map[string]interface{}{
			"total":     total,
			"staged":    staged,
			"unstaged":  unstaged,
			"untracked": untracked,
		},
		"clean":     total == 0,
		"commits":   commits,
		"repoPath":  repoPath,
		"timestamp": time.Now().UnixMilli(),
	}
}

func generateUUID() string {
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		time.Now().UnixNano()&0xffffffff,
		time.Now().UnixNano()>>32&0xffff,
		time.Now().UnixNano()>>48&0xffff,
		time.Now().UnixNano()>>16&0xffff,
		time.Now().UnixNano()>>24&0xffffffffffff)
}

func encodeBase64(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}
