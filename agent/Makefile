.PHONY: build clean test install run help

# Variables
BINARY_NAME=tmd-agent
BUILD_DIR=build
GO=go
GOFLAGS=-v

# Default target
all: build

# Build the binary
build:
	@echo "Building $(BINARY_NAME)..."
	$(GO) build $(GOFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/tmd-agent

# Clean build artifacts
clean:
	@echo "Cleaning..."
	rm -rf $(BUILD_DIR)
	$(GO) clean

# Run tests
test:
	@echo "Running tests..."
	$(GO) test ./...

# Install to GOPATH/bin
install:
	@echo "Installing $(BINARY_NAME)..."
	$(GO) install ./cmd/tmd-agent

# Run in foreground
run:
	@echo "Running $(BINARY_NAME)..."
	$(GO) run ./cmd/tmd-agent start

# Run in daemon mode
run-daemon:
	@echo "Running $(BINARY_NAME) in daemon mode..."
	$(GO) run ./cmd/tmd-agent start --daemon

# Show status
status:
	$(GO) run ./cmd/tmd-agent status

# Stop daemon
stop:
	$(GO) run ./cmd/tmd-agent stop

# Show help
help:
	@echo "Available targets:"
	@echo "  build       - Build the binary"
	@echo "  clean       - Clean build artifacts"
	@echo "  test        - Run tests"
	@echo "  install     - Install to GOPATH/bin"
	@echo "  run         - Run in foreground"
	@echo "  run-daemon  - Run in daemon mode"
	@echo "  status      - Show agent status"
	@echo "  stop        - Stop daemon"
	@echo "  help        - Show this help"

# Development helpers
lint:
	@echo "Running linter..."
	golangci-lint run

fmt:
	@echo "Formatting code..."
	$(GO) fmt ./...

vet:
	@echo "Running go vet..."
	$(GO) vet ./...

# Cross-compilation
build-linux:
	GOOS=linux GOARCH=amd64 $(GO) build -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 ./cmd/tmd-agent

build-linux-arm:
	GOOS=linux GOARCH=arm GOARM=6 $(GO) build -o $(BUILD_DIR)/$(BINARY_NAME)-linux-armv6 ./cmd/tmd-agent

build-linux-arm64:
	GOOS=linux GOARCH=arm64 $(GO) build -o $(BUILD_DIR)/$(BINARY_NAME)-linux-arm64 ./cmd/tmd-agent

build-darwin:
	GOOS=darwin GOARCH=amd64 $(GO) build -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-amd64 ./cmd/tmd-agent

build-darwin-arm64:
	GOOS=darwin GOARCH=arm64 $(GO) build -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-arm64 ./cmd/tmd-agent

build-all: build-linux build-linux-arm build-linux-arm64 build-darwin build-darwin-arm64
