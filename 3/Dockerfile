# Use Node.js LTS
FROM node:18-alpine

# Install system dependencies for Playwright and other tools
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# Set environment variables for Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV NODE_ENV=production
ENV PORT=3000

# Create app directory and set as working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./


# Install app dependencies
RUN npm install --production

# Install Playwright browsers
RUN npx playwright install chromium

# Create necessary directories
RUN mkdir -p /app/uploads /app/screenshots /app/logs

# Copy only necessary files
COPY main-enterprise.js ./
COPY package.json ./

# Set the command to run the app
CMD ["node", "main-enterprise.js"]
