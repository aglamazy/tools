# Scout Webhook — Create leads from external sources

## Goal
Add a webhook endpoint so the Reddit scout (and other scouts) can create tasks in Aglamazo automatically.

## Endpoint
`POST /api/webhook/scout`

### Auth
API key in header: `Authorization: Bearer <SCOUT_API_KEY>`
Set SCOUT_API_KEY in env vars. The Pi scout sends this key with each request.

### Request Body
```json
{
  "source": "reddit",
  "title": "How to handle 200 invoices/week without losing my mind",
  "description": "r/smallbusiness · u/stressed_owner · 3h ago\n\nPain: manual invoice processing, 2 FTEs, error rate climbing",
  "url": "https://reddit.com/r/smallbusiness/comments/...",
  "classification": "LEAD",
  "score": 8,
  "suggested_reply": "The audit risk one hit home...",
  "priority": "medium",
  "tags": ["reddit", "invoice", "data-entry"]
}
```

### What it creates
A task in Dexie/Firestore with:
```typescript
{
  title: "🎯 [Reddit] How to handle 200 invoices/week...",
  taskType: 'lead',
  quadrant: classification === 'LEAD' ? 'do' : 'schedule',
  priority: body.priority || 'medium',
  subject: 'Scout Leads',
  tags: body.tags,
  ext: {
    type: 'lead',
    source: body.source,
    url: body.url,
    classification: body.classification,
    score: body.score,
    suggestedReply: body.suggested_reply
  }
}
```

### Response
```json
{ "ok": true, "taskId": 123 }
```

## Implementation

### File: `app/api/webhook/scout/route.ts`

Simple route that:
1. Validates API key from Authorization header
2. Validates request body
3. Creates task via Firestore (server-side, same pattern as agent tasks)
4. Returns task ID

### Firestore collection
Use the existing `users/{uid}/agentTasks` collection or create a new `users/{uid}/scoutLeads` collection. Recommendation: use the existing task system — leads show up in the Eisenhower matrix automatically.

### User mapping
The webhook needs to know which user to create tasks for. Options:
- Hardcode yaakov's UID (simplest for now)
- Include userId in the webhook body
- Map API key to user

## Scout Integration

In `~/develop/claw/scripts/scout.py`, after scoring and classifying:

```python
def send_to_aglamazo(post, classification):
    payload = {
        "source": "reddit",
        "title": post["title"][:100],
        "description": f"r/{post['subreddit']} · u/{post['author']} · {format_age(post['created_utc'])}\n\n{post['selftext'][:200]}",
        "url": f"https://reddit.com{post['permalink']}",
        "classification": classification,
        "score": post["relevance"],
        "priority": "high" if classification == "LEAD" else "medium",
        "tags": ["reddit", post["subreddit"]]
    }
    # POST to Aglamazo webhook
```

## Env vars needed
- `SCOUT_API_KEY` — shared secret between scout and Aglamazo
