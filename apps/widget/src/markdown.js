/**
 * Fast, lightweight and secure Markdown Parser for Vanilla JS Chatbot Widget
 */

export function parseMarkdown(text) {
  if (!text) return '';

  // 1. Sanitize HTML entities
  let str = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. Code blocks (```lang \n code \n ```)
  str = str.replace(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (match, code) => {
    return `<pre class="b2b-code-block"><code>${code.trim()}</code></pre>`;
  });

  // 3. Inline code (`code`)
  str = str.replace(/`([^`]+)`/g, '<code class="b2b-inline-code">$1</code>');

  // 4. Headers (### h3, ## h2, # h1)
  str = str.replace(/^### (.*$)/gim, '<h3 class="b2b-h3">$1</h3>');
  str = str.replace(/^## (.*$)/gim, '<h2 class="b2b-h2">$1</h2>');
  str = str.replace(/^# (.*$)/gim, '<h1 class="b2b-h1">$1</h1>');

  // 5. Bold (**text** or __text__)
  str = str.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  str = str.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // 6. Italic (*text* or _text_)
  str = str.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  str = str.replace(/_([^_]+)_/g, '<em>$1</em>');

  // 7. Links ([text](url))
  str = str.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="b2b-link">$1 ↗</a>');

  // 8. Blockquotes (> text)
  str = str.replace(/^>\s+(.*$)/gim, '<blockquote class="b2b-blockquote">$1</blockquote>');

  // 9. Lists
  // Split into lines to parse lists and paragraphs cleanly
  const lines = str.split('\n');
  const output = [];
  let inUl = false;
  let inOl = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ulMatch = line.match(/^[\*\-]\s+(.*)$/);
    const olMatch = line.match(/^(\d+)\.\s+(.*)$/);

    if (ulMatch) {
      if (!inUl) {
        if (inOl) { output.push('</ol>'); inOl = false; }
        output.push('<ul class="b2b-list">');
        inUl = true;
      }
      output.push(`<li>${ulMatch[1]}</li>`);
    } else if (olMatch) {
      if (!inOl) {
        if (inUl) { output.push('</ul>'); inUl = false; }
        output.push('<ol class="b2b-list">');
        inOl = true;
      }
      output.push(`<li>${olMatch[2]}</li>`);
    } else {
      if (inUl) { output.push('</ul>'); inUl = false; }
      if (inOl) { output.push('</ol>'); inOl = false; }
      output.push(line);
    }
  }

  if (inUl) output.push('</ul>');
  if (inOl) output.push('</ol>');

  str = output.join('\n');

  // 10. Paragraphs & Line Breaks
  // Preserve spacing between block elements
  str = str.replace(/\n{2,}/g, '</p><p class="b2b-p">');
  str = str.replace(/\n/g, '<br/>');

  // Wrap in paragraph if not starting with a block element
  if (!str.startsWith('<h') && !str.startsWith('<pre') && !str.startsWith('<ul') && !str.startsWith('<ol') && !str.startsWith('<blockquote')) {
    str = `<p class="b2b-p">${str}</p>`;
  }

  // Clean up empty paragraphs
  str = str.replace(/<p class="b2b-p">\s*<\/p>/g, '');

  return str;
}
