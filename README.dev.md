English | [中文](README.dev.zh.md)

# TmdX Developer Guide

## Requirements

| Component | Version |
|-----------|---------|
| Go | 1.21+ |
| Node.js | 18+ (cloud frontend build only) |
| tmux | 3.0+ |

## Clone Project

```bash
git clone https://github.com/aicu-icu/tmdx.git
cd tmdx
```

## Development

### Agent

```bash
cd agent

make build    # Build
make run      # Run
make test     # Test
make lint     # Lint
```

### Cloud

```bash
cd cloud

npm install   # Install frontend deps
npm run build # Build frontend
make build    # Build backend
make run      # Run
go test ./... # Test
```

## Production Build

```bash
./build.sh

# Output: dist/v<VERSION>/
# - tmd-cloud-linux-amd64
# - tmd-agent-linux-amd64
# - tmd-agent-linux-arm64
# - tmd-agent-darwin-amd64
# - tmd-agent-darwin-arm64
```

## Versioning

Version stored in `VERSION` file, date-based format:

```
0.3.26     # March 26, 2026
0.3.26.1   # Second update same day
```

Update version:

```bash
echo "0.3.27" > VERSION
```

## Project Structure

```
tmdx/
├── VERSION           # Version number
├── build.sh          # Production build
├── AGENTS.md         # Coding guidelines
│
├── agent/            # Local agent
│   ├── cmd/tmd-agent/main.go
│   └── internal/
│       ├── config/   # Configuration
│       ├── auth/     # Token handling
│       ├── relay/    # WebSocket client
│       ├── terminal/ # Terminal/tmux
│       └── sanitize/ # Input validation
│
├── cloud/            # Cloud server
│   ├── cmd/cloud/main.go
│   └── internal/
│       ├── config/   # Configuration
│       ├── db/       # SQLite database
│       ├── auth/     # JWT authentication
│       ├── ws/       # WebSocket relay
│       ├── routes/   # HTTP API
│       └── static/   # Embedded frontend
│
└── dist/             # Build output
```

## Frontend Assets

Cloud frontend is fully localized for offline operation:

- **Fonts**: `cloud/internal/static/public/fonts/`
- **Monaco Editor**: `cloud/internal/static/public/lib/monaco/`
- **Marked.js**: Markdown parsing
- **DOMPurify**: XSS protection

```bash
cd cloud
npm install monaco-editor@latest
cp -r node_modules/monaco-editor/min/vs internal/static/public/lib/monaco/vs
npm run build
```

## Environment Variables (Cloud)

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Listen address |
| `PORT` | `1071` | Listen port |
| `DB_PATH` | `data/tmdx.db` | SQLite database path |
| `JWT_SECRET` | (random) | JWT signing secret |

## Coding Guidelines

See [AGENTS.md](AGENTS.md) for detailed coding conventions.
