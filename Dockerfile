# Use the official Bun image
FROM oven/bun:1.2.20 as builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./
COPY symlabs-plugins-fixed/plugin-blinks/package.json ./symlabs-plugins-fixed/plugin-blinks/
COPY symlabs-plugins-fixed/plugin-defi/package.json ./symlabs-plugins-fixed/plugin-defi/

# Install dependencies
RUN bun install --frozen-lockfile || bun install

# Copy source code
COPY . .

# Build the project
RUN bun run build

# Production stage
FROM oven/bun:1.2.20

WORKDIR /app

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/symlabs-plugins-fixed ./symlabs-plugins-fixed

# Create .env from build args or use example
ARG ENV_FILE
COPY ${ENV_FILE:-.env.example} ./.env

# Expose ports
EXPOSE 3000 3001

# Start the application
CMD ["bun", "run", "start"]