import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Fast, lightweight and secure Markdown Parser for Vanilla JS Chatbot Widget
 * Uses marked for standard compliant parsing and DOMPurify to prevent XSS.
 */
export function parseMarkdown(text) {
  if (!text) return '';

  // Configure marked for strict rendering (e.g. gfm, breaks)
  marked.setOptions({
    gfm: true,
    breaks: true
  });

  // Parse markdown to HTML
  const rawHtml = marked.parse(text);

  // Sanitize the HTML to prevent XSS
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'br', 'hr'],
    ALLOWED_ATTR: ['href', 'target', 'rel']
  });

  return cleanHtml;
}
