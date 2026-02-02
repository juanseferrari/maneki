#!/bin/bash

# Setup Heroku Configuration Variables Script
# This script configures all necessary environment variables in Heroku

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Configuring Heroku Environment Variables${NC}"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please create a .env file with your configuration"
    exit 1
fi

# Load .env file
export $(grep -v '^#' .env | xargs)

# Check if Heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo -e "${RED}Error: Heroku CLI not installed${NC}"
    echo "Install it from: https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

# Get Heroku app name
HEROKU_APP="${HEROKU_APP_NAME:-maneki}"
echo -e "${YELLOW}Configuring app: ${HEROKU_APP}${NC}"
echo ""

# Set configuration variables
echo "Setting Supabase configuration..."
heroku config:set \
  SUPABASE_URL="$SUPABASE_URL" \
  SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  SUPABASE_BUCKET_NAME="$SUPABASE_BUCKET_NAME" \
  --app "$HEROKU_APP"

echo "Setting database configuration..."
heroku config:set \
  DATABASE_URL="$DATABASE_URL" \
  --app "$HEROKU_APP"

echo "Setting Claude API key..."
if [ -z "$ANTHROPIC_API_KEY" ] || [ "$ANTHROPIC_API_KEY" = "your_anthropic_api_key" ]; then
    echo -e "${YELLOW}Warning: ANTHROPIC_API_KEY not set in .env${NC}"
    echo "Please set it manually:"
    echo "  heroku config:set ANTHROPIC_API_KEY=your_key --app $HEROKU_APP"
else
    heroku config:set \
      ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
      --app "$HEROKU_APP"
fi

echo "Setting Linear integration..."
heroku config:set \
  LINEAR_API_KEY="$LINEAR_API_KEY" \
  LINEAR_WEBHOOK_SECRET="$LINEAR_WEBHOOK_SECRET" \
  --app "$HEROKU_APP"

echo "Setting GitHub token..."
if [ -z "$GITHUB_TOKEN" ] || [ "$GITHUB_TOKEN" = "your_github_personal_access_token" ]; then
    echo -e "${YELLOW}Warning: GITHUB_TOKEN not set in .env${NC}"
    echo "Please set it manually:"
    echo "  heroku config:set GITHUB_TOKEN=your_token --app $HEROKU_APP"
else
    heroku config:set \
      GITHUB_TOKEN="$GITHUB_TOKEN" \
      --app "$HEROKU_APP"
fi

echo "Setting Google OAuth..."
heroku config:set \
  GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
  --app "$HEROKU_APP"

echo "Setting session secret..."
heroku config:set \
  SESSION_SECRET="$SESSION_SECRET" \
  --app "$HEROKU_APP"

echo "Setting other services..."
heroku config:set \
  MERCADOPAGO_CLIENT_ID="$MERCADOPAGO_CLIENT_ID" \
  MERCADOPAGO_CLIENT_SECRET="$MERCADOPAGO_CLIENT_SECRET" \
  EMAIL_WEBHOOK_SECRET="$EMAIL_WEBHOOK_SECRET" \
  --app "$HEROKU_APP"

echo "Setting server configuration..."
heroku config:set \
  NODE_ENV=production \
  BASE_URL="https://$HEROKU_APP.herokuapp.com" \
  --app "$HEROKU_APP"

echo ""
echo -e "${GREEN}✅ Configuration complete!${NC}"
echo ""
echo "View all config vars:"
echo "  heroku config --app $HEROKU_APP"
echo ""
echo "Next steps:"
echo "1. Run database migrations: npm run migrate:prod (if available)"
echo "2. Deploy: git push heroku main"
echo "3. Check logs: heroku logs --tail --app $HEROKU_APP"
