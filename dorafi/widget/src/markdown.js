import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Fast, lightweight and secure Markdown Parser for Vanilla JS Chatbot Widget
 * Uses marked for standard compliant parsing and DOMPurify to prevent XSS.
 */

// A link the assistant gives out is meant to help the visitor navigate the
// site — not to hand the chat window's own tab away. A plain, target-less
// <a> (marked's default) navigates the current tab, which tears down the
// widget's whole DOM (the host page unloads, the script re-runs from
// scratch): the panel closes and the visible transcript is gone, even
// though the conversation itself lives on server-side under the same
// persisted session_id. Forcing every link into a new tab, once here for
// every render, keeps the host page — and the open conversation on it —
// exactly as the visitor left it. Same reasoning as the "Powered by" footer
// link in main.js, just centralized for every link the model produces.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

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
