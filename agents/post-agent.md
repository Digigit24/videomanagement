# Post Sync Agent

## Purpose
This agent syncs Instagram posts from a client's Notion database into the AgencyOS backend. It reads post data via the connected Notion MCP and pushes each post to the AgencyOS API — no direct database access required.

---

## Trigger Prompt
When the user says something like:
> "Fetch from my Notion MCP for [Client Name] and update it on my AgencyOS"

...this agent activates and runs the full sync flow below.

---

## What You Need Before Running

| Input | Where it comes from |
|---|---|
| Client Name | User provides in the prompt |
| Workspace ID | Look it up via `GET /api/workspaces` or user provides it |
| Auth Token | User provides once — store in context for the session |
| Notion Database | Connected via Notion MCP — no key needed |

---

## Step-by-Step Flow

### Step 1 — Identify the Workspace
Ask the user (or infer from context):
- What is the client name?
- What is the `workspace_id` (UUID) in AgencyOS for this client?

If unknown, call:
```
GET {BASE_URL}/api/workspaces
Authorization: Bearer {TOKEN}
```
Find the workspace where `client_name` matches.

---

### Step 2 — Fetch Posts from Notion
Use the Notion MCP to query the client's Instagram content database. Look for pages/rows that represent Instagram posts. Extract the following fields per post:

| Notion Property | Maps to API field |
|---|---|
| Caption / Post Text | `caption` |
| Media URL / Image | `mediaurl` |
| Post Date | `posted_at` (ISO 8601 format, e.g. `2025-05-10T10:00:00Z`) |

Skip any rows that have no caption — they are drafts.

---

### Step 3 — Push Each Post to AgencyOS

For each post fetched from Notion, call:

```
POST {BASE_URL}/api/workspace/{workspace_id}/instagram
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "caption": "Post caption text here",
  "mediaurl": "https://example.com/image.jpg",
  "posted_at": "2025-05-10T10:00:00Z"
}
```

**Success response (201):**
```json
{
  "id": 42,
  "workspace_id": "uuid-here",
  "caption": "...",
  "mediaurl": "...",
  "status": "ready",
  "posted_at": "2025-05-10T10:00:00Z",
  "created_at": "..."
}
```

---

### Step 4 — Report Back
After all posts are pushed, summarize:
- How many posts were synced
- Any posts that were skipped (no caption) and why
- Any API errors encountered

Example summary:
> Synced 8 Instagram posts for [Client Name]. Skipped 2 rows (no caption). All posts are now in AgencyOS with status `ready`.

---

## API Reference (Quick)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/workspaces` | List all workspaces to find workspace_id |
| GET | `/api/workspace/:id/instagram` | View existing posts for a workspace |
| POST | `/api/workspace/:id/instagram` | Add a new post |
| PATCH | `/api/instagram/:id` | Update an existing post |
| PATCH | `/api/instagram/:id/status` | Change post status (e.g. to `posted`) |

**Base URL:** Set by user — e.g. `https://video.celiyo.com`
**Auth:** All endpoints require `Authorization: Bearer {TOKEN}` header.

---

## Notes
- `posted_at` is optional — if the Notion row has no date, omit it and the field will be null.
- `status` defaults to `ready` on creation. Do not set it manually during sync.
- Do not duplicate-check automatically — if a post already exists and you re-sync, it will create a duplicate. The user should confirm before re-syncing the same month.
- This agent does NOT publish posts. It only loads them into AgencyOS with status `ready`. Publishing is triggered separately via the status endpoint.
