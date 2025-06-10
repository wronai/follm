# AI Form Filler with Playwright and Mistral

A minimal form filling automation solution using Playwright for browser automation and Mistral (via Ollama) for AI-powered form interaction.

## Features

- 🚀 Automated form filling with AI assistance
- 📄 File upload support
- 🐳 Docker containerization
- 🤖 Local or containerized Ollama deployment options
- 🔄 Health checks and monitoring endpoints

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- Ollama (if using local instance)

## 🚀 Quick Start

### Option 1: Containerized Deployment (Recommended)

This option runs everything in Docker containers, including Ollama.

```bash
# Build and start all services
make build
make up

# View logs
make logs

# Run a test form fill
make test

# Stop services
make down
```

### Option 2: Local Development with Local Ollama

For development with a local Ollama instance (faster iterations):

```bash
# In terminal 1: Start Ollama
ollama serve

# In terminal 2: Start the application
make local-up

# View application logs
make local-logs

# Access the application
open http://localhost:3001

# Open a shell in the container
make local-shell

# Run tests
make test

# Stop the application
make local-down
```

### Development Workflow

1. Start your local Ollama instance
2. Run `make local-up` to start the development server
3. The application will be available at `http://localhost:3001`
4. Use `make local-logs` to monitor logs
5. Make code changes - they'll be automatically reloaded
6. Run `make test` to test form filling

### Environment Variables

Create a `.env` file with your configuration:

```env
PORT=3001
NODE_ENV=development
OLLAMA_HOST=host.docker.internal:11434
DEBUG=app:*,playwright:*,form-filler:*
```

### Makefile Commands

```bash
# Containerized Deployment
make build    # Build Docker images
make up       # Start all services
make down     # Stop all services
make logs     # View container logs

# Local Development
make local-up     # Start local dev environment
make local-down   # Stop local dev environment
make local-logs   # View local dev logs
make local-shell  # Open shell in dev container

# Testing & Maintenance
make test    # Run form filling test
make clean   # Clean up all resources
make help    # Show all available commands
```

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

```bash
cp .env.example .env
```

## API Endpoints

- `GET /health` - Health check endpoint
- `GET /test` - Test form page
- `POST /fill-form` - Main form filling endpoint

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Cleanup

To stop all services and clean up:

```bash
make clean
```

## Configuration

Edit `docker-compose.yml` or `docker-compose.local.yml` to adjust resource limits, ports, or other settings.