# Agent SDK Architecture — Aglamazo as a Product

**Created:** 2026-04-09
**Priority:** medium
**Quadrant:** schedule
**Tags:** aglamazo, architecture, agent-sdk
**Repo:** aglamazo

## Description

Design and implement the architecture to wrap Claude Agent SDK inside Aglamazo, turning it into a product that non-developers can use.

Key decisions from design session:
- **UI stays on Vercel** (Next.js, current setup) — no change needed
- **Add an Agent Service** (Railway / Fly.io / Pi for personal use) — always-on Node.js or Python process that runs Claude Agent SDK
- **Per-user `.claude/` directories** on the agent server — each user gets their own skills, memory, and CLAUDE.md
- **Session management via Redis** — maps session_id → user, enables multi-turn conversations
- **MCP server** exposing Aglamazo data (todos, grocery lists, board items) as Claude tools

Architecture flow:
```
Browser → Aglamazo UI (Vercel) → Vercel API route (auth/routing) → Agent Service (SSE stream) → Anthropic API
                                                                         ↕
                                                                   MCP: Aglamazo data
```

## Acceptance Criteria

- [ ] Agent Service scaffolded (HTTP + SSE endpoint, session manager)
- [ ] Per-user `.claude/` dir created on first session, persisted across sessions
- [ ] At least one MCP tool working (e.g. read user's todo list)
- [ ] Vercel API route proxies to Agent Service with auth
- [ ] End-to-end test: user types in Aglamazo UI → Claude responds using their data
- [ ] Pi can serve as Agent Service for personal/dev use
