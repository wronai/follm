.PHONY: build up down test clean help local-up local-down local-logs local-shell

# Configuration
PORT ?= 3001
COMPOSE := docker-compose -f docker-compose.yml
COMPOSE_LOCAL := docker-compose -f docker-compose.local.yml

# Containerized deployment (with Ollama in Docker)
build:
	@echo "Building containerized deployment..."
	$(COMPOSE) build

up:
	@echo "Starting containerized deployment..."
	$(COMPOSE) up -d

down:
	@echo "Stopping containerized deployment..."
	$(COMPOSE) down

# Local development (with local Ollama)
local-up:
	@echo "Starting local development environment..."
	@echo "Ensure Ollama is running locally: ollama serve"
	$(COMPOSE_LOCAL) up -d

local-down:
	@echo "Stopping local development environment..."
	$(COMPOSE_LOCAL) down

local-logs:
	@echo "Tailing logs for local development..."
	$(COMPOSE_LOCAL) logs -f

local-shell:
	@echo "Opening shell in local development container..."
	$(COMPOSE_LOCAL) exec form-filler-local /bin/bash

# Common commands
test: local-up
	@echo "Waiting for services to start..."
	@sleep 5
	@echo "\nTesting form filling..."
	@echo "Creating a test file..."
	@echo "Test CV content" > test_cv.txt
	@curl -v -X POST http://localhost:$(PORT)/fill-form \
	  -F "url=http://localhost:$(PORT)/test" \
	  -F "firstName=Jan" \
	  -F "lastName=Kowalski" \
	  -F "email=jan@example.com" \
	  -F "phone=123456789" \
	  -F "message=Test message" \
	  -F "file=@test_cv.txt"
	@echo "\nTest completed. Check the browser for results."

logs:
	@echo "Tailing logs..."
	$(COMPOSE) logs -f

clean: down local-down
	@echo "Cleaning up..."
	rm -f test_cv.txt result.png
	docker-compose -f docker-compose.yml rm -f
	docker-compose -f docker-compose.local.yml rm -f
	docker volume prune -f

# Show help
help:
	@echo "\n=== AI Form Filler Commands ===\n"
	@echo "Containerized Deployment (with Ollama in Docker):"
	@echo "  make build        # Build Docker images"
	@echo "  make up           # Start all services"
	@echo "  make down         # Stop all services"
	@echo "  make logs         # View container logs\n"
	@echo "Local Development (with local Ollama):"
	@echo "  make local-up     # Start local dev environment"
	@echo "  make local-down   # Stop local dev environment"
	@echo "  make local-logs   # View local dev logs"
	@echo "  make local-shell  # Open shell in dev container\n"
	@echo "Testing:"
	@echo "  make test         # Run form filling test\n"
	@echo "Maintenance:"
	@echo "  make clean        # Clean up all resources"
	@echo "  make help         # Show this help\n"
	@echo "Note: For local development, ensure Ollama is running: ollama serve"
