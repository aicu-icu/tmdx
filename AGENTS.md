# AGENTS.md - Coding Agent Guidelines

## Project Overview

Monorepo for **TmdX** - a terminal management platform with two Go 1.21 modules:

- **`agent/`** - Local agent binary (`tmd-agent`) for terminal management and cloud relay
- **`cloud/`** - Cloud WebSocket relay server with OAuth, SQLite, and HTTP API

### Versioning

- Version stored in root `VERSION` file
- Date-based format: `0.M.D` (e.g., `0.3.26` for March 26)
- Same-day updates: `0.M.D.N` (e.g., `0.3.26.1`)
- Both modules share the same version number

## Build / Lint / Test Commands

### Root (production builds)

```bash
./build.sh                           # Build both modules for production
                                     # Outputs to dist/v<VERSION>/
```

### agent

```bash
cd agent

make build                           # → build/tmd-agent
make test                            # → go test ./...
go test ./internal/sanitize/ -run TestSanitizeIdentifier -v  # single test
go test ./internal/config/ -run TestConfig -v                # single test
make lint                            # → golangci-lint run
make fmt                             # → go fmt ./...
make vet                             # → go vet ./...
make run                             # → go run ./cmd/tmd-agent start
```

### cloud

```bash
cd cloud

make build                           # → ./tmd-cloud (runs npm run build first)
make run                             # → build then execute
go test ./...                        # Run all tests
go test ./internal/db/ -run TestFunctionName -v  # single test
npm run build                        # Minify JS (terser + obfuscator)
```

## Code Style

### Imports

Group in three blocks: stdlib, third-party, internal. Use module name as import path:

```go
import (
    "fmt"
    "os"

    "github.com/gin-gonic/gin"
    "github.com/gorilla/websocket"

    "agent/internal/config"
    "cloud/internal/auth"
)
```

### Naming Conventions

- **Packages**: lowercase, single-word (`config`, `relay`, `sanitize`, `ws`)
- **Exported**: PascalCase (`New`, `GetDB`, `Config`, `RelayClient`)
- **Unexported**: camelCase (`getEnvOrDefault`, `runMigrations`, `handleDisconnect`)
- **JSON tags**: camelCase (`json:"agentId"`, `json:"displayName"`)
- **Acronyms**: all caps (`ID`, `URL`, `OS`, `DB`, `HTTP`)

### Error Handling

- Wrap errors: `fmt.Errorf("action: %w", err)`
- Fatal: `log.Fatalf("message: %v", err)`
- HTTP: `c.JSON(status, gin.H{"error": "message"})`
- Don't ignore errors with `_` unless intentional
- Return early on error to reduce nesting

### Logging

Use `log.Printf` or `fmt.Printf` with `[Component]` prefix:

```go
log.Printf("[RelayClient] Connecting to %s...", url)
fmt.Printf("[api] Pairing approved: %s -> agent %s\n", code, agentID)
```

### Structs & Types

- PascalCase fields with JSON tags
- Pointer types for optional/nullable fields (`*string`, `*int64`)
- Group related constants in `const` blocks

### Concurrency

- `sync.Mutex` / `sync.RWMutex` for shared state
- Lock before map access; use `defer mu.Unlock()` or explicit unlock
- `sync.RWMutex` for read-heavy workloads (use `RLock`/`RUnlock`)
- Separate write mutex (`writeMu`) for WebSocket concurrent writes
- Handle panics in goroutines with `defer recover()`

### HTTP Routes (cloud)

- Gin framework (`github.com/gin-gonic/gin`)
- Group routes: `api := r.Group("/api")`
- Auth middleware: `auth.RequireAuth()`
- Response: `c.JSON(status, gin.H{...})`
- Binding: `c.ShouldBindJSON(&body)`
- Early return on auth/validation failures

### WebSocket Patterns

- Use `github.com/gorilla/websocket`
- Separate read/write mutexes for concurrent writes (see `SafeWS` wrapper)
- Implement reconnection with exponential backoff
- Use `select` with `done` channel for graceful shutdown

### Database (cloud)

- `modernc.org/sqlite` (pure Go SQLite)
- Enable WAL mode and foreign keys on init
- Store password/token hashes, never plaintext
- Migrations: `_, _ = db.Exec("ALTER TABLE...")` (ignore errors for idempotency)

## Testing

Table-driven tests with `testing.T`:

```go
func TestSanitizeIdentifier(t *testing.T) {
    tests := []struct {
        input    string
        expected string
        hasError bool
    }{
        {"hello-world", "hello-world", false},
        {"", "", true},
    }
    for _, tc := range tests {
        result, err := SanitizeIdentifier(tc.input)
        if tc.hasError {
            if err == nil {
                t.Errorf("Expected error for %q", tc.input)
            }
        } else if result != tc.expected {
            t.Errorf("Expected %q, got %q", tc.expected, result)
        }
    }
}
```

- Files: `*_test.go` in same package
- Run single: `go test ./pkg/ -run TestName -v`

## File Organization

- Entry points: `cmd/<binary>/main.go`
- Internal packages: `internal/<package>/`
- Embedded files: `//go:embed` directive
- Version injection: `-ldflags "-X module/path.Variable=${VERSION}"`

## Key Dependencies

**agent**: `gorilla/websocket`, `google/uuid`, `creack/pty`
**cloud**: `gin-gonic/gin`, `golang-jwt/jwt`, `modernc.org/sqlite`, `gorilla/websocket`

## Security

- Never commit secrets or credentials to the repository
- Store only hashed passwords/tokens in database
- Use environment variables for configuration
- Validate and sanitize all external input (see `internal/sanitize`)

## Cloud Static Assets

- Frontend assets embedded in `internal/static/public/`
- Local fonts, Monaco Editor, Marked.js, DOMPurify (no CDN dependencies)
- `npm run build` minifies JS with terser + obfuscator
