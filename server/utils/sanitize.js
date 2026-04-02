import xss from "xss";

// Strip all HTML tags, keep only text content
const strictOptions = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style"],
};

/**
 * Sanitize user-provided text content (comments, chat, reviews, names).
 * Strips all HTML to prevent stored XSS.
 */
export function sanitizeText(input) {
  if (!input || typeof input !== "string") return input;
  return xss(input, strictOptions).trim();
}
