#!/bin/bash

# Setup GitHub Secrets Script
# This script configures GitHub repository secrets for CI/CD

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔐 Configuring GitHub Repository Secrets${NC}"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please create a .env file with your configuration"
    exit 1
fi

# Load .env file
export $(grep -v '^#' .env | xargs)

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) not installed${NC}"
    echo "Install it from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}Not authenticated with GitHub${NC}"
    echo "Running gh auth login..."
    gh auth login
fi

echo -e "${YELLOW}Setting GitHub repository secrets...${NC}"
echo ""

# Set Heroku secrets
echo "Setting Heroku secrets..."
gh secret set HEROKU_API_KEY --body "$HEROKU_API_KEY"
gh secret set HEROKU_APP_NAME --body "$HEROKU_APP_NAME"
gh secret set HEROKU_EMAIL --body "$HEROKU_EMAIL"

# Set Linear secret
echo "Setting Linear API key..."
gh secret set LINEAR_API_KEY --body "$LINEAR_API_KEY"

# Set Supabase test secrets (optional)
echo "Setting Supabase test secrets..."
gh secret set SUPABASE_URL_TEST --body "$SUPABASE_URL"
gh secret set SUPABASE_SERVICE_ROLE_KEY_TEST --body "$SUPABASE_SERVICE_ROLE_KEY"

# Optional: Codecov token
if [ ! -z "$CODECOV_TOKEN" ]; then
    echo "Setting Codecov token..."
    gh secret set CODECOV_TOKEN --body "$CODECOV_TOKEN"
else
    echo -e "${YELLOW}No CODECOV_TOKEN found (optional)${NC}"
fi

echo ""
echo -e "${GREEN}✅ GitHub secrets configured!${NC}"
echo ""
echo "View secrets:"
echo "  gh secret list"
echo ""
echo "Next steps:"
echo "1. Push code to trigger CI: git push"
echo "2. Create a PR to test the CI workflow"
echo "3. Check Actions tab: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions"
