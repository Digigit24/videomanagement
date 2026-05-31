# Composio Read-Only Agent

## Purpose

Use connected Composio accounts for client research without building many platform-specific AgencyOS APIs. The agent reads connection metadata from AgencyOS, uses Composio directly where it is installed, then writes only compact summaries or PM HTML reports back to AgencyOS.

## Scope

Allowed:
- Google Search Console read-only checks.
- Facebook Pages read-only checks.
- Instagram Business read-only checks.
- LinkedIn company page read-only checks.
- YouTube channel read-only checks.
- Twitter / X account read-only checks.
- Google Ads connection metadata, once a confirmed read-only Composio tool is configured.
- PM HTML report generation.
- Lightweight summary updates in AgencyOS.

Forbidden:
- Publishing content.
- Scheduling posts.
- Editing external accounts.
- Changing permissions.
- Deleting remote connected accounts.
- Storing raw analytics exports in AgencyOS.

## Step 1: Discover Workspace

```http
GET {BASE_URL}/api/agent/workspace-map
Authorization: Bearer {VIDEO_API_TOKEN}
```

Find the client and copy `workspace_id`.

## Step 2: Get Composio Context

```http
GET {BASE_URL}/api/agent/workspace/{workspace_id}/composio-context
Authorization: Bearer {VIDEO_API_TOKEN}
```

Use:
- `composio.user_id`
- each `connected_account_id`
- each `toolkit`

If `connected_accounts` is empty, the client has not connected the required account yet.

## Step 3: Query With Composio

Use the Composio SDK or MCP in your runtime. Keep all tool calls read-only.

Recommended client boundary:

```txt
Composio user_id = agencyos_workspace_{workspace_id}
```

Supported AgencyOS toolkit keys:

```txt
google_search_console
facebook
instagram
linkedin
youtube
twitter
google_ads
```

When `selected_resource` is present, scope reads to that mapped asset. For shared accounts, this is how an agent knows the exact client Facebook page, GSC property, LinkedIn company, YouTube channel, or Twitter/X account.

## Step 4: Write a Compact Summary

```http
PATCH {BASE_URL}/api/agent/workspace/{workspace_id}/integrations/{toolkit}/summary
Authorization: Bearer {VIDEO_API_TOKEN}
Content-Type: application/json

{
  "status": "ACTIVE",
  "selected_resource": {
    "property": "sc-domain:example.com"
  },
  "latest_summary": {
    "period": "last_28_days",
    "headline": "Organic clicks improved month over month.",
    "metrics": {
      "clicks": 1234,
      "impressions": 45678
    },
    "next_actions": [
      "Refresh top service page title",
      "Add FAQ block to ranking page"
    ]
  }
}
```

Keep summaries small and PM-friendly.

## Step 5: Generate PM HTML

Follow:

```txt
agencyOS/PM_DESIGN_GUIDE.md
agencyOS/AGENCYOS_COMPOSIO_AGENT_GUIDE.md
```

Upload with:

```http
POST {BASE_URL}/api/agent/workspace/{workspace_id}/pm-upload
Authorization: Bearer {VIDEO_API_TOKEN}
Content-Type: application/json

{
  "filename": "YYYY-MM_composio-review.html",
  "html": "<!DOCTYPE html>...",
  "replace": true
}
```
