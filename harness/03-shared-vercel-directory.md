# This directory is shared by multiple Vercel projects

This directory is shared by multiple Vercel projects (aglamazo, saliko, ...) distinguished by
project-level env vars — `.vercel/project.json` only points at ONE at a time, so a bare
`vercel deploy`/`vercel ls` silently targets whatever it's currently linked to, which may not
be the one you mean.

**Incident:** bit us 2026-08-02 — a saliko-targeted deploy landed on aglamazo instead.

**Rule:** use `scripts/vercel-deploy-scoped.sh <project-name> [vercel deploy args...]` — it
links, deploys, and restores the original link afterward even on failure.
