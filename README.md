English | [中文](README.zh.md)

# TmdX

**Remote terminals, file editor & git graph — one canvas for all your machines.**

![TmdX Screenshot](screenshot.png)

TmdX is a modern terminal management platform that allows you to remotely manage and monitor local terminal sessions through a browser. Whether at home, office, or on the go, you can seamlessly access your development environment.

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

**Components**:
- **agent** - Local agent program that manages terminal sessions and connects to the cloud
- **cloud** - Cloud relay server that provides Web UI and WebSocket relay

## Features

### Terminal Management
- Persistent terminal sessions based on tmux
- Real-time terminal input/output synchronization
- Multi-terminal split layout save and restore
- Automatic terminal session discovery

### File Operations
- File explorer (browse, create, delete, rename)
- File editor (Monaco Editor with syntax highlighting)
- Working directory permission control

### Git Integration
- Repository scanning and status display
- Git Graph visualization

### System Monitoring
- Real-time CPU, memory, GPU metrics
- Claude status detection (idle/working/permission, etc.)

### Cloud Features
- Local username/password authentication
- Multi-account registration and login management
- First registered user automatically becomes admin
- JWT authentication
- Agent pairing workflow
- Tier-based limits (free/pro/poweruser)
- Fully offline operation (no external CDN dependencies)

## Advantages

| Feature | Description |
|---------|-------------|
| Low Latency | WebSocket direct connection, instant terminal response |
| Secure | Token authentication + HTTPS encrypted transmission |
| Persistent | tmux sessions automatically recover after disconnection |
| Cross-platform | Browser access, supports any device |
| Offline-ready | All frontend resources localized, no internet required |
| Lightweight | Pure Go implementation, single binary deployment |
| Multi-user | Multi-account support, first user becomes admin |

---

# User Guide

## Installing Agent

### Download

Download the binary for your platform from GitHub Releases:

```bash
# Linux (amd64)
curl -fsSL https://github.com/aicu-icu/tmdx/releases/latest/download/tmd-agent-linux-amd64 -o tmd-agent

# macOS (arm64)
curl -fsSL https://github.com/aicu-icu/tmdx/releases/latest/download/tmd-agent-darwin-arm64 -o tmd-agent

# Add execute permission
chmod +x tmd-agent

# Move to PATH
sudo mv tmd-agent /usr/local/bin/
```

Or visit the [Releases page](https://github.com/aicu-icu/tmdx/releases/latest) directly.

## Configuration & Startup

```bash
# Configure cloud address and token
tmd-agent config ws://cloud.example.com:1071@your-token

# Start in foreground
tmd-agent start

# Start in background
tmd-agent start --daemon

# Check status
tmd-agent status

# Stop
tmd-agent stop
```

## Pairing Process

1. Click "Add Agent" in the Web UI
2. Copy the generated pairing code
3. Run `tmd-agent connect ws://cloud:1071@<pairing-code>` locally
4. Confirm pairing to enable remote access

## System Service

```bash
# View service installation instructions
tmd-agent install-service

# Linux (systemd)
mkdir -p ~/.config/systemd/user
# ... follow the prompts

# macOS (launchd)
# ... follow the prompts
```

---

# Developer Guide

## Requirements

| Component | Version |
|-----------|---------|
| Go | 1.21+ |
| Node.js | 18+ (cloud frontend build only) |
| tmux | 3.0+ |
| SQLite | - (using modernc.org/sqlite pure Go implementation) |

## Clone Project

```bash
git clone https://github.com/aicu-icu/tmdx.git
cd tmdx
```

## Development Mode

### Agent

```bash
cd agent

# Install dependencies
go mod download

# Build
make build

# Run
make run

# Test
make test

# Code checks
make lint
make vet
```

### Cloud

```bash
cd cloud

# Install dependencies
go mod download
npm install

# Build frontend assets
npm run build

# Build backend
make build

# Run
make run

# Test
go test ./...
```

## Production Build

```bash
# Run from root directory to build all components
./build.sh

# Output directory: dist/v<VERSION>/
# - tmd-cloud              # Cloud server
# - tmd-agent-linux-amd64  # Linux Agent
# - tmd-agent-darwin-arm64 # macOS Agent
```

## Versioning

Version number is stored in the `VERSION` file, using date format:

```
0.3.26      # Released on March 26, 2026
0.3.26.1    # Second update on the same day
```

Update version:

```bash
echo "0.3.27" > VERSION
```

## Project Structure

```
tmdx/
├── VERSION           # Version number
├── build.sh          # Production build script
├── update-ver.sh     # Version update helper script
├── AGENTS.md         # Development guidelines
│
├── agent/            # Local agent
│   ├── cmd/tmd-agent/main.go
│   └── internal/
│       ├── config/   # Configuration management
│       ├── auth/     # Token handling
│       ├── relay/    # WebSocket client
│       ├── terminal/ # Terminal/tmux management
│       ├── router/   # Message routing
│       └── sanitize/ # Input validation
│
├── cloud/            # Cloud server
│   ├── cmd/cloud/main.go
│   └── internal/
│       ├── config/   # Configuration loading
│       ├── db/       # SQLite database
│       ├── auth/     # JWT authentication
│       ├── ws/       # WebSocket relay
│       ├── routes/   # HTTP API
│       ├── billing/  # Tier limits
│       └── static/   # Embedded frontend assets
│
└── dist/             # Build output
```

## Frontend Assets

Cloud module's frontend assets are fully localized for offline operation:

- **Fonts**: 16 font families in `cloud/internal/static/public/fonts/`
- **Monaco Editor**: Code editor in `cloud/internal/static/public/lib/monaco/`
- **Marked.js**: Markdown parsing
- **DOMPurify**: XSS protection

```bash
# Update frontend dependencies
cd cloud
npm install monaco-editor@latest
cp -r node_modules/monaco-editor/min/vs internal/static/public/lib/monaco/vs
npm run build
```

## Environment Variables (Cloud)

See `cloud/.env.example`:

| Variable | Description |
|----------|-------------|
| `HOST` | Listen address, default `0.0.0.0` |
| `PORT` | Listen port, default `1071` |
| `DB_PATH` | SQLite database path |
| `JWT_SECRET` | JWT signing secret |

---

## Tech Stack

### Agent
- Go 1.21
- gorilla/websocket
- creack/pty
- google/uuid

### Cloud
- Go 1.21
- gin-gonic/gin
- golang-jwt/jwt
- modernc.org/sqlite
- gorilla/websocket

### Frontend
- Vanilla JavaScript (no framework)
- Monaco Editor
- Marked.js + DOMPurify

---

## Acknowledgments

This project was refactored based on [49Agents](https://github.com/49Agents/49Agents). Thanks to the original project for open sourcing.

## License

MIT License
