# Agent Guidelines

See also: ~/develop/AGENTS.md (common coding standards)

## Core Principles

### a) No commit before testing
- You (operator) test the functionality in the browser
- Once you confirm it works, then I commit
- Don't commit until you say "it works" or similar confirmation

### b) No log removal before bug fixed
- Keep console.log and debug statements until the feature is verified working
- Only remove logs after you confirm the bug is fixed
- Use logs to help debug during development

### c) Do exactly what is asked
- Follow your instructions precisely
- Don't add extra features or "improvements" not requested
- **DO suggest improvements** - but wait for your approval before implementing them
- Avoid scope creep

### d) Ask if unsure about existing code
- Before implementing something, I check if it already exists
- If uncertain, I ask: "Should I check if there's already [feature] in the code?"
- Don't assume or guess
- Search the codebase when uncertain

### e) Don't repeat yourself
- Read previous context to avoid asking the same questions
- Reference earlier decisions and implementations
- Don't re-implement what was already done
- Check the conversation history for context

### f) Use proper data access patterns
- **Frontend**: Use Store classes (subjectStore, transactionStore, etc.)
- Don't bypass these patterns with direct localStorage/IndexedDB access
- Each store is responsible for its own persistence

## What NOT to do
- Don't run npm/npx commands (you handle that)
- Don't commit until you test and confirm it works
- Don't remove logs until you say the bug is fixed
- Don't implement improvements without your approval
- Don't implement features beyond what was requested

## Workflow

1. Understand the requirement completely
2. Check if related code already exists
3. Suggest any improvements you notice
4. Wait for your approval on suggestions
5. Implement exactly as requested (or approved improvements)
6. Tell you to test in browser
7. Wait for your confirmation that it works
8. Commit with clear message
