# Schema Generator API Documentation

## Overview

The Schema Generator API automatically analyzes HTML content and generates comprehensive, production-ready **JSON-LD structured data** (schema.org markup) using AI (LLaMA 3.3 70B via Groq).

The pipeline runs through 6 stages:

1. **Clean** — Strips scripts, styles, classes, and noise from HTML
2. **Chunk** — Splits large HTML into semantic chunks (≤12,000 chars each)
3. **Recognize** — AI detects page type and selects appropriate schema types
4. **Extract** — AI extracts all structured data from each chunk
5. **Schema** — AI generates complete JSON-LD `@graph` from extracted data
6. **Validate** — Checks schema completeness and repairs missing types

---

## Base URL

```
https://video.celiyo.com/api/schema-generator
```

---

## Endpoints

### `POST /generate-stream`

**Full URL:**

```
https://video.celiyo.com/api/schema-generator/generate-stream
```

**Description:**  
Generates a complete JSON-LD schema from raw HTML content. Returns results via **Server-Sent Events (SSE)** for real-time pipeline progress.

---

### Request

**Method:** `POST`

**Content-Type:** `application/json`

**Headers:**
| Header | Value | Required |
|---|---|---|
| `Content-Type` | `application/json` | ✅ Yes |

**Body Parameters:**

| Field         | Type     | Required    | Description                                                                         |
| ------------- | -------- | ----------- | ----------------------------------------------------------------------------------- |
| `htmlContent` | `string` | ✅ Yes      | Full HTML source code of the page. Minimum 50 characters.                           |
| `url`         | `string` | ❌ Optional | The page URL. Helps convert relative URLs to absolute and improves schema accuracy. |

**Example Request Body:**

```json
{
  "htmlContent": "<!DOCTYPE html><html lang=\"en\"><head><title>My Page</title></head><body><h1>Hello World</h1><p>This is my page content...</p></body></html>",
  "url": "https://example.com/my-page"
}
```

**cURL Example:**

```bash
curl -X POST https://video.celiyo.com/api/schema-generator/generate-stream \
  -H "Content-Type: application/json" \
  -d '{
    "htmlContent": "<!DOCTYPE html><html><head><title>Test Page</title></head><body><h1>Test</h1><p>Content here with enough characters to pass validation.</p></body></html>",
    "url": "https://example.com/test"
  }'
```

---

### Response

**Content-Type:** `text/event-stream` (Server-Sent Events)

The response is an SSE stream. Each event has the format:

```
event: <event_type>
data: <json_object>

```

---

### SSE Event Types

#### 1. `step` — Pipeline Stage Progress

Fired when a pipeline stage starts or completes.

```
event: step
data: {"step":"minify","status":"active","message":"Extracting metadata & cleaning HTML..."}
```

```
event: step
data: {"step":"minify","status":"done","message":"Cleaned: 45,230 → 12,450 chars (72% reduced)"}
```

**Data Fields:**

| Field       | Type     | Description                                                              |
| ----------- | -------- | ------------------------------------------------------------------------ |
| `step`      | `string` | Stage name: `minify`, `chunk`, `detect`, `extract`, `schema`, `validate` |
| `status`    | `string` | `"active"` (in progress) or `"done"` (completed)                         |
| `message`   | `string` | Human-readable status message                                            |
| `detection` | `object` | _(Only on `detect` done)_ Page detection results (see below)             |

**Detection Object** (included when `step === "detect"` and `status === "done"`):

```json
{
  "detection": {
    "pageType": "Blog Post",
    "contentSummary": "A comprehensive guide to brewing coffee at home",
    "schemaTypes": [
      "BlogPosting",
      "Article",
      "WebPage",
      "WebSite",
      "BreadcrumbList",
      "FAQPage",
      "Organization"
    ],
    "primaryKeywords": [
      "coffee brewing",
      "grind size",
      "water temperature",
      "pour over"
    ],
    "aiSeoFocus": "AI chatbots should understand this is an expert coffee brewing tutorial"
  }
}
```

---

#### 2. `progress` — Chunk Processing Progress

Fired during the extraction stage for each chunk being processed.

```
event: progress
data: {"message":"Extracting data from chunk 2/3...","current":2,"total":3}
```

**Data Fields:**

| Field     | Type     | Description            |
| --------- | -------- | ---------------------- |
| `message` | `string` | Progress description   |
| `current` | `number` | Current chunk number   |
| `total`   | `number` | Total number of chunks |

---

#### 3. `result` — Final Generated Schema

Fired once when the schema generation is complete.

```
event: result
data: {"schema":"<script type=\"application/ld+json\">...</script>","detection":{...},"stats":{...}}
```

**Data Fields:**

| Field       | Type     | Description                                                                                                                        |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `schema`    | `string` | Complete JSON-LD schema wrapped in `<script type="application/ld+json">...</script>` tags. Ready to copy-paste into HTML `<head>`. |
| `detection` | `object` | Page type detection results (same as above)                                                                                        |
| `stats`     | `object` | Generation statistics                                                                                                              |

**Stats Object:**

```json
{
  "stats": {
    "originalSize": 45230,
    "minifiedSize": 12450,
    "chunks": 2,
    "schemaTypes": [
      "BlogPosting",
      "WebPage",
      "WebSite",
      "BreadcrumbList",
      "Organization"
    ],
    "pageType": "Blog Post"
  }
}
```

---

#### 4. `error` — Error Occurred

Fired if any error occurs during the pipeline.

```
event: error
data: {"message":"Failed to detect page type. The content might be too short or unclear."}
```

**Data Fields:**

| Field     | Type     | Description       |
| --------- | -------- | ----------------- |
| `message` | `string` | Error description |

---

#### 5. `done` — Pipeline Complete

Fired as the final event when everything is finished.

```
event: done
data: {"message":"Complete!"}
```

---

### Error Responses (Non-SSE)

These are returned as standard JSON responses before the SSE stream starts:

**400 Bad Request — Invalid input:**

```json
{
  "error": "Please paste valid HTML content (at least 50 characters)."
}
```

**500 Internal Server Error — API key not configured:**

```json
{
  "error": "OPENAI_API_KEY (Groq key) is not configured on the server."
}
```

---

## Event Flow Order

A successful request produces events in this order:

```
1. step (minify → active)
2. step (minify → done)
3. step (chunk → active)
4. step (chunk → done)
5. step (detect → active)
6. step (detect → done)        ← includes detection object
7. step (extract → active)
8. progress (chunk 1/N)        ← repeated for each chunk
9. progress (chunk 2/N)
10. step (extract → done)
11. step (schema → active)
12. progress (repairing...)     ← only if schema is incomplete
13. step (schema → done)
14. step (validate → active)
15. step (validate → done)
16. result                      ← final schema + stats
17. done
```

---

## Frontend Integration Example

### JavaScript (Vanilla)

```javascript
async function generateSchema(htmlContent, url) {
  const response = await fetch(
    "https://video.celiyo.com/api/schema-generator/generate-stream",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ htmlContent, url }),
    },
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));

        switch (currentEvent) {
          case "step":
            console.log(`[${data.step}] ${data.status}: ${data.message}`);
            if (data.detection) {
              console.log("Detected:", data.detection.pageType);
              console.log("Schema types:", data.detection.schemaTypes);
            }
            break;

          case "progress":
            console.log(`Progress: ${data.current}/${data.total}`);
            break;

          case "result":
            console.log("✅ Schema generated!");
            console.log("Schema:", data.schema);
            console.log("Stats:", data.stats);
            // data.schema is ready to paste into <head>
            break;

          case "error":
            console.error("❌ Error:", data.message);
            break;

          case "done":
            console.log("Pipeline complete.");
            break;
        }
      }
    }
  }
}

// Usage:
generateSchema(document.documentElement.outerHTML, window.location.href);
```

### React Example

```jsx
const [status, setStatus] = useState("idle");
const [schema, setSchema] = useState(null);
const [steps, setSteps] = useState({});

async function handleGenerate(html, url) {
  setStatus("loading");
  setSchema(null);

  const res = await fetch(
    "https://video.celiyo.com/api/schema-generator/generate-stream",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ htmlContent: html, url }),
    },
  );

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      else if (line.startsWith("data: ")) {
        const d = JSON.parse(line.slice(6));
        if (event === "step") setSteps((s) => ({ ...s, [d.step]: d }));
        if (event === "result") setSchema(d.schema);
        if (event === "error") setStatus("error: " + d.message);
        if (event === "done") setStatus("done");
      }
    }
  }
}
```

---

## Supported Page Types

The AI automatically detects the page type and selects appropriate schema types:

| Page Type           | Primary Schema Types                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Homepage            | `WebSite`, `WebPage`, `Organization`, `BreadcrumbList`                                     |
| Blog Post / Article | `BlogPosting`, `Article`, `WebPage`, `WebSite`, `BreadcrumbList`, `Person`, `Organization` |
| Product Page        | `Product`, `Offer`, `WebPage`, `WebSite`, `BreadcrumbList`, `Organization`                 |
| Service Page        | `Service`, `WebPage`, `WebSite`, `Organization`, `BreadcrumbList`                          |
| FAQ Page            | `FAQPage`, `WebPage`, `WebSite`, `Organization`, `BreadcrumbList`                          |
| Contact Page        | `ContactPage`, `WebSite`, `Organization`, `BreadcrumbList`                                 |
| About Page          | `AboutPage`, `WebSite`, `Organization`, `BreadcrumbList`, `Person`                         |
| Event Page          | `Event`, `WebPage`, `WebSite`, `Organization`, `BreadcrumbList`                            |
| Recipe              | `Recipe`, `WebPage`, `WebSite`, `BreadcrumbList`                                           |
| Job Listing         | `JobPosting`, `WebPage`, `WebSite`, `Organization`, `BreadcrumbList`                       |
| Course Page         | `Course`, `WebPage`, `WebSite`, `Organization`, `BreadcrumbList`                           |
| Video Page          | `VideoObject`, `WebPage`, `WebSite`, `BreadcrumbList`                                      |
| eCommerce Category  | `CollectionPage`, `ItemList`, `WebPage`, `WebSite`, `BreadcrumbList`                       |
| Restaurant          | `Restaurant`, `WebPage`, `WebSite`, `BreadcrumbList`                                       |
| Hotel               | `Hotel`, `WebPage`, `WebSite`, `BreadcrumbList`                                            |
| Software / Tool     | `SoftwareApplication`, `WebPage`, `WebSite`, `Organization`, `BreadcrumbList`              |

**Secondary types** are added automatically if matching content is found (e.g., FAQ sections → `FAQPage`, reviews → `AggregateRating`, step-by-step instructions → `HowTo`).

---

## Notes

- **Processing time:** 10–60 seconds depending on HTML size (multiple AI calls are made)
- **Max HTML size:** 50 MB (enforced by request body limit)
- **AI Model:** LLaMA 3.3 70B Versatile (via Groq API)
- **No authentication required** for this endpoint
- **CORS:** Enabled for configured origins
- The `schema` field in the result is a ready-to-use `<script>` tag — paste it directly into your page's `<head>`
