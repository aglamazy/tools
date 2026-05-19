# Add Ant loose-ends checks: email deliverability + 404 link sweep

**Created:** 2026-04-29
**Priority:** medium
**Quadrant:** schedule
**Tags:** ant, monitoring, managed-domains
**Repo:** aglamazo (touchpoint repo — actual Ant code lives in `/home/yaakov/develop/Aglamaz/cicd/scripts/code_maintenance_agent.sh` and adjacent files)

## Description

Extend Ant with two new "loose ends" checks that run across all managed domains (agents-head, aglamazo, yaakov.aglamaz, tishrey-center) on Ant's existing schedule. Both should emit standard healthcheck-style alerts so the maintenance agent can pick them up automatically.

### Check 1 — Email deliverability
For each public email address found in a site's content (mailto links, contact section data, footer), verify the address is actually reachable:
- DNS MX lookup for the domain
- SMTP RCPT probe to confirm the mailbox exists
- Flag bounces / non-existent addresses

**Why this matters now:** tishrey-center.co.il had `tishrey.center@gmail.com` displayed publicly as the contact email. The address doesn't exist — Gmail returned "הכתובת לא נמצאה". Visitors who clicked mailto saw a bounce. We had no detection.

### Check 2 — 404 / dead-link sweep
Per-domain crawl (internal + external links), report broken ones. agents-head.com already has a broken-link checker (see `/home/yaakov/develop/AgentsHead`) — promote it into Ant so it runs across all managed domains, not just one.

## Acceptance Criteria

- [ ] Both checks live alongside existing Ant probes (or under the `code_maintenance_agent.sh` ecosystem if that's where Ant integrates today — investigate first)
- [ ] Run on every managed domain in `project_managed_domains` (agents-head, aglamazo, yaakov.aglamaz, tishrey-center)
- [ ] Email check sources its addresses from the live site (don't hard-code) — content scraping or a per-project config
- [ ] Link check covers both internal and external links; external timeouts don't false-positive
- [ ] Both produce healthcheck-style alerts (per `project_healthchecks_grace.md` — include `path:` tag for auto-investigation)
- [ ] First scheduled run produces a clean report or surfaces real bounces / 404s
- [ ] Document in `project_seo_agent_hygiene.md` so the maintenance agent picks them up in its loop
