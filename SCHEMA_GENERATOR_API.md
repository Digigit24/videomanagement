# Schema Generator API Documentation

## Overview

The Schema Generator API automatically analyzes HTML content and generates comprehensive, production-ready **JSON-LD structured data** (schema.org markup) using AI (LLaMA 3.3 70B via Groq).

## Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. RECEIVE    → Full HTML uploaded, stored as-is (original)    │
│  2. CLEAN      → Duplicate copy created → minified (scripts,    │
│                   styles, classes, noise stripped)               │
│  3. CHUNK      → Minified HTML split into semantic chunks       │
│                   (≤12,000 chars each, split at section breaks) │
│  4. RECOGNIZE  → AI detects page type + selects schema types    │
│  5. EXTRACT    → AI extracts structured data from EACH chunk    │
│                   (separate prompt per chunk → results merged)   │
│  6. SCHEMA     → AI generates complete JSON-LD @graph from      │
│                   all extracted data (repair pass if incomplete) │
│  7. VALIDATE   → Schema checked for completeness & accuracy     │
│  8. INJECT     → Schema injected into ORIGINAL HTML's <head>    │
│                                                                 │
│  RESULT: Returns both:                                          │
│    • Plain schema JSON-LD (copy-paste into any page)            │
│    • Original HTML with schema already injected                 │
└─────────────────────────────────────────────────────────────────┘
```

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
Generates a complete JSON-LD schema from raw HTML content. Returns results via **Server-Sent Events (SSE)** for real-time pipeline progress. Returns both the plain schema AND the original HTML with schema injected.

---

### Request

**Method:** `POST`

**Content-Type:** `application/json`

**Headers:**

| Header         | Value              | Required |
| -------------- | ------------------ | -------- |
| `Content-Type` | `application/json` | ✅ Yes   |

**Body Parameters:**

| Field         | Type     | Required    | Description                                                                                             |
| ------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| `htmlContent` | `string` | ✅ Yes      | Full HTML source code of the page. Minimum 50 characters. This is preserved as-is for schema injection. |
| `url`         | `string` | ❌ Optional | The page URL. Helps convert relative URLs to absolute and improves schema accuracy.                     |

**Example Request Body:**

```json
{
  "htmlContent": "<!DOCTYPE html><html lang=\"en\"><head><title>My Page</title></head><body><h1>Hello World</h1><p>This is my page content with enough text for the AI to analyze and generate a proper schema.</p></body></html>",
  "url": "https://example.com/my-page"
}
```

**cURL Example:**

```bash
curl -X POST https://video.celiyo.com/api/schema-generator/generate-stream \
  -H "Content-Type: application/json" \
  -d '{
    "htmlContent": "<!DOCTYPE html><html lang=\"en\"><head><title>Best Coffee Guide</title><meta name=\"description\" content=\"Learn to brew perfect coffee\"></head><body><h1>Coffee Brewing Guide</h1><p>A complete guide to brewing the perfect cup of coffee at home with expert tips.</p></body></html>",
    "url": "https://coffeeexperts.com/guide"
  }'
```

---

### Response

**Content-Type:** `text/event-stream` (Server-Sent Events)

Each event follows this format:

```
event: <event_type>
data: <json_object>

```

---

### SSE Event Types

#### 1. `step` — Pipeline Stage Progress

Fired when a pipeline stage starts (`active`) or completes (`done`).

**Example — stage starting:**

```
event: step
data: {"step":"minify","status":"active","message":"Extracting metadata & cleaning HTML..."}
```

**Example — stage completed:**

```
event: step
data: {"step":"minify","status":"done","message":"Cleaned: 45,230 → 12,450 chars (72% reduced)"}
```

**Data Fields:**

| Field       | Type     | Values                                                                 | Description                                      |
| ----------- | -------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| `step`      | `string` | `minify`, `chunk`, `detect`, `extract`, `schema`, `validate`, `inject` | Pipeline stage name                              |
| `status`    | `string` | `active`, `done`                                                       | Stage status                                     |
| `message`   | `string` | —                                                                      | Human-readable progress message                  |
| `detection` | `object` | —                                                                      | _(Only on `detect` done)_ Page detection results |

**Pipeline Steps in Order:**

| #   | Step       | What it does                                               |
| --- | ---------- | ---------------------------------------------------------- |
| 1   | `minify`   | Extracts metadata from original HTML, creates cleaned copy |
| 2   | `chunk`    | Splits cleaned HTML into semantic chunks                   |
| 3   | `detect`   | AI recognizes page type and selects schema types           |
| 4   | `extract`  | AI extracts structured data from each chunk                |
| 5   | `schema`   | AI generates JSON-LD schema (+ repair if needed)           |
| 6   | `validate` | Checks schema completeness and accuracy                    |
| 7   | `inject`   | Injects schema into original HTML's `<head>`               |

**Detection Object** (returned when `step === "detect"` and `status === "done"`):

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

Fired during extraction for each chunk being processed.

```
event: progress
data: {"message":"Extracting data from chunk 2/3...","current":2,"total":3}
```

| Field     | Type     | Description          |
| --------- | -------- | -------------------- |
| `message` | `string` | Progress description |
| `current` | `number` | Current chunk number |
| `total`   | `number` | Total chunks         |

---

#### 3. `result` — Final Output

Fired once when the pipeline completes. Contains **everything your frontend needs**.

```
event: result
data: {
  "schema": "<script type=\"application/ld+json\">{...}</script>",
  "htmlWithSchema": "<!DOCTYPE html><html>...<script type=\"application/ld+json\">{...}</script></head>...",
  "detection": {...},
  "stats": {...}
}
```

**Data Fields:**

| Field            | Type     | Description                                                                                                   |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `schema`         | `string` | Plain JSON-LD schema wrapped in `<script type="application/ld+json">...</script>` tags. **Copy-paste ready.** |
| `htmlWithSchema` | `string` | The **original HTML** (untouched) with the schema injected into `<head>`. **Copy-paste ready.**               |
| `detection`      | `object` | Page type detection results                                                                                   |
| `stats`          | `object` | Generation statistics                                                                                         |

**Stats Object:**

```json
{
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
```

**Frontend Usage — Two Copy Options:**

```javascript
// When you receive the "result" event:
const data = JSON.parse(eventData);

// OPTION 1: Copy plain schema only
copyToClipboard(data.schema);
// → User pastes this into their HTML's <head> manually

// OPTION 2: Copy full HTML with schema already injected
copyToClipboard(data.htmlWithSchema);
// → User replaces their entire HTML file with this
```

---

#### 4. `error` — Error Occurred

```
event: error
data: {"message":"Failed to detect page type. The content might be too short or unclear."}
```

| Field     | Type     | Description       |
| --------- | -------- | ----------------- |
| `message` | `string` | Error description |

---

#### 5. `done` — Pipeline Complete

Final event. Signals the SSE stream is ending.

```
event: done
data: {"message":"Complete!"}
```

---

### Error Responses (Non-SSE)

Returned as standard JSON if the request is rejected before the pipeline starts:

**400 Bad Request:**

```json
{
  "error": "Please paste valid HTML content (at least 50 characters)."
}
```

**500 Server Error:**

```json
{
  "error": "OPENAI_API_KEY (Groq key) is not configured on the server."
}
```

---

## Complete Event Flow

A successful request produces events in this exact order:

```
 1. step   → minify   → active     "Extracting metadata & cleaning HTML..."
 2. step   → minify   → done       "Cleaned: 45,230 → 12,450 chars (72% reduced)"
 3. step   → chunk    → active     "Splitting into semantic chunks..."
 4. step   → chunk    → done       "Split into 3 semantic chunk(s)"
 5. step   → detect   → active     "AI is recognizing page purpose & type..."
 6. step   → detect   → done       "Detected: Blog Post | Schemas: BlogPosting, WebPage..."
 7. step   → extract  → active     "Extracting structured data from 3 chunk(s)..."
 8. progress                        "Extracting data from chunk 1/3..."
 9. progress                        "Extracting data from chunk 2/3..."
10. progress                        "Extracting data from chunk 3/3..."
11. step   → extract  → done       "Extracted structured data from all 3 chunk(s)"
12. step   → schema   → active     "Generating complete JSON-LD schema..."
13. progress                        "Repairing schema — adding missing: FAQPage..."  (optional)
14. step   → schema   → done       "Schema generated successfully!"
15. step   → validate → active     "Validating schema completeness..."
16. step   → validate → done       "✓ @context | ✓ @type | ✓ @graph | ✓ 7/7 schemas"
17. step   → inject   → active     "Injecting schema into original HTML..."
18. step   → inject   → done       "Schema injected into original HTML successfully"
19. result                          { schema, htmlWithSchema, detection, stats }
20. done                            "Complete!"
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
  let result = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));

        switch (currentEvent) {
          case "step":
            console.log(`[${data.step}] ${data.status}: ${data.message}`);
            // Update your UI pipeline indicators here
            break;

          case "progress":
            console.log(`Progress: ${data.current}/${data.total}`);
            break;

          case "result":
            result = data;
            console.log("✅ Schema generated!");

            // OPTION 1: Plain schema (for "Copy Schema" button)
            console.log("Schema:", data.schema);

            // OPTION 2: HTML with schema injected (for "Copy HTML" button)
            console.log("HTML with schema:", data.htmlWithSchema);

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

  return result;
}

// Usage:
const result = await generateSchema(myHtmlCode, "https://example.com/page");

// Copy buttons:
document.getElementById("copySchemaBtn").onclick = () => {
  navigator.clipboard.writeText(result.schema);
};

document.getElementById("copyHtmlBtn").onclick = () => {
  navigator.clipboard.writeText(result.htmlWithSchema);
};
```

### React Example

```jsx
import { useState } from "react";

function SchemaGenerator() {
  const [status, setStatus] = useState("idle");
  const [steps, setSteps] = useState({});
  const [result, setResult] = useState(null);

  async function handleGenerate(html, url) {
    setStatus("loading");
    setResult(null);
    setSteps({});

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
        if (line.startsWith("event: ")) {
          event = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const d = JSON.parse(line.slice(6));
          if (event === "step") setSteps((s) => ({ ...s, [d.step]: d }));
          if (event === "result") {
            setResult(d);
            setStatus("done");
          }
          if (event === "error") setStatus("error: " + d.message);
        }
      }
    }
  }

  const copySchema = () => navigator.clipboard.writeText(result.schema);
  const copyHtml = () => navigator.clipboard.writeText(result.htmlWithSchema);

  return (
    <div>
      {/* Pipeline progress UI */}
      {Object.entries(steps).map(([key, step]) => (
        <div key={key}>
          {step.status === "done" ? "✅" : "⏳"} {key}: {step.message}
        </div>
      ))}

      {/* Result with two copy options */}
      {result && (
        <div>
          <button onClick={copySchema}>📋 Copy Schema JSON-LD</button>
          <button onClick={copyHtml}>📋 Copy HTML with Schema</button>
          <pre>{result.schema}</pre>
        </div>
      )}
    </div>
  );
}
```

---

## Supported Page Types

The AI automatically detects the page type and selects schema types:

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

**Secondary types** are added automatically if matching content is found anywhere in the HTML:

- FAQ sections → `FAQPage`
- Reviews/ratings → `AggregateRating`, `Review`
- Step-by-step instructions → `HowTo`
- Embedded videos → `VideoObject`
- Pricing → `Offer`
- Contact info → `Organization`

---

## Notes

- **Processing time:** 10–60 seconds depending on HTML size (multiple AI calls)
- **Max HTML size:** 50 MB
- **AI Model:** LLaMA 3.3 70B Versatile (via Groq API)
- **No authentication required**
- **CORS:** Enabled for configured origins
- The `schema` field is a ready-to-use `<script>` tag — paste into `<head>`
- The `htmlWithSchema` field is the **untouched original HTML** with the schema injected before `</head>`
