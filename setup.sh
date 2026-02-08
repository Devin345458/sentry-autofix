#!/bin/bash
set -e

echo "=== Sentry Autofix Setup ==="

# 1. Install dependencies
echo "[1/5] Installing npm dependencies..."
npm install

# 2. Create data and logs directories
echo "[2/5] Creating directories..."
mkdir -p data logs

# 3. Copy config if needed
if [ ! -f config.json ]; then
  echo "[3/5] Creating config.json from template..."
  cp config.example.json config.json
  echo "  -> Edit config.json to map your Sentry projects to GitHub repos"
else
  echo "[3/5] config.json already exists, skipping"
fi

# 4. Copy .env if needed
if [ ! -f .env ]; then
  echo "[4/5] Creating .env from template..."
  cp .env.example .env
  echo "  -> Edit .env to set your SENTRY_CLIENT_SECRET"
else
  echo "[4/5] .env already exists, skipping"
fi

# 5. Verify tools
echo "[5/5] Checking required tools..."

if command -v node &> /dev/null; then
  echo "  node: $(node --version)"
else
  echo "  ERROR: node not found. Install via: brew install node"
  exit 1
fi

if command -v gh &> /dev/null; then
  echo "  gh: $(gh --version | head -1)"
else
  echo "  ERROR: gh not found. Install via: brew install gh"
  exit 1
fi

if command -v claude &> /dev/null; then
  echo "  claude: found"
else
  echo "  WARNING: claude CLI not found. Install via: npm install -g @anthropic-ai/claude-code"
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit config.json with your Sentry project -> GitHub repo mappings"
echo "  2. Edit .env with your SENTRY_CLIENT_SECRET"
echo "  3. Run: npm start"
echo "  4. Expose via Cloudflare Tunnel: cloudflared tunnel --url http://localhost:3000"
echo "  5. Add the tunnel URL as a webhook in your Sentry integration"
echo ""
echo "To install as a persistent service (macOS):"
echo "  1. Update paths in com.sentry-autofix.plist"
echo "  2. cp com.sentry-autofix.plist ~/Library/LaunchAgents/"
echo "  3. launchctl load ~/Library/LaunchAgents/com.sentry-autofix.plist"
