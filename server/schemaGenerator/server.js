require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { sendChatGPTRequest } = require("./chatgpt");

const app = express();
const PORT = process.env.PORT || 4000;

// CORS
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(path.join(__dirname)));

// Validate API key
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ ERROR: OPENAI_API_KEY (Groq key) is not set in .env");
  process.exit(1);
}

const API_KEY = process.env.OPENAI_API_KEY;

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Aggressively clean HTML to extract only meaningful content.
 * Removes: <style>, <script>, <svg>, <noscript>, comments, data-* attrs,
 * inline style attrs, class attrs, empty tags, excessive whitespace.
 * Preserves: text content, semantic structure, links, images, metadata.
 */
function cleanHtml(html) {
  if (!html) return "";

  let cleaned = html;

  // 1. Remove <script> tags and contents
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, "");

  // 2. Remove <style> tags and contents (KEY FIX: reduces content massively)
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, "");

  // 3. Remove <svg> tags and contents (huge bloat)
  cleaned = cleaned.replace(/<svg[\s\S]*?<\/svg>/gi, "");

  // 4. Remove <noscript> tags
  cleaned = cleaned.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

  // 5. Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");

  // 6. Remove inline style attributes
  cleaned = cleaned.replace(/\s+style\s*=\s*"[^"]*"/gi, "");
  cleaned = cleaned.replace(/\s+style\s*=\s*'[^']*'/gi, "");

  // 7. Remove class attributes (not needed for data extraction)
  cleaned = cleaned.replace(/\s+class\s*=\s*"[^"]*"/gi, "");
  cleaned = cleaned.replace(/\s+class\s*=\s*'[^']*'/gi, "");

  // 8. Remove data-* attributes
  cleaned = cleaned.replace(/\s+data-[a-z0-9-]+\s*=\s*"[^"]*"/gi, "");
  cleaned = cleaned.replace(/\s+data-[a-z0-9-]+\s*=\s*'[^']*'/gi, "");

  // 9. Remove aria-* attributes
  cleaned = cleaned.replace(/\s+aria-[a-z0-9-]+\s*=\s*"[^"]*"/gi, "");

  // 10. Remove role attributes
  cleaned = cleaned.replace(/\s+role\s*=\s*"[^"]*"/gi, "");

  // 11. Remove id attributes (mostly not needed)
  cleaned = cleaned.replace(/\s+id\s*=\s*"[^"]*"/gi, "");

  // 12. Remove empty tags (span, div, etc. with no content)
  cleaned = cleaned.replace(
    /<(span|div|p|section|article|aside|header|footer|nav|ul|ol|li|figure|figcaption)\s*>\s*<\/\1>/gi,
    "",
  );

  // 13. Remove <br> / <hr> tags
  cleaned = cleaned.replace(/<br\s*\/?>/gi, " ");
  cleaned = cleaned.replace(/<hr\s*\/?>/gi, "");

  // 14. Remove <input>, <button>, <select>, <textarea>, <form> tags
  cleaned = cleaned.replace(/<(input|button|select|textarea)[^>]*\/?>/gi, "");
  cleaned = cleaned.replace(/<form[\s\S]*?<\/form>/gi, "");

  // 15. Remove <iframe> tags
  cleaned = cleaned.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");

  // 16. Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, " ");
  cleaned = cleaned.replace(/>\s+</g, "><");

  return cleaned.trim();
}

/**
 * Extract key metadata from <head> before cleaning
 */
function extractMetadata(html) {
  const meta = {};

  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) meta.title = titleMatch[1].trim();

  // Meta description
  const descMatch = html.match(
    /<meta[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([\s\S]*?)["']/i,
  );
  if (descMatch) meta.description = descMatch[1].trim();

  // Meta keywords
  const kwMatch = html.match(
    /<meta[^>]*name\s*=\s*["']keywords["'][^>]*content\s*=\s*["']([\s\S]*?)["']/i,
  );
  if (kwMatch) meta.keywords = kwMatch[1].trim();

  // OG tags
  const ogTitleMatch = html.match(
    /<meta[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([\s\S]*?)["']/i,
  );
  if (ogTitleMatch) meta.ogTitle = ogTitleMatch[1].trim();

  const ogDescMatch = html.match(
    /<meta[^>]*property\s*=\s*["']og:description["'][^>]*content\s*=\s*["']([\s\S]*?)["']/i,
  );
  if (ogDescMatch) meta.ogDescription = ogDescMatch[1].trim();

  const ogImageMatch = html.match(
    /<meta[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([\s\S]*?)["']/i,
  );
  if (ogImageMatch) meta.ogImage = ogImageMatch[1].trim();

  const ogTypeMatch = html.match(
    /<meta[^>]*property\s*=\s*["']og:type["'][^>]*content\s*=\s*["']([\s\S]*?)["']/i,
  );
  if (ogTypeMatch) meta.ogType = ogTypeMatch[1].trim();

  const ogUrlMatch = html.match(
    /<meta[^>]*property\s*=\s*["']og:url["'][^>]*content\s*=\s*["']([\s\S]*?)["']/i,
  );
  if (ogUrlMatch) meta.ogUrl = ogUrlMatch[1].trim();

  // Canonical URL
  const canonicalMatch = html.match(
    /<link[^>]*rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([\s\S]*?)["']/i,
  );
  if (canonicalMatch) meta.canonical = canonicalMatch[1].trim();

  // Language
  const langMatch = html.match(/<html[^>]*lang\s*=\s*["']([^"']+)["']/i);
  if (langMatch) meta.language = langMatch[1].trim();

  // Existing JSON-LD (to avoid duplication)
  const jsonLdMatches = html.match(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  if (jsonLdMatches) {
    meta.existingSchemas = jsonLdMatches.length;
  }

  // Favicon
  const faviconMatch = html.match(
    /<link[^>]*rel\s*=\s*["'](?:shortcut )?icon["'][^>]*href\s*=\s*["']([\s\S]*?)["']/i,
  );
  if (faviconMatch) meta.favicon = faviconMatch[1].trim();

  return meta;
}

/**
 * Smart semantic chunking — splits at major HTML boundaries.
 * Instead of cutting mid-tag, finds natural break points.
 */
function semanticChunk(html, maxChunkSize = 12000) {
  if (html.length <= maxChunkSize) return [html];

  const chunks = [];
  let remaining = html;

  while (remaining.length > 0) {
    if (remaining.length <= maxChunkSize) {
      chunks.push(remaining);
      break;
    }

    // Find a good break point near the max size
    let cutPoint = maxChunkSize;
    const searchArea = remaining.substring(
      maxChunkSize - 2000,
      maxChunkSize + 500,
    );
    const searchOffset = maxChunkSize - 2000;

    // Priority 1: End of major sections
    const sectionBreaks = [
      "</section>",
      "</article>",
      "</main>",
      "</header>",
      "</footer>",
      "</nav>",
      "</aside>",
      "</div>",
      "</table>",
      "</ul>",
      "</ol>",
    ];

    let bestBreak = -1;
    for (const tag of sectionBreaks) {
      const idx = searchArea.lastIndexOf(tag);
      if (idx !== -1) {
        bestBreak = searchOffset + idx + tag.length;
        break;
      }
    }

    if (bestBreak > 0) {
      cutPoint = bestBreak;
    } else {
      // Priority 2: Any closing tag
      const closingTagIdx = searchArea.lastIndexOf("</");
      if (closingTagIdx !== -1) {
        const tagEnd = searchArea.indexOf(">", closingTagIdx);
        if (tagEnd !== -1) {
          cutPoint = searchOffset + tagEnd + 1;
        }
      }
    }

    chunks.push(remaining.substring(0, cutPoint));
    remaining = remaining.substring(cutPoint);
  }

  return chunks;
}

/**
 * Robust JSON extraction from LLM response
 */
function extractJsonFromResponse(text) {
  if (!text) return null;

  // Try code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (e) {}
  }

  // Try to find the outermost JSON object
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          return JSON.parse(text.substring(start, i + 1));
        } catch (e) {
          // Try fixing common issues
          let fixed = text
            .substring(start, i + 1)
            .replace(/,\s*}/g, "}")
            .replace(/,\s*]/g, "]")
            .replace(/\/\/[^\n]*/g, "") // remove line comments
            .replace(/\n/g, " ");
          try {
            return JSON.parse(fixed);
          } catch (e2) {}
        }
      }
    }
  }

  // Try JSON array
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]);
    } catch (e) {}
  }

  return null;
}

// ============================================
// SSE ENDPOINT — THE IMPROVED PIPELINE
// ============================================

app.post("/api/generate-schema-stream", async (req, res) => {
  const { htmlContent, url } = req.body;

  if (!htmlContent || htmlContent.trim().length < 50) {
    return res.status(400).json({
      error: "Please paste valid HTML content (at least 50 characters).",
    });
  }

  // Set up SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  function sendEvent(event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  try {
    // =============================================
    // STEP 1: EXTRACT METADATA (before cleaning)
    // =============================================
    sendEvent("step", {
      step: "minify",
      status: "active",
      message: "Extracting metadata & cleaning HTML...",
    });

    const metadata = extractMetadata(htmlContent);
    const cleaned = cleanHtml(htmlContent);
    const originalLen = htmlContent.length;
    const cleanedLen = cleaned.length;
    const savings = Math.round((1 - cleanedLen / originalLen) * 100);

    console.log(
      `[Pipeline] Original: ${originalLen} | Cleaned: ${cleanedLen} | Savings: ${savings}%`,
    );
    console.log(`[Pipeline] Metadata:`, JSON.stringify(metadata, null, 2));

    sendEvent("step", {
      step: "minify",
      status: "done",
      message: `Cleaned: ${originalLen.toLocaleString()} → ${cleanedLen.toLocaleString()} chars (${savings}% reduced, style/script/SVG removed)`,
    });

    // =============================================
    // STEP 2: SEMANTIC CHUNKING
    // =============================================
    sendEvent("step", {
      step: "chunk",
      status: "active",
      message: "Splitting into semantic chunks...",
    });

    const chunks = semanticChunk(cleaned, 12000);

    sendEvent("step", {
      step: "chunk",
      status: "done",
      message: `Split into ${chunks.length} semantic chunk(s) (avg ${Math.round(cleanedLen / chunks.length).toLocaleString()} chars each)`,
    });

    // =============================================
    // STEP 3: PAGE RECOGNITION (First — most important)
    // Uses metadata + first chunk to identify what this page IS
    // =============================================
    sendEvent("step", {
      step: "detect",
      status: "active",
      message: "AI is recognizing page purpose & type...",
    });

    const metadataContext =
      Object.keys(metadata).length > 0
        ? `\nPAGE METADATA (extracted from <head>):\n${JSON.stringify(metadata, null, 2)}`
        : "";

    // Send ALL content to recognition (capped) so it can detect secondary types like FAQ
    const allContentForRecognition = chunks.join("\n").substring(0, 15000);

    const recognitionPrompt = `Analyze this HTML page and determine EXACTLY what it is and what schema.org types are needed.
${metadataContext}

HTML CONTENT:
${allContentForRecognition}

INSTRUCTIONS:
1. Determine the SPECIFIC page type (e.g., "Blog Post", "Product Page", "About Page", "Homepage", "Service Page", "FAQ Page", "Recipe Page", "Event Page", "Contact Page", "Job Listing", "Course Page", "Video Page", "Podcast Page", "eCommerce Category Page", "Landing Page", "Portfolio Page", "Real Estate Listing", "Restaurant Page", "Hotel Page", "Medical/Health Page", "Tool/Application Page", etc.)

2. Write a 1-sentence summary of what this specific page is about.

3. Select ALL applicable schema.org @type values. IMPORTANT — include BOTH the primary type AND any secondary types found in the content:
   PRIMARY TYPES:
   - Homepage → WebSite, WebPage, Organization (or LocalBusiness), BreadcrumbList
   - Blog Post / Article → BlogPosting (or Article/NewsArticle), WebPage, WebSite, BreadcrumbList, Person (author), Organization (publisher)
   - Product Page → Product, Offer, WebPage, WebSite, BreadcrumbList, Organization
   - Service Page → Service, WebPage, WebSite, Organization, BreadcrumbList
   - FAQ Page → FAQPage, WebPage, WebSite, Organization, BreadcrumbList
   - Recipe → Recipe, WebPage, WebSite, BreadcrumbList
   - Event → Event, WebPage, WebSite, Organization, BreadcrumbList
   - Contact → ContactPage, WebSite, Organization, BreadcrumbList
   - About → AboutPage, WebSite, Organization, BreadcrumbList, Person
   - Job → JobPosting, WebPage, WebSite, Organization, BreadcrumbList
   - Course → Course, WebPage, WebSite, Organization, BreadcrumbList
   - Video → VideoObject, WebPage, WebSite, BreadcrumbList
   - Tool/App → SoftwareApplication, WebPage, WebSite, Organization, BreadcrumbList
   - eCommerce category → CollectionPage, ItemList, WebPage, WebSite, BreadcrumbList

   SECONDARY TYPES (add these if found ANYWHERE in the page content):
   - If the page has FAQ questions/answers → add FAQPage
   - If the page has step-by-step instructions → add HowTo
   - If the page has embedded videos → add VideoObject
   - If the page has reviews/ratings → add AggregateRating, Review
   - If the page has a list of items → add ItemList
   - If the page has pricing → add Offer
   - If the page has breadcrumb navigation → add BreadcrumbList
   - If you can find contact info (phone, email, address) → add Organization
   - ALWAYS include WebSite (every page belongs to a website)
   - ALWAYS include BreadcrumbList

4. Extract 8-15 real keywords from the actual content.

5. What should AI chatbots understand about this page? (1 sentence)

Respond in this EXACT JSON format only:
{
  "pageType": "...",
  "contentSummary": "...",
  "schemaTypes": ["Type1", "Type2", ...],
  "primaryKeywords": ["kw1", "kw2", ...],
  "aiSeoFocus": "..."
}`;

    const detectResponse = await sendChatGPTRequest(
      recognitionPrompt,
      API_KEY,
      {
        systemPrompt:
          "You are an expert SEO analyst. Your job is to accurately identify what a web page is about based on its HTML content. Respond ONLY with valid JSON, no explanation text.",
        maxTokens: 1500,
        temperature: 0.1,
      },
    );

    const detection = extractJsonFromResponse(detectResponse);
    console.log(`[Pipeline] Detection:`, JSON.stringify(detection, null, 2));

    if (!detection || !detection.schemaTypes) {
      sendEvent("error", {
        message:
          "Failed to detect page type. The content might be too short or unclear. Please try with more HTML content.",
      });
      res.end();
      return;
    }

    sendEvent("step", {
      step: "detect",
      status: "done",
      message: `Detected: ${detection.pageType} | Schemas: ${detection.schemaTypes.join(", ")}`,
      detection,
    });

    // =============================================
    // STEP 4: STRUCTURED DATA EXTRACTION FROM ALL CHUNKS
    // Each chunk gets the schema types context so it knows what to look for
    // =============================================
    sendEvent("step", {
      step: "extract",
      status: "active",
      message: `Extracting structured data from ${chunks.length} chunk(s) for ${detection.schemaTypes.join(", ")}...`,
    });

    let allExtractedData = {};

    // Build extraction targets based on detected schema types
    const extractionTargets = buildExtractionTargets(detection.schemaTypes);

    for (let i = 0; i < chunks.length; i++) {
      sendEvent("progress", {
        message: `Extracting data from chunk ${i + 1}/${chunks.length}...`,
        current: i + 1,
        total: chunks.length,
      });

      const extractPrompt = `You are analyzing chunk ${i + 1} of ${chunks.length} from a "${detection.pageType}" page.
Page summary: ${detection.contentSummary}
Schema types needed: ${detection.schemaTypes.join(", ")}

EXTRACT every piece of real data you find in this HTML. Look carefully for:
${extractionTargets}

HTML CHUNK:
${chunks[i]}

Return a JSON object using this structure (include ONLY fields where you found real data in the HTML above):
{
  "title": "page title from <title> or <h1>",
  "headings": { "h1": ["..."], "h2": ["..."], "h3": ["..."] },
  "description": "meta description or first paragraph",
  "images": [{ "src": "exact src URL", "alt": "alt text" }],
  "links": [{ "href": "exact href URL", "text": "link text" }],
  "navigation": [{ "text": "...", "href": "..." }],
  "breadcrumbs": [{ "name": "...", "url": "..." }],
  "organization": { "name": "...", "logo": "logo URL", "phone": "...", "email": "...", "address": { "street": "...", "city": "...", "state": "...", "zip": "...", "country": "..." } },
  "socialLinks": ["https://facebook.com/...", "https://twitter.com/..."],
  "author": { "name": "...", "url": "...", "image": "..." },
  "dates": { "published": "...", "modified": "..." },
  "article": { "body": "first 300 chars of main content...", "categories": ["..."], "tags": ["..."], "wordCount": 0 },
  "product": { "name": "...", "price": "...", "currency": "...", "availability": "...", "sku": "...", "brand": "...", "description": "..." },
  "reviews": [{ "author": "...", "rating": 0, "text": "...", "date": "..." }],
  "aggregateRating": { "value": 0, "count": 0, "best": 5 },
  "faqs": [{ "question": "...", "answer": "..." }],
  "videos": [{ "title": "...", "url": "...", "thumbnail": "...", "duration": "..." }],
  "events": [{ "name": "...", "startDate": "...", "endDate": "...", "location": "...", "price": "..." }],
  "services": [{ "name": "...", "description": "..." }],
  "openingHours": ["Mon-Fri 9:00-17:00"],
  "priceRange": "...",
  "mainContent": "the primary text content of the page (first 500 chars)",
  "footerContent": "footer text if present",
  "copyright": "copyright notice if present"
}

CRITICAL: Extract ONLY what EXISTS in the HTML. Do NOT fabricate any data. Omit keys with no data found.`;

      const chunkData = await sendChatGPTRequest(extractPrompt, API_KEY, {
        systemPrompt:
          "You extract structured data from HTML into JSON. You ONLY return data that actually exists in the HTML provided. You NEVER fabricate URLs, emails, names, or any data. If a field has no data in the HTML, omit it. Return ONLY valid JSON.",
        maxTokens: 4000,
        temperature: 0.05,
      });

      const parsedChunk = extractJsonFromResponse(chunkData);
      if (parsedChunk) {
        allExtractedData = mergeExtractedData(allExtractedData, parsedChunk);
      } else {
        allExtractedData[`chunk_${i + 1}_raw`] = chunkData;
      }

      console.log(
        `[Pipeline] Chunk ${i + 1} extracted:`,
        parsedChunk
          ? `JSON (${Object.keys(parsedChunk).length} keys)`
          : "raw text",
      );
    }

    // Include metadata in extracted data
    if (Object.keys(metadata).length > 0) {
      allExtractedData._metadata = metadata;
    }

    sendEvent("step", {
      step: "extract",
      status: "done",
      message: `Extracted structured data from all ${chunks.length} chunk(s)`,
    });

    console.log(
      `[Pipeline] All extracted data keys:`,
      Object.keys(allExtractedData),
    );

    // =============================================
    // STEP 5: GENERATE SCHEMA (with extracted JSON data)
    // =============================================
    sendEvent("step", {
      step: "schema",
      status: "active",
      message: "Generating complete JSON-LD schema from extracted data...",
    });

    const schemaPrompt = buildSchemaPrompt(detection, allExtractedData, url);

    const schemaResponse = await sendChatGPTRequest(schemaPrompt, API_KEY, {
      systemPrompt: `You are the world's #1 schema.org structured data engineer. Your schemas are COMPREHENSIVE, DETAILED, and COMPLETE.

YOUR APPROACH:
1. Generate a SEPARATE @graph entity for EVERY schema type requested.
2. Fill in AS MANY properties as possible on each entity using the extracted data.
3. Cross-link all entities using @id references (e.g., publisher: {"@id": "#organization"}).
4. Every entity MUST have at minimum: @type, @id, name, description.
5. Use ONLY real extracted data. If a specific value like phone/email wasn't found, just omit that one property — but still include everything else.
6. NEVER fabricate data. No fake phones "+1-555-xxx", no fake emails, no "123 Main St", no "Lorem ipsum".
7. Output MUST be complete JSON — never truncate mid-object.
8. Wrap in <script type="application/ld+json">...</script> tags.

REMEMBER: A comprehensive schema with 50+ properties filled from real data is MUCH better than a sparse schema with 5 properties.`,
      maxTokens: 8000,
      temperature: 0.15,
    });

    // Clean the response
    let finalSchema = cleanSchemaResponse(schemaResponse);
    console.log(`[Pipeline] Schema length: ${finalSchema.length}`);

    // =============================================
    // STEP 5b: VALIDATE & REPAIR (if schema looks incomplete)
    // =============================================
    const isIncomplete = checkSchemaCompleteness(
      finalSchema,
      detection.schemaTypes,
    );

    if (isIncomplete.length > 0) {
      console.log(
        `[Pipeline] Schema missing types: ${isIncomplete.join(", ")}. Running repair...`,
      );

      sendEvent("progress", {
        message: `Repairing schema — adding missing: ${isIncomplete.join(", ")}...`,
      });

      const repairPrompt = `The following JSON-LD schema was generated but is MISSING these schema types: ${isIncomplete.join(", ")}

EXISTING SCHEMA:
${finalSchema}

EXTRACTED DATA:
${JSON.stringify(allExtractedData, null, 2)}

PAGE INFO:
- URL: ${url || "N/A"}
- Page Type: ${detection.pageType}

Add the missing schema types (${isIncomplete.join(", ")}) to the @graph array. Keep ALL existing entities and add the missing ones.

Output the COMPLETE updated <script type="application/ld+json"> block with ALL entities (existing + new).`;

      const repairResponse = await sendChatGPTRequest(repairPrompt, API_KEY, {
        systemPrompt:
          'You are a schema.org repair specialist. Add ONLY the missing schema types to the existing schema. Use ONLY real extracted data. Output the complete fixed schema. Start with <script type="application/ld+json"> and end with </script>.',
        maxTokens: 8000,
        temperature: 0.1,
      });

      const repairedSchema = cleanSchemaResponse(repairResponse);
      if (repairedSchema.length > finalSchema.length) {
        finalSchema = repairedSchema;
        console.log(
          `[Pipeline] Schema repaired. New length: ${finalSchema.length}`,
        );
      }
    }

    sendEvent("step", {
      step: "schema",
      status: "done",
      message: "Schema generated successfully!",
    });

    // =============================================
    // STEP 6: VALIDATE
    // =============================================
    sendEvent("step", {
      step: "validate",
      status: "active",
      message: "Validating schema completeness...",
    });

    const validationResults = validateSchema(finalSchema, detection);

    sendEvent("step", {
      step: "validate",
      status: "done",
      message: validationResults.join(" | ") || "Schema validated",
    });

    // SEND FINAL RESULT
    sendEvent("result", {
      schema: finalSchema,
      detection,
      stats: {
        originalSize: originalLen,
        minifiedSize: cleanedLen,
        chunks: chunks.length,
        schemaTypes: detection.schemaTypes,
        pageType: detection.pageType,
      },
    });

    sendEvent("done", { message: "Complete!" });
  } catch (error) {
    console.error("Pipeline error:", error);
    sendEvent("error", {
      message: error.message || "An unexpected error occurred",
    });
  } finally {
    res.end();
  }
});

// ============================================
// HELPER: Build extraction targets based on schema types
// ============================================
function buildExtractionTargets(schemaTypes) {
  const targets = new Set();

  // Always extract these
  targets.add("- Page title, all headings (h1, h2, h3, h4)");
  targets.add("- All image URLs (exact src attributes)");
  targets.add("- All link URLs (exact href attributes)");
  targets.add("- Business/organization name");
  targets.add("- Logo URL (from img tags in header/footer)");
  targets.add("- Navigation items / menu links");
  targets.add(
    "- Social media links (facebook, twitter, instagram, linkedin, youtube, etc.)",
  );
  targets.add("- Phone numbers (with country codes)");
  targets.add("- Email addresses");
  targets.add("- Physical address (street, city, state, zip, country)");

  for (const type of schemaTypes) {
    switch (type) {
      case "BlogPosting":
      case "Article":
      case "NewsArticle":
      case "TechArticle":
        targets.add("- Author name and URL/bio");
        targets.add("- Publication date (datePublished)");
        targets.add("- Last modified date (dateModified)");
        targets.add("- Article body / main content text");
        targets.add("- Article categories/tags");
        targets.add("- Featured image / hero image URL");
        targets.add("- Reading time if displayed");
        targets.add("- Word count if displayed");
        break;

      case "Product":
      case "Offer":
        targets.add("- Product name");
        targets.add("- Product description");
        targets.add("- Price and currency");
        targets.add("- Availability status");
        targets.add("- SKU / product ID");
        targets.add("- Brand name");
        targets.add("- Product images (all)");
        targets.add("- Product reviews and ratings");
        targets.add("- Product category");
        targets.add("- Size/color/variant options");
        break;

      case "FAQPage":
        targets.add("- ALL FAQ questions (exact text)");
        targets.add("- ALL FAQ answers (exact text)");
        break;

      case "HowTo":
        targets.add("- Step-by-step instructions (name + text for each step)");
        targets.add("- Total time / estimated time");
        targets.add("- Tools or materials needed");
        break;

      case "Recipe":
        targets.add("- Recipe name");
        targets.add("- Ingredients list (all)");
        targets.add("- Step-by-step instructions");
        targets.add("- Prep time, cook time, total time");
        targets.add("- Servings / yield");
        targets.add("- Nutrition info");
        targets.add("- Cuisine type");
        targets.add("- Recipe category");
        break;

      case "Event":
      case "BusinessEvent":
      case "EducationEvent":
        targets.add("- Event name");
        targets.add("- Event start date and time");
        targets.add("- Event end date and time");
        targets.add("- Event location (venue name, address)");
        targets.add("- Ticket price and availability");
        targets.add("- Event organizer");
        targets.add("- Performers / speakers");
        targets.add("- Event description");
        break;

      case "LocalBusiness":
      case "Restaurant":
      case "Hotel":
      case "Store":
        targets.add("- Business opening hours");
        targets.add("- Price range");
        targets.add("- Cuisine type (restaurants)");
        targets.add("- Amenities (hotels)");
        targets.add("- GPS coordinates if available");
        targets.add("- Reviews and ratings");
        targets.add("- Services offered");
        break;

      case "JobPosting":
        targets.add("- Job title");
        targets.add("- Job description");
        targets.add("- Salary / compensation");
        targets.add("- Employment type (full-time, part-time, etc.)");
        targets.add("- Job location");
        targets.add("- Hiring organization name");
        targets.add("- Date posted");
        targets.add("- Application deadline");
        targets.add("- Required qualifications");
        break;

      case "Course":
        targets.add("- Course name");
        targets.add("- Course description");
        targets.add("- Course provider / instructor");
        targets.add("- Course duration");
        targets.add("- Course price");
        targets.add("- Course language");
        targets.add("- Course topics / syllabus");
        break;

      case "VideoObject":
        targets.add("- Video name / title");
        targets.add("- Video description");
        targets.add("- Video thumbnail URL");
        targets.add("- Video upload date");
        targets.add("- Video duration");
        targets.add("- Video embed URL");
        targets.add("- Video content URL");
        break;

      case "BreadcrumbList":
        targets.add("- Breadcrumb trail items (name + URL for each level)");
        break;

      case "Service":
        targets.add("- Service name");
        targets.add("- Service description");
        targets.add("- Service area / geographic coverage");
        targets.add("- Service price");
        targets.add("- Service provider");
        break;

      case "Person":
        targets.add("- Person name");
        targets.add("- Person title / job");
        targets.add("- Person bio / description");
        targets.add("- Person image URL");
        targets.add("- Person social profiles");
        break;

      case "Review":
      case "AggregateRating":
        targets.add("- Review text");
        targets.add("- Reviewer name");
        targets.add("- Rating value");
        targets.add("- Best/worst rating");
        targets.add("- Review date");
        targets.add("- Total review count");
        targets.add("- Average rating");
        break;
    }
  }

  return Array.from(targets).join("\n");
}

// ============================================
// HELPER: Merge extracted data from multiple chunks
// ============================================
function mergeExtractedData(existing, newData) {
  const merged = { ...existing };

  for (const [key, value] of Object.entries(newData)) {
    if (value === null || value === undefined || value === "") continue;

    if (Array.isArray(value)) {
      if (Array.isArray(merged[key])) {
        // Merge arrays, avoiding duplicates
        const existingSet = new Set(
          merged[key].map((v) =>
            typeof v === "string" ? v : JSON.stringify(v),
          ),
        );
        for (const item of value) {
          const itemKey =
            typeof item === "string" ? item : JSON.stringify(item);
          if (!existingSet.has(itemKey)) {
            merged[key].push(item);
          }
        }
      } else {
        merged[key] = value;
      }
    } else if (typeof value === "object") {
      if (typeof merged[key] === "object" && !Array.isArray(merged[key])) {
        merged[key] = mergeExtractedData(merged[key], value);
      } else {
        merged[key] = value;
      }
    } else {
      // Simple value — prefer non-empty
      if (!merged[key]) {
        merged[key] = value;
      }
    }
  }

  return merged;
}

// ============================================
// HELPER: Resolve base URL from extracted data
// ============================================
function resolveBaseUrl(url, extractedData) {
  // Priority: user-provided URL > canonical > og:url > extracted links
  if (url && url.trim()) return url.trim().replace(/\/$/, "");

  const meta = extractedData?._metadata || {};
  if (meta.canonical) return meta.canonical.replace(/\/$/, "");
  if (meta.ogUrl) return meta.ogUrl.replace(/\/$/, "");

  // Try to find a base URL from links
  const links = extractedData?.links || [];
  for (const link of links) {
    const href = link?.href || link;
    if (typeof href === "string" && href.startsWith("http")) {
      try {
        const u = new URL(href);
        return `${u.protocol}//${u.hostname}`;
      } catch (e) {}
    }
  }

  return "";
}

// ============================================
// HELPER: Build the schema generation prompt
// ============================================
function buildSchemaPrompt(detection, extractedData, url) {
  const baseUrl = resolveBaseUrl(url, extractedData);
  const hasUrl = baseUrl && !baseUrl.includes("example.com");

  // Compute root domain for WebSite entity
  let rootDomain = baseUrl;
  if (baseUrl) {
    try {
      const u = new URL(baseUrl);
      rootDomain = `${u.protocol}//${u.hostname}`;
    } catch (e) {
      rootDomain = baseUrl.replace(/\/[^\/]+$/, "") || baseUrl;
    }
  }

  // Build schema-specific instructions
  const schemaInstructions = detection.schemaTypes
    .map((type) => {
      return getSchemaTypeInstructions(
        type,
        baseUrl || "https://www.yoursite.com",
      );
    })
    .join("\n\n");

  const extractedDataStr = JSON.stringify(extractedData, null, 2);
  // If extracted data is too large, truncate intelligently
  const maxDataLen = 12000;
  const dataStr =
    extractedDataStr.length > maxDataLen
      ? extractedDataStr.substring(0, maxDataLen) +
        "\n... [truncated for brevity]"
      : extractedDataStr;

  return `Generate a DETAILED, COMPREHENSIVE, production-ready JSON-LD schema for this ${detection.pageType} page.

PAGE INFO:
- Type: ${detection.pageType}
- About: ${detection.contentSummary}
- Page URL: ${baseUrl || "(not provided)"}
- Root domain: ${rootDomain || "(not provided)"}
- Schema Types to generate: ${detection.schemaTypes.join(", ")}
- Keywords: ${(detection.primaryKeywords || []).join(", ")}
- AI Focus: ${detection.aiSeoFocus || ""}
- Language: ${extractedData?._metadata?.language || "en"}

ALL EXTRACTED DATA FROM THE PAGE:
${dataStr}

You MUST generate a @graph array with a SEPARATE entity for EACH of these types: ${detection.schemaTypes.join(", ")}

FOR EACH ENTITY, include AS MANY properties as possible from the extracted data:
${schemaInstructions}

MANDATORY STRUCTURE:
1. Wrap in <script type="application/ld+json">...</script>
2. Root object: { "@context": "https://schema.org", "@graph": [...] }
3. EVERY entity in @graph MUST have: "@type", "@id", "name", "description"
4. @id format: "${baseUrl || ""}#entitytype" (e.g. "#organization", "#webpage", "#website")
5. ${hasUrl ? "Convert ALL relative URLs to absolute using base: " + baseUrl : "Keep URLs as found in the data (relative is OK if no base URL was provided)"}
6. Cross-reference entities: publisher → {"@id": "${baseUrl || ""}#organization"}, isPartOf → {"@id": "${baseUrl || ""}#website"}, mainEntityOfPage → {"@id": "${baseUrl || ""}#webpage"}
7. Include "inLanguage": "${extractedData?._metadata?.language || "en"}" on every content entity
8. Include "keywords" from the extracted content keywords, NOT from tool/app metadata

CRITICAL QUALITY RULES:
- UNIQUE DESCRIPTIONS: Each entity MUST have its OWN unique description written from the page content. Do NOT copy-paste the same description to every entity. Examples:
  * Organization: describe what the company/brand does
  * WebSite: describe the website's purpose
  * WebPage: describe this specific page's content
  * BlogPosting/Article: summarize the article
  * BreadcrumbList: "Navigation path for [page name]"
- WEBSITE ENTITY: The WebSite url MUST be the ROOT domain "${rootDomain || baseUrl || ""}" NOT the full page URL
- ORGANIZATION ENTITY: The Organization url should be the root domain "${rootDomain || baseUrl || ""}" NOT a subpage
- BREADCRUMBLIST: Each ListItem MUST have a DIFFERENT url. Example: position 1 → "${rootDomain || ""}", position 2 → "${rootDomain || ""}/category", position 3 → "${baseUrl || ""}" (the current page). Use real navigation URLs from the extracted data if available.
- SEARCH ACTION: The SearchAction target URL should use the root domain: "${rootDomain || baseUrl || ""}/?s={search_term_string}"
- FOR FAQS: If FAQ questions/answers were extracted, include them as a FAQPage entity with mainEntity array of Question + acceptedAnswer objects
- ALL SOCIAL LINKS: Include in Organization's "sameAs" array

ACCURACY RULE:
- All URLs, names, emails, phones, dates MUST come from the extracted data above
- Do NOT invent fake data like "+1-555-1234" or "info@example.com" or "123 Main St"
- If a specific value wasn't extracted, omit that property — but DO include everything that IS available

Output ONLY the schema. Start with <script type="application/ld+json"> end with </script>. No markdown.`;
}

// ============================================
// HELPER: Get specific instructions for each schema type
// ============================================
function getSchemaTypeInstructions(type, baseUrl) {
  const instructions = {
    WebSite: `WebSite (@id: "${baseUrl}#website"):
  - name, url, description, inLanguage
  - publisher → reference Organization @id
  - potentialAction: SearchAction with target URL template "${baseUrl}/?s={search_term_string}"`,

    WebPage: `WebPage (@id: "${baseUrl}#webpage"):
  - name, url, description, inLanguage
  - isPartOf → reference WebSite @id
  - datePublished, dateModified (if available)
  - breadcrumb → reference BreadcrumbList @id
  - speakable: { "@type": "SpeakableSpecification", "cssSelector": ["h1", ".article-body", ".entry-content"] }`,

    AboutPage: `AboutPage (@id: "${baseUrl}#webpage"):
  - Same as WebPage, @type: "AboutPage"
  - mainEntity → reference Organization @id`,

    ContactPage: `ContactPage (@id: "${baseUrl}#webpage"):
  - Same as WebPage, @type: "ContactPage"
  - mainEntity → reference Organization @id`,

    Organization: `Organization (@id: "${baseUrl}#organization"):
  - name, url, logo (ImageObject with url+width+height), description
  - telephone, email, address (PostalAddress)
  - sameAs: [array of social media profile URLs]
  - contactPoint: { "@type": "ContactPoint", telephone, email, contactType }`,

    LocalBusiness: `LocalBusiness (@id: "${baseUrl}#organization"):
  - All Organization properties PLUS:
  - address (PostalAddress with streetAddress, addressLocality, addressRegion, postalCode, addressCountry)
  - geo (GeoCoordinates if available)
  - openingHoursSpecification (array of DayOfWeek schedules)
  - priceRange
  - aggregateRating (if reviews exist)`,

    BlogPosting: `BlogPosting (@id: "${baseUrl}#article"):
  - headline, description, articleBody (first 200 chars of content)
  - image (array of image URLs)
  - datePublished, dateModified (ISO 8601)
  - author: { "@type": "Person", "@id": "${baseUrl}#author", name, url }
  - publisher → reference Organization @id
  - mainEntityOfPage → reference WebPage @id
  - keywords (comma-separated string)
  - wordCount, inLanguage`,

    Article: `Article (@id: "${baseUrl}#article"):
  - Same as BlogPosting properties`,

    NewsArticle: `NewsArticle (@id: "${baseUrl}#article"):
  - Same as BlogPosting + dateline`,

    Product: `Product (@id: "${baseUrl}#product"):
  - name, description, image (array), brand, sku
  - offers: { "@type": "Offer", price, priceCurrency, availability (schema.org/InStock etc.), url }
  - aggregateRating: { "@type": "AggregateRating", ratingValue, reviewCount, bestRating, worstRating }
  - review (array of Review objects if available)`,

    Service: `Service (@id: "${baseUrl}#service"):
  - name, description, provider → reference Organization @id
  - serviceType, areaServed
  - offers if pricing available`,

    FAQPage: `FAQPage (@id: "${baseUrl}#faqpage"):
  - mainEntity: array of Question objects, each with:
    { "@type": "Question", "name": "question text", "acceptedAnswer": { "@type": "Answer", "text": "answer text" } }`,

    HowTo: `HowTo (@id: "${baseUrl}#howto"):
  - name, description, totalTime (ISO 8601 duration)
  - step: array of HowToStep objects: { "@type": "HowToStep", "name": "...", "text": "...", "url": "...", "image": "..." }`,

    Recipe: `Recipe (@id: "${baseUrl}#recipe"):
  - name, image, description, author
  - prepTime, cookTime, totalTime (ISO 8601 duration: PT30M, PT1H)
  - recipeYield, recipeCategory, recipeCuisine
  - recipeIngredient (array of strings)
  - recipeInstructions (array of HowToStep)
  - nutrition: { "@type": "NutritionInformation", calories, etc. }`,

    Event: `Event (@id: "${baseUrl}#event"):
  - name, description, image, startDate, endDate (ISO 8601)
  - location: { "@type": "Place", name, address (PostalAddress) }
  - organizer → reference Organization @id
  - offers: { "@type": "Offer", price, priceCurrency, availability, url, validFrom }
  - eventStatus: "EventScheduled"
  - eventAttendanceMode: "OfflineEventAttendanceMode" or "OnlineEventAttendanceMode"`,

    JobPosting: `JobPosting (@id: "${baseUrl}#jobposting"):
  - title, description, datePosted, validThrough
  - hiringOrganization → reference Organization @id
  - jobLocation: { "@type": "Place", address (PostalAddress) }
  - baseSalary: { "@type": "MonetaryAmount", currency, value: { "@type": "QuantitativeValue", value, unitText } }
  - employmentType`,

    Course: `Course (@id: "${baseUrl}#course"):
  - name, description, url
  - provider → reference Organization @id
  - hasCourseInstance: { "@type": "CourseInstance", courseMode, courseSchedule }
  - offers if pricing available`,

    VideoObject: `VideoObject (@id: "${baseUrl}#video"):
  - name, description, thumbnailUrl
  - uploadDate (ISO 8601), duration (ISO 8601: PT5M30S)
  - contentUrl, embedUrl
  - publisher → reference Organization @id`,

    BreadcrumbList: `BreadcrumbList (@id: "${baseUrl}#breadcrumb"):
  - itemListElement: array of ListItem objects:
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "${baseUrl}" }
    If no breadcrumbs in HTML, generate logical ones: Home → Page Type → Current Page`,

    Person: `Person (@id: "${baseUrl}#author"):
  - name, url, image
  - jobTitle, worksFor → reference Organization @id
  - sameAs (social profiles array)`,

    AggregateRating: `(Include as property of the main entity, not separate in @graph)
  - ratingValue, reviewCount, bestRating: "5", worstRating: "1"`,

    Review: `(Include as property of the main entity, not separate in @graph)
  - author (Person), datePublished, reviewBody, reviewRating (Rating)`,

    ImageObject: `(Include as property within other entities, or as separate entity if main content)
  - url, width, height, caption`,

    SiteNavigationElement: `SiteNavigationElement (@id: "${baseUrl}#navigation"):
  - name: "Main Navigation"
  - url: "${baseUrl}"`,

    ItemList: `ItemList (@id: "${baseUrl}#itemlist"):
  - itemListElement: array of ListItem objects with position, url, name`,

    CollectionPage: `CollectionPage (@id: "${baseUrl}#webpage"):
  - Same as WebPage but @type: "CollectionPage"
  - mainEntity → reference ItemList @id`,

    Restaurant: `Restaurant (@id: "${baseUrl}#organization"):
  - All LocalBusiness properties PLUS:
  - servesCuisine, menu, acceptsReservations`,

    Hotel: `Hotel (@id: "${baseUrl}#organization"):
  - All LocalBusiness properties PLUS:
  - amenityFeature, checkinTime, checkoutTime, numberOfRooms`,
  };

  return (
    instructions[type] ||
    `${type}: Include all required schema.org properties for this type.`
  );
}

// ============================================
// HELPER: Check schema completeness
// ============================================
function checkSchemaCompleteness(schema, requiredTypes) {
  const missing = [];
  // Types that are typically embedded as properties, not standalone @graph entries
  const embeddedTypes = new Set([
    "AggregateRating",
    "Review",
    "ImageObject",
    "Offer",
    "SiteNavigationElement",
    "Person",
  ]);

  for (const type of requiredTypes) {
    if (embeddedTypes.has(type)) continue;
    if (!schema.includes(`"${type}"`)) {
      missing.push(type);
    }
  }

  // Also check for essential structural elements
  if (!schema.includes('"@context"')) missing.push("@context");
  if (!schema.includes('"@graph"')) missing.push("@graph");

  return missing;
}

// ============================================
// HELPER: Clean schema LLM response
// ============================================
function cleanSchemaResponse(response) {
  let schema = response.trim();

  // Remove markdown code blocks
  schema = schema
    .replace(/^```(?:html|json|jsonld)?\s*/i, "")
    .replace(/\s*```$/i, "");

  // Remove any text before <script
  const scriptStart = schema.indexOf("<script");
  if (scriptStart > 0) {
    schema = schema.substring(scriptStart);
  }

  // Remove any text after </script>
  const scriptEnd = schema.lastIndexOf("</script>");
  if (scriptEnd !== -1) {
    schema = schema.substring(0, scriptEnd + "</script>".length);
  }

  // If no script tags, try to wrap the JSON
  if (!schema.includes("<script")) {
    const json = extractJsonFromResponse(schema);
    if (json) {
      schema = `<script type="application/ld+json">\n${JSON.stringify(json, null, 2)}\n</script>`;
    }
  }

  return schema;
}

// ============================================
// HELPER: Validate the final schema
// ============================================
function validateSchema(schema, detection) {
  const notes = [];

  if (schema.includes("@context")) notes.push("✓ @context");
  if (schema.includes("@type")) notes.push("✓ @type");
  if (schema.includes("schema.org")) notes.push("✓ schema.org");
  if (schema.includes("@graph")) notes.push("✓ @graph");
  if (schema.includes("@id")) notes.push("✓ @id interlinking");
  if (schema.includes('"name"')) notes.push("✓ name");
  if (schema.includes('"url"')) notes.push("✓ url");
  if (schema.includes('"description"')) notes.push("✓ description");
  if (schema.includes("potentialAction")) notes.push("✓ potentialAction");
  if (schema.includes("mainEntityOfPage")) notes.push("✓ mainEntityOfPage");
  if (schema.includes("BreadcrumbList")) notes.push("✓ BreadcrumbList");
  if (schema.includes("inLanguage")) notes.push("✓ inLanguage");
  if (schema.includes("sameAs")) notes.push("✓ sameAs");
  if (schema.includes("speakable")) notes.push("✓ speakable");

  // Count how many schema types were included
  const detectedCount = detection.schemaTypes.filter((t) =>
    schema.includes(t),
  ).length;
  notes.push(
    `✓ ${detectedCount}/${detection.schemaTypes.length} schemas included`,
  );

  // Check for common hallucination patterns
  const hallucinations = [];
  if (schema.includes("+1-555-")) hallucinations.push("fake phone");
  if (schema.includes("example.com") && !schema.includes('"@context"'))
    hallucinations.push("example.com URLs");
  if (schema.includes("john.doe@")) hallucinations.push("fake email");
  if (schema.includes("123 Main St")) hallucinations.push("fake address");
  if (schema.includes("Lorem ipsum")) hallucinations.push("lorem ipsum");

  if (hallucinations.length > 0) {
    notes.push(`⚠ Possible fabricated data: ${hallucinations.join(", ")}`);
  }

  return notes;
}

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", port: PORT });
});

// Serve UI
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Start
app.listen(PORT, () => {
  console.log(`\n🚀 AI Schema Generator running at http://localhost:${PORT}`);
  console.log(`   Model: llama-3.3-70b-versatile via Groq`);
  console.log(
    `   Pipeline: Clean → Chunk → Recognize → Extract → Schema → Validate\n`,
  );
});
