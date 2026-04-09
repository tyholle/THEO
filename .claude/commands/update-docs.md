# Update Documentation Task
You are updating documentation after code changes.

## 1. Identify Changes
- Check recent files modified for what changed
- Identify which features or modules were affected
- Note any new files, deleted files, or renamed files

## 2. Verify Current Implementation
**CRITICAL**: Do NOT trust existing documentation. Read the actual code.

For each changed file:
- Read the current implementation
- Understand actual behavior
- Note any differences between what the docs say and what the code actually does

## 3. Update Relevant Documentation
- **CLAUDE.md** - Update any sections that no longer reflect reality
- **CHANGELOG.md** - Add entry under "Unreleased" section
  - Use categories: Added, Changed, Fixed, Removed
  - Use plain English that a non-technical person can understand

## 4. Documentation Style Rules
✅ Concise - get to the point
✅ Practical - examples over theory
✅ Accurate - based on actual code, not assumptions
✅ Plain English - no jargon without explanation
❌ No technical fluff
❌ No outdated information
❌ No assumptions without verifying in the code

## About The Developer
- Complete beginner with no technical background
- Write all documentation in plain English
- Never use technical terms without explaining them
- Documentation should be readable by someone with no coding experience

## 5. Ask If Uncertain
If you are unsure about the intent behind a change or its impact, ask before documenting it. Never guess.