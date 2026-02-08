FROM node:20-bookworm-slim

# Install git, gh CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (includes @anthropic-ai/claude-code)
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy source
COPY src/ ./src/

# Persistent data directories (mount as volumes)
RUN mkdir -p /data /repos /app/logs

ENV NODE_ENV=production
ENV DB_PATH=/data/sentry-autofix.db
ENV REPOS_DIR=/repos
ENV PORT=3000

# Claude Code pointed at local Ollama
ENV ANTHROPIC_BASE_URL=http://host.docker.internal:11434
ENV ANTHROPIC_API_KEY=""
ENV ANTHROPIC_MODEL=qwen2.5-coder:14b

EXPOSE 3000

CMD ["node", "src/index.js"]
