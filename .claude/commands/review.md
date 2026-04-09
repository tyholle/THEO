# Code Review Task
Perform a comprehensive code review. Be thorough but concise.

## Check For

**Logging** - No console.log statements left in, uses proper error logging

**Error Handling** - Errors are caught and handled gracefully, helpful error messages

**TypeScript** - No `any` types, proper interfaces defined, no @ts-ignore shortcuts

**Production Readiness** - No debug statements, no TODO comments, no hardcoded secrets or API keys

**React/Hooks** - No infinite loops, effects have cleanup, dependencies correct

**Performance** - No unnecessary re-renders, expensive calculations optimized

**Security** - Auth checked on protected routes, inputs validated, RLS policies in place on all Supabase tables

**Architecture** - Follows existing patterns, code placed in correct directory

## About The Developer
- Complete beginner with no technical background
- Explain every issue you find in plain English
- Don't just say what's wrong — explain why it's a problem and exactly how to fix it
- Prioritize issues by severity so I know what to fix first

## Output Format

### ✅ Looks Good
- [Item 1]
- [Item 2]

### ⚠️ Issues Found
- **[Severity]** [File name] - [Issue described in plain English]
  - Why this is a problem: [explanation]
  - How to fix it: [exact fix]

### 📊 Summary
- Files reviewed: X
- Critical issues: X
- Warnings: X

## Severity Levels
- **CRITICAL** - Security risk, data loss, or app will crash
- **HIGH** - Bug that affects users or bad performance
- **MEDIUM** - Code quality or maintainability problem
- **LOW** - Minor style or improvement suggestion