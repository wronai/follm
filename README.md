# FOLLM - AI-Powered Form Filler

A powerful form filling automation tool that combines Playwright for browser automation with AI assistance. Fill out web forms automatically with ease, either through a simple CLI or a user-friendly web interface.

## ✨ Features

- 🖥️ **Command Line Interface** - Fill forms directly from your terminal
- 🌐 **Web Interface** - User-friendly web UI for form filling
- 🤖 **AI-Powered** - Smart form field detection and filling
- 📄 **File Uploads** - Support for file upload fields
- 📸 **Screenshots** - Automatic screenshots before and after filling
- 🍪 **Cookie Handling** - Automatic cookie consent management
- 🐳 **Docker Support** - Easy containerized deployment

## 🚀 Installation

### Prerequisites

- Node.js 18 or later
- npm or yarn
- Playwright browsers (installed automatically)

### Install as a global CLI tool

```bash
npm install -g follm
```

### Or use with npx

```bash
npx follm <command>
```

## 💻 CLI Usage

### Fill a form

```bash
follm fill https://example.com/form
```

### Fill a form with data

```bash
follm fill https://example.com/form --data '{"name":"John","email":"john@example.com"}'
```

### Upload a file

```bash
follm fill https://example.com/upload --file ./resume.pdf
```

### Submit the form after filling

```bash
follm fill https://example.com/form --data '{"name":"John"}' --submit
```

### Show the browser window

```bash
follm fill https://example.com/form --show-browser
```

### Keep the browser open after completion

```bash
follm fill https://example.com/form --keep-open
```

## 🌐 Web Interface

Start the web server:

```bash
follm serve
```

Then open `http://localhost:3000` in your browser.

### Web Interface Features

- Simple form to enter URL and form data
- File upload support
- Screenshot preview
- Download filled form screenshots
- Responsive design

## 🐳 Docker Support

### Build the Docker image

```bash
docker build -t follm .
```

### Run the container

```bash
docker run -p 3000:3000 -v $(pwd):/app follm serve
```

## 📝 Example

Fill out a contact form:

```bash
follm fill https://example.com/contact \
  --data '{"name":"John Doe","email":"john@example.com","message":"Hello!"}' \
  --submit
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT
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