# Never use `git stash`

If a branch switch needs the working tree clean, commit the work first (a WIP commit is fine —
amend or squash later) rather than stashing it.

**Why:** this repo already has 5+ pre-existing stashes nobody tracks the contents of; don't add
to that pile. If you're unsure whether to commit, ask rather than stash.
