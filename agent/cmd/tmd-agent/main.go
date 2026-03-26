package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"agent/internal/auth"
	"agent/internal/config"
	"agent/internal/protocol"
	"agent/internal/relay"
	"agent/internal/router"
	metrics "agent/internal/services"
	"agent/internal/terminal"
)

const (
	pidFileName = "agent.pid"
)

func main() {
	args := os.Args[1:]
	command := "help"
	if len(args) > 0 {
		command = args[0]
	}

	cfg := config.New()
	authMgr := auth.New(cfg.ConfigDir)

	switch command {
	case "connect":
		handleConnect(args[1:], cfg, authMgr)
	case "start":
		handleStart(args[1:], cfg, authMgr)
	case "status":
		handleStatus(cfg, authMgr)
	case "stop":
		handleStop(cfg)
	case "config":
		handleConfig(args[1:], authMgr)
	case "install-service":
		handleInstallService(cfg)
	case "help", "--help", "-h":
		printHelp(cfg)
	case "--version", "-v":
		fmt.Printf("tmdx Agent v%s\n", cfg.Version)
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n", command)
		printHelp(cfg)
		os.Exit(1)
	}
}

func parseCloudArgs(input string) (cloudURL, token string) {
	atIndex := -1
	for i := len(input) - 1; i >= 0; i-- {
		if input[i] == '@' {
			atIndex = i
			break
		}
	}

	if atIndex == -1 {
		return input, ""
	}
	return input[:atIndex], input[atIndex+1:]
}

func handleConfig(args []string, authMgr *auth.Manager) {
	if len(args) == 0 {
		printConfigHelp()
		return
	}

	if args[0] == "--show" {
		configFile := filepath.Join(authMgr.GetConfigDir(), "agent.json")
		data, err := os.ReadFile(configFile)
		if err != nil {
			if os.IsNotExist(err) {
				fmt.Println("[tmd-agent] No configuration found.")
			} else {
				fmt.Fprintf(os.Stderr, "[tmd-agent] Failed to read config: %v\n", err)
			}
			return
		}
		fmt.Println(string(data))
		return
	}

	if args[0] == "--reset" {
		if err := authMgr.ClearToken(); err != nil {
			fmt.Fprintf(os.Stderr, "[tmd-agent] Failed to clear config: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("[tmd-agent] Configuration cleared.")
		return
	}

	input := args[0]
	cloudURL, token := parseCloudArgs(input)

	if err := authMgr.SaveConfig(token, cloudURL); err != nil {
		fmt.Fprintf(os.Stderr, "[tmd-agent] Failed to save config: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("[tmd-agent] Configuration saved.")
	if cloudURL != "" {
		fmt.Printf("  Cloud URL: %s\n", cloudURL)
	}
	if token != "" {
		fmt.Printf("  Token:     %s\n", tokenStatus(token))
	}
}

func handleConnect(args []string, cfg *config.Config, authMgr *auth.Manager) {
	isDaemon := false
	var remaining []string
	for _, arg := range args {
		if arg == "--daemon" || arg == "-d" {
			isDaemon = true
		} else {
			remaining = append(remaining, arg)
		}
	}

	if len(remaining) == 0 {
		printConnectHelp()
		return
	}

	input := remaining[0]
	cloudURL, token := parseCloudArgs(input)

	if err := authMgr.SaveConfig(token, cloudURL); err != nil {
		fmt.Fprintf(os.Stderr, "[tmd-agent] Failed to save config: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("[tmd-agent] Configuration saved.")
	if cloudURL != "" {
		fmt.Printf("  Cloud URL: %s\n", cloudURL)
	}
	if token != "" {
		fmt.Printf("  Token:     %s\n", tokenStatus(token))
	}
	fmt.Println("[tmd-agent] Starting agent...")

	if err := config.CheckDeps(); err != nil {
		fmt.Fprintf(os.Stderr, "[tmd-agent] %v\n", err)
		os.Exit(1)
	}

	if isDaemon {
		cmd := exec.Command(os.Args[0], "start")
		cmd.Stdout = nil
		cmd.Stderr = nil
		cmd.Stdin = nil

		if err := cmd.Start(); err != nil {
			fmt.Fprintf(os.Stderr, "[tmd-agent] Failed to start daemon: %v\n", err)
			os.Exit(1)
		}

		pidFile := filepath.Join(cfg.ConfigDir, pidFileName)
		if err := os.MkdirAll(cfg.ConfigDir, 0755); err == nil {
			os.WriteFile(pidFile, []byte(fmt.Sprintf("%d", cmd.Process.Pid)), 0644)
		}

		fmt.Printf("[tmd-agent] Agent started in background (PID: %d)\n", cmd.Process.Pid)
		fmt.Printf("[tmd-agent] PID file: %s\n", pidFile)
		fmt.Println("[tmd-agent] Use \"tmd-agent stop\" to stop the agent.")
		return
	}

	if err := startAgent(cloudURL, token, cfg); err != nil {
		log.Fatalf("[tmd-agent] Failed to start agent: %v", err)
	}
}

func printConfigHelp() {
	fmt.Println()
	fmt.Println("Usage: tmd-agent config <command>")
	fmt.Println()
	fmt.Println("Commands:")
	fmt.Println("  <url>@<token>    Save cloud URL and token")
	fmt.Println("  --show           Show raw config file (debug)")
	fmt.Println("  --reset          Clear saved configuration")
	fmt.Println()
	fmt.Println("Examples:")
	fmt.Println("  tmd-agent config ws://localhost:1071@dev")
	fmt.Println("  tmd-agent config ws://192.168.1.100:1071@eyJhbGc...")
	fmt.Println("  tmd-agent config ws://cloud.example.com:1071     # only URL")
	fmt.Println("  tmd-agent config @your-token                     # only token")
	fmt.Println("  tmd-agent config --show                          # debug config")
	fmt.Println()
}

func printConnectHelp() {
	fmt.Println()
	fmt.Println("Usage: tmd-agent connect <url>@<token> [--daemon]")
	fmt.Println()
	fmt.Println("Combines config + start in one command.")
	fmt.Println()
	fmt.Println("Options:")
	fmt.Println("  --daemon, -d     Run in background")
	fmt.Println()
	fmt.Println("Examples:")
	fmt.Println("  tmd-agent connect ws://localhost:1071@dev")
	fmt.Println("  tmd-agent connect ws://cloud.example.com:1071@your-token")
	fmt.Println("  tmd-agent connect ws://localhost:1071@dev -d")
	fmt.Println()
}

func handleStart(args []string, cfg *config.Config, authMgr *auth.Manager) {
	isDaemon := false
	for _, arg := range args {
		if arg == "--daemon" || arg == "-d" {
			isDaemon = true
			break
		}
	}

	pidFile := filepath.Join(cfg.ConfigDir, pidFileName)

	if err := config.CheckDeps(); err != nil {
		fmt.Fprintf(os.Stderr, "[tmd-agent] %v\n", err)
		os.Exit(1)
	}

	if isDaemon {
		cmd := exec.Command(os.Args[0], "start")
		cmd.Stdout = nil
		cmd.Stderr = nil
		cmd.Stdin = nil

		if err := cmd.Start(); err != nil {
			fmt.Fprintf(os.Stderr, "[tmd-agent] Failed to start daemon: %v\n", err)
			os.Exit(1)
		}

		if err := os.MkdirAll(cfg.ConfigDir, 0755); err == nil {
			os.WriteFile(pidFile, []byte(fmt.Sprintf("%d", cmd.Process.Pid)), 0644)
		}

		fmt.Printf("[tmd-agent] Agent started in background (PID: %d)\n", cmd.Process.Pid)
		fmt.Printf("[tmd-agent] PID file: %s\n", pidFile)
		fmt.Println("[tmd-agent] Use \"tmd-agent stop\" to stop the agent.")
		return
	}

	token, err := authMgr.LoadToken()
	if err != nil {
		log.Printf("[tmd-agent] Warning: Failed to load token: %v", err)
	}

	cloudURL, err := authMgr.LoadCloudURL()
	if err != nil {
		log.Printf("[tmd-agent] Warning: Failed to load cloud URL: %v", err)
	}

	if token == "" || cloudURL == "" {
		fmt.Println("[tmd-agent] Agent not configured.")
		fmt.Println("[tmd-agent] Run: tmd-agent config <url>@<token>")
		fmt.Println()
		fmt.Println("  Example: tmd-agent config ws://localhost:1071@dev")
		os.Exit(1)
	}

	if err := os.MkdirAll(cfg.ConfigDir, 0755); err == nil {
		os.WriteFile(pidFile, []byte(fmt.Sprintf("%d", os.Getpid())), 0644)
	}

	defer func() {
		if data, err := os.ReadFile(pidFile); err == nil {
			if string(data) == fmt.Sprintf("%d", os.Getpid()) {
				os.Remove(pidFile)
			}
		}
	}()

	if err := startAgent(cloudURL, token, cfg); err != nil {
		log.Fatalf("[tmd-agent] Failed to start agent: %v", err)
	}
}

func startAgent(cloudURL, token string, cfg *config.Config) error {
	log.Printf("[Agent] Starting tmdx Agent v%s", cfg.Version)
	log.Printf("[Agent] Cloud relay: %s", cloudURL)

	// Initialize storage
	storage := metrics.New(cfg.DataDir)

	// Initialize tmux service
	tmuxService := terminal.NewTmuxService(storage)

	// Discover existing terminals
	terminals, err := tmuxService.DiscoverExistingTerminals()
	if err != nil {
		log.Printf("[Agent] Warning: Failed to discover terminals: %v", err)
	}
	log.Printf("[Agent] Discovered %d existing terminal(s)", len(terminals))

	// Initialize terminal manager
	termManager := terminal.New()

	// Create relay client
	client := relay.New(cloudURL, token)

	// Create message router
	sendToRelay := func(msgType string, payload interface{}, extra map[string]interface{}) {
		msg := protocol.Message{
			Type:    msgType,
			Payload: payload,
		}
		if extra != nil {
			if id, ok := extra["id"].(string); ok {
				msg.ID = id
			}
		}
		client.Send(msg)
	}

	router := router.New(sendToRelay, tmuxService, termManager, storage)

	// Register event handlers
	client.On("authenticated", func(payload interface{}) {
		log.Println("[Agent] Connected and authenticated to cloud relay")

		// Start metrics polling
		go func() {
			for {
				if !client.IsConnected() {
					break
				}
				m, err := metrics.GetLocalMetrics()
				if err == nil {
					sendToRelay(protocol.Metrics, m, nil)
				}
				time.Sleep(5 * time.Second)
			}
		}()
	})

	client.On("authFailed", func(payload interface{}) {
		log.Println("[Agent] Authentication failed")
		log.Println("[Agent] Please re-run \"tmd-agent login\" to get a new token.")
	})

	client.On("disconnected", func(payload interface{}) {
		log.Println("[Agent] Disconnected from cloud relay")
	})

	client.On("message", func(payload interface{}) {
		if msg, ok := payload.(protocol.Message); ok {
			router.HandleMessage(msg)
		}
	})

	// Connect to cloud
	if err := client.Connect(); err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}

	// Graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		<-sigChan
		log.Println("[Agent] Shutting down...")
		termManager.StopAll()
		client.Disconnect()
		os.Exit(0)
	}()

	// Block forever
	select {}
}

func handleStatus(cfg *config.Config, authMgr *auth.Manager) {
	token, _ := authMgr.LoadToken()
	cloudURL, _ := authMgr.LoadCloudURL()
	pidFile := filepath.Join(cfg.ConfigDir, pidFileName)

	var pid int
	var running bool

	if data, err := os.ReadFile(pidFile); err == nil {
		fmt.Sscanf(string(data), "%d", &pid)
		if pid > 0 {
			process, err := os.FindProcess(pid)
			if err == nil {
				if err := process.Signal(syscall.Signal(0)); err == nil {
					running = true
				}
			}
		}
	}

	fmt.Printf("tmdx Agent v%s\n", cfg.Version)
	fmt.Printf("  Config dir:    %s\n", cfg.ConfigDir)
	fmt.Printf("  Cloud URL:     %s\n", cloudURL)
	fmt.Printf("  Token:         %s\n", tokenStatus(token))
	if running {
		fmt.Printf("  Agent status:  running (PID: %d)\n", pid)
	} else {
		fmt.Println("  Agent status:  stopped")
	}
}

func tokenStatus(token string) string {
	if token == "" {
		return "NOT configured"
	}
	return "configured"
}

func handleStop(cfg *config.Config) {
	pidFile := filepath.Join(cfg.ConfigDir, pidFileName)

	if _, err := os.Stat(pidFile); os.IsNotExist(err) {
		fmt.Println("[tmd-agent] No PID file found. Agent may not be running.")
		return
	}

	data, err := os.ReadFile(pidFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[tmd-agent] Failed to read PID file: %v\n", err)
		return
	}

	var pid int
	if _, err := fmt.Sscanf(string(data), "%d", &pid); err != nil {
		fmt.Fprintf(os.Stderr, "[tmd-agent] Invalid PID in file: %v\n", err)
		return
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[tmd-agent] Failed to find process: %v\n", err)
		return
	}

	if err := process.Signal(syscall.SIGTERM); err != nil {
		if err == os.ErrProcessDone {
			fmt.Println("[tmd-agent] Agent process not found. Cleaning up PID file.")
			os.Remove(pidFile)
		} else {
			fmt.Fprintf(os.Stderr, "[tmd-agent] Failed to stop agent: %v\n", err)
		}
		return
	}

	fmt.Printf("[tmd-agent] Sent SIGTERM to agent (PID: %d)\n", pid)
	os.Remove(pidFile)
}

func handleInstallService(cfg *config.Config) {
	execPath, _ := filepath.Abs(os.Args[0])

	if cfg.Version == "linux" {
		serviceContent := fmt.Sprintf(`[Unit]
Description=tmdx Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=%s start
Restart=always
RestartSec=5
Environment=HOME=%s
User=%s

[Install]
WantedBy=multi-user.target`, execPath, os.Getenv("HOME"), os.Getenv("USER"))

		servicePath := filepath.Join(os.Getenv("HOME"), ".config", "systemd", "user", "tmd-agent.service")
		fmt.Println("[tmd-agent] To install as a systemd user service:")
		fmt.Println()
		fmt.Println("  mkdir -p ~/.config/systemd/user")
		fmt.Printf("  cat > %s << 'EOF'\n", servicePath)
		fmt.Println(serviceContent)
		fmt.Println("EOF")
		fmt.Println("  systemctl --user daemon-reload")
		fmt.Println("  systemctl --user enable tmd-agent")
		fmt.Println("  systemctl --user start tmd-agent")
		fmt.Println()
	} else if cfg.Version == "darwin" {
		plistContent := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.tmdx.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>%s</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>`, execPath)

		plistPath := filepath.Join(os.Getenv("HOME"), "Library", "LaunchAgents", "com.tmdx.agent.plist")
		fmt.Println("[tmd-agent] To install as a launchd service:")
		fmt.Println()
		fmt.Printf("  cat > %s << 'EOF'\n", plistPath)
		fmt.Println(plistContent)
		fmt.Println("EOF")
		fmt.Printf("  launchctl load %s\n", plistPath)
		fmt.Println()
	} else {
		fmt.Println("[tmd-agent] Service installation is only supported on Linux (systemd) and macOS (launchd).")
	}
}

func printHelp(cfg *config.Config) {
	fmt.Printf(`tmdx Agent v%s

Usage: tmd-agent <command> [options]

Commands:
  connect <url>@<token>       Configure and start (recommended)
  connect <url>@<token> -d    Configure and start in background
  config <url>@<token>        Save configuration only
  config --show               Show raw config file (debug)
  config --reset              Clear saved configuration
  start                       Connect using saved config
  start --daemon              Connect in background
  status                      Show agent status and config
  stop                        Stop the background agent
  install-service             System service install instructions
  --version, -v               Show version

Examples:
  tmd-agent connect ws://localhost:1071@dev
  tmd-agent connect ws://cloud.example.com:1071@your-token -d
`, cfg.Version)
}
