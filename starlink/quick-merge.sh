#!/bin/bash
# Quick PR creation and merge script for Starlink app
# Usage: ./quick-merge.sh [PR_TITLE]

set -e

REPO="ThatRick/WebApps"
BASE_BRANCH="main"
CURRENT_BRANCH=$(git branch --show-current)

# Default PR title from last commit if not provided
if [ -z "$1" ]; then
    PR_TITLE=$(git log -1 --pretty=%s)
else
    PR_TITLE="$1"
fi

# Get last commit message as PR body
PR_BODY=$(git log -1 --pretty=%B | tail -n +2)

echo "📦 Repository: $REPO"
echo "🌿 Current branch: $CURRENT_BRANCH"
echo "🎯 Base branch: $BASE_BRANCH"
echo "📝 PR Title: $PR_TITLE"
echo ""

# Push current branch
echo "⬆️  Pushing to origin..."
git push -u origin "$CURRENT_BRANCH"
echo "✅ Pushed successfully"
echo ""

# Check if gh CLI is available
if command -v gh &> /dev/null; then
    echo "🚀 GitHub CLI detected! Creating and merging PR..."

    # Create PR and auto-merge
    PR_URL=$(gh pr create \
        --base "$BASE_BRANCH" \
        --head "$CURRENT_BRANCH" \
        --title "$PR_TITLE" \
        --body "$PR_BODY" \
        2>&1 | grep "https://github.com" || echo "")

    if [ -n "$PR_URL" ]; then
        echo "✅ PR created: $PR_URL"

        # Auto-merge the PR
        echo "🔀 Auto-merging PR..."
        gh pr merge "$PR_URL" --merge --delete-branch
        echo "✅ PR merged and branch deleted!"
    fi
else
    echo "⚠️  GitHub CLI (gh) not found. Using browser method..."
    echo ""

    # URL encode the title and body
    ENCODED_TITLE=$(printf %s "$PR_TITLE" | jq -sRr @uri)
    ENCODED_BODY=$(printf %s "$PR_BODY" | jq -sRr @uri)

    # Generate GitHub PR creation URL
    PR_URL="https://github.com/$REPO/compare/$BASE_BRANCH...$CURRENT_BRANCH?expand=1&title=$ENCODED_TITLE&body=$ENCODED_BODY"

    echo "📋 Quick PR URL (1-click to create):"
    echo "$PR_URL"
    echo ""
    echo "To enable full automation, install GitHub CLI:"
    echo "  brew install gh    # macOS"
    echo "  Or visit: https://cli.github.com"
    echo ""
    echo "Then authenticate with: gh auth login"
fi
