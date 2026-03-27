VERSION := $(shell cat VERSION | tr -d '[:space:]')

.PHONY: build version clean help

build: ## Build all binaries
	@./scripts/build.sh

version: ## Update version number
	@./scripts/update-ver.sh

clean: ## Remove build artifacts
	@rm -rf dist/

help: ## Show this help
	@grep -E '^[a-z]+:.*##' $(MAKEFILE_LIST) | column -t -s ':'
