FROM node:20-bookworm-slim

# Install git, gh CLI, python3, make, g++ (for better-sqlite3 native module)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    python3 \
    make \
    g++ \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Persistent data directories (mount as volumes)
RUN mkdir -p /data /repos

ENV NODE_ENV=production
ENV DB_PATH=/data/sentry-autofix.db
ENV REPOS_DIR=/repos
ENV PORT=3000

# Claude Code configuration (CLAUDE_CODE_PATH empty = auto-resolve from node_modules)
ENV CLAUDE_CODE_PATH=
ENV CLAUDE_MODEL=sonnet-4-5

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
