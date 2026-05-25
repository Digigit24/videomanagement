# Post Sync API — Instagram Posts

**Base URL:** `https://video.celiyo.com`  
**Auth:** All endpoints require `Authorization: Bearer {TOKEN}` header.

---

## Endpoints

### List Posts
```
GET /api/workspace/:workspace_id/instagram
```
Returns all Instagram posts for a workspace, newest first.

---

### Create Post
```
POST /api/workspace/:workspace_id/instagram
```
**Body:**
```json
{
  "caption": "Your post caption",
  "mediaurl": "https://...",
  "posted_at": "2025-05-10T10:00:00Z"
}
```
- `caption` — required
- `mediaurl` — optional
- `posted_at` — optional, ISO 8601 timestamp of when the post went live on Instagram

**Response `201`:** Returns the created post object with `id`, `status: "ready"`, and all fields.

---

### Update Post
```
PATCH /api/instagram/:post_id
```
**Body:** Same fields as create — `caption`, `mediaurl`, `posted_at`. All optional.

---

### Update Post Status
```
PATCH /api/instagram/:post_id/status
```
**Body:**
```json
{ "status": "posted" }
```
Setting status to `posted` triggers the configured Instagram webhook for that workspace.

---

## Schema Change (v22)
`posted_at TIMESTAMP WITH TIME ZONE` was added to `instagram_posts` in migration v22.  
Run `migrations_v22.sql` on your Neon database before using this field.

---

## Notion Property Mapping

| Notion Column | API Field | Notes |
|---|---|---|
| Caption / Post Text | `caption` | Required |
| Image / Media URL | `mediaurl` | Optional |
| Post Date | `posted_at` | ISO 8601, e.g. `2025-05-10T10:00:00Z` |
