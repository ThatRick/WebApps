#!/bin/bash
# Instant PR creation - just run and click the link!
# Usage: ./auto-pr.sh

REPO="ThatRick/WebApps"
CURRENT_BRANCH=$(git branch --show-current)
BASE_BRANCH="main"

# Push current branch
git push -u origin "$CURRENT_BRANCH" 2>/dev/null || true

# Generate simple PR URL
echo ""
echo "🚀 Click here to create PR:"
echo "https://github.com/$REPO/compare/$BASE_BRANCH...$CURRENT_BRANCH?expand=1"
echo ""
echo "💡 Tip: Install GitHub CLI for one-command PR creation + merge:"
echo "   Visit: https://cli.github.com and run: gh auth login"
echo "   Then use: gh pr create --fill && gh pr merge --auto --merge"
