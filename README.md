English | [中文](README.zh.md)

# TmdX

**Remote terminals, file editor & git graph — one canvas for all your machines.**

![TmdX Screenshot](screenshot.png)

TmdX is a terminal management platform for remotely managing terminal sessions through a browser. Access your development environment from anywhere.

## Architecture

```
┌─────────────┐      WebSocket       ┌─────────────┐
│   Browser   │ ◄──────────────────► │ TmdX Cloud  │
└─────────────┘                      └──────┬──────┘
                                            │ WebSocket
                                     ┌──────▼──────┐
                                     │ TmdX Agent  │
                                     └──────┬──────┘
                                            │
                                     ┌──────▼──────┐
                                     │   tmux/PTY  │
                                     └─────────────┘
```

## Features

- **Terminal**: Persistent tmux sessions, real-time sync, split layout
- **File Editor**: Browse, create, delete, rename files; Monaco Editor with syntax highlighting
- **Git Graph**: Repository scanning and visualization
- **System Monitoring**: CPU, memory, GPU metrics; Claude status detection
- **Multi-user**: Local auth, first user becomes admin
- **Offline-ready**: All frontend resources localized, no CDN dependencies

## Quick Start

### 1. Deploy Cloud

Download and run on your Linux server:

```bash
curl -fsSL https://github.com/aicu-icu/tmdx/releases/latest/download/tmd-cloud-linux-amd64 -o tmd-cloud
chmod +x tmd-cloud
./tmd-cloud
```

Cloud will:
- Create `data/` directory for database
- Listen on port `1071` by default

### 2. Access Web UI

Open `http://your-server:1071` in browser:

1. Register / Login
2. Click "Add Agent"
3. Select platform and copy the config command

### 3. Install Agent

On your local machine:

```bash
# Download (URL from Web UI)
curl -fsSL <download-url> -o tmd-agent
chmod +x tmd-agent

# Configure (command from Web UI)
./tmd-agent config ws://your-server:1071@<token>

# Start
./tmd-agent start
```

Done! Refresh Web UI to see your machine.

## Commands

```bash
./tmd-agent start          # Start in foreground
./tmd-agent start --daemon # Start in background
./tmd-agent status         # Check status
./tmd-agent stop           # Stop
./tmd-agent install-service # System service setup
```

## Tech Stack

- **Agent**: Go, gorilla/websocket, creack/pty
- **Cloud**: Go, gin-gonic/gin, modernc.org/sqlite
- **Frontend**: Vanilla JS, Monaco Editor, Marked.js

## Documentation

- [Developer Guide](README.dev.md) - Build, development, project structure

## Acknowledgments

This project was refactored based on [49Agents](https://github.com/49Agents/49Agents).

## License

MIT License
