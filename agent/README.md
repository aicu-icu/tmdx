# tmdx Agent (Go)

Go implementation of the tmdx agent, providing local terminal and file management with cloud relay connectivity.

## Features

- **Terminal Management**: tmux-based terminal sessions
- **Claude State Detection**: Screen scraping to detect Claude's current state (idle, working, permission, etc.)
- **File Operations**: Browse, read, write, delete, rename files and directories
- **Git Integration**: Repository scanning and git graph visualization
- **System Metrics**: CPU, RAM, and GPU monitoring
- **Cloud Relay**: WebSocket connection to tmdx cloud server
- **Service Management**: systemd/launchd service installation

## Installation

### From Source

```bash
# Clone the repository
git clone <repository-url>
cd agent

# Build
make build

# Or install directly
make install
```

### Binary Download

Download the latest binary from the releases page.

## Usage

### Configure

```bash
# Configure cloud URL and token
tmd-agent config ws://localhost:1071@dev
tmd-agent config ws://192.168.1.100:1071@your-token
```

### Start Agent

```bash
# Start in foreground
tmd-agent start

# Start in background
tmd-agent start --daemon

# Check status
tmd-agent status

# Stop daemon
tmd-agent stop
```

### Service Installation

```bash
# Show installation instructions
tmd-agent install-service
```

## Commands

| Command | Description |
|---------|-------------|
| `start` | Start agent (foreground) |
| `start --daemon` | Start agent (background) |
| `stop` | Stop background agent |
| `status` | Show agent status |
| `config <url>@<token>` | Configure cloud URL and token |
| `install-service` | Show service installation instructions |
| `help` | Show help message |

## Architecture

```
agent/
├── cmd/
│   └── tmd-agent/        # CLI entry point
│       └── main.go
├── internal/
│   ├── config/          # Configuration management
│   ├── auth/            # Authentication token handling
│   ├── protocol/        # Message type constants
│   ├── relay/           # WebSocket relay client
│   ├── terminal/        # Terminal and tmux management
│   ├── router/          # Message routing
│   ├── services/        # System metrics and storage
│   └── sanitize/        # Input validation
├── go.mod
├── go.sum
├── Makefile
└── README.md
```

## Development

### Prerequisites

- Go 1.21 or later
- tmux

### Build

```bash
make build
```

### Test

```bash
make test
```

### Lint

```bash
make lint
```

### Format

```bash
make fmt
```

## Configuration

The agent stores configuration in `~/.tmdx/`:

- `agent.json` - Configuration (token, cloud URL)
- `terminals.json` - Terminal state
- `file-panes.json` - File pane state
- `notes.json` - Notes state
- `git-graphs.json` - Git graph state
- `iframes.json` - Iframe state
- `folder-panes.json` - Folder pane state
- `agent.pid` - Process ID (when running as daemon)

## Message Protocol

The agent communicates with the cloud server using a JSON-based WebSocket protocol:

### Terminal Messages

- `terminal:attach` - Attach to terminal
- `terminal:input` - Send input to terminal
- `terminal:output` - Terminal output
- `terminal:resize` - Resize terminal
- `terminal:close` - Close terminal

### System Messages

- `agent:auth` - Authentication
- `agent:auth:ok` - Authentication successful
- `agent:auth:fail` - Authentication failed
- `agent:ping` - Keep-alive ping
- `agent:pong` - Keep-alive pong

### REST-over-WS

- `request` - REST API request
- `response` - REST API response

## License

[License information]
