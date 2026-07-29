#!/bin/bash
set -e

echo "📦 Staging all changes..."
git add -A

echo ""
read -p "💬 Commit message (Enter for default): " MSG
MSG="${MSG:-Update site}"

echo ""
echo "📝 Committing: $MSG"
git commit -m "$MSG"

echo ""
echo "🚀 Pushing to origin main..."
git push origin main

echo ""
echo "✅ Pushed! GitHub Actions will deploy shortly."
echo "👉 Check progress: https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/actions"
