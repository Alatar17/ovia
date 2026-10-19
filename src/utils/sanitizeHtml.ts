/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'a',
  'b',
  'i',
  'u',
  'strong',
  'em',
  'br',
  'span',
  'div',
  'p',
  'ul',
  'ol',
  'li',
  'font',
  'sub',
  'sup',
  'hr',
  'button',
  'img',
];

const ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'class',
  'style',
  'title',
  'type',
  'src',
  'alt',
  'data-file',
  'data-headword',
  'data-media-name',
  'aria-label',
  'color',
  'size',
  'face',
];

const ALLOWED_STYLES = new Set([
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'text-decoration',
  'display',
]);

/**
 * Sanitize card HTML with strict DOMPurify whitelist.
 * - [sound:filename.ext] -> audio button with data-file
 * - <img> allowed with local filename only, stripped of remote URLs, sizing attributes removed
 * - <a> forces https://, target="_blank", rel="noopener noreferrer"
 * - Styles strictly filtered to allowed set
 */
export function sanitizeCardHtml(rawHtml: string, headword: string): string {
  if (!rawHtml) return '';

  // 1. Replace [sound:filename.ext] with inline audio play button carrying data-file
  let processed = rawHtml.replace(/\[sound:([^\]]+)\]/gi, (_match, soundFile) => {
    const cleanFile = String(soundFile).trim();
    const safeAttr = cleanFile.replace(/"/g, '&quot;');
    return `<button type="button" class="sound-play-btn inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-[11px] font-bold mx-1 align-baseline transition-colors cursor-pointer select-none" data-file="${safeAttr}" data-headword="${encodeURIComponent(headword)}" title="Telaffuzu Dinle: ${headword}" aria-label="Telaffuz Dinle">▶</button>`;
  });

  // 2. Pre-process <img> tags: transform local filenames into data-media-name
  // Strip dangerous remote protocols (http, https, data, javascript)
  processed = processed.replace(/<img\b([^>]*)>/gi, (_match, attrs) => {
    const srcMatch = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^"'\s>]+))/i);
    if (!srcMatch) return '';
    const rawSrc = (srcMatch[1] || srcMatch[2] || srcMatch[3] || '').trim();

    // Reject dangerous or remote schemes
    if (
      !rawSrc ||
      /^(https?:\/\/|data:|javascript:|blob:|file:)/i.test(rawSrc) ||
      rawSrc.includes('<') ||
      rawSrc.includes('>')
    ) {
      return '';
    }

    const cleanName = rawSrc.replace(/[<>"']/g, '').trim();
    if (!cleanName) return '';

    const altMatch = attrs.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^"'\s>]+))/i);
    const alt = altMatch
      ? (altMatch[1] || altMatch[2] || altMatch[3] || '').replace(/[<>"']/g, '').trim()
      : '';
    const altAttr = alt ? ` alt="${alt.replace(/"/g, '&quot;')}"` : '';

    const safeMediaName = cleanName.replace(/"/g, '&quot;');
    return `<img data-media-name="${safeMediaName}" class="max-w-full h-auto max-h-[40vh] object-contain rounded-lg my-2 mx-auto block" style="display: none;"${altAttr} />`;
  });

  // 3. Purify using DOMPurify
  const clean = DOMPurify.sanitize(processed, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ['script', 'style', 'iframe', 'svg', 'object', 'embed', 'input', 'textarea', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  });

  // 4. In a browser DOM environment, verify <a> target/rel, verify <img>, and filter element styles
  if (typeof window !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${clean}</body>`, 'text/html');

    // Secure links
    const links = doc.querySelectorAll('a');
    links.forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (!href.startsWith('https://')) {
        a.removeAttribute('href');
      } else {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        a.classList.add('underline', 'underline-offset-2', 'text-emerald-400', 'hover:text-emerald-300');
      }
    });

    // Remove any <img> tags that do not have data-media-name
    const images = doc.querySelectorAll('img');
    images.forEach((img) => {
      if (!img.getAttribute('data-media-name')) {
        img.remove();
      }
    });

    // Filter inline style properties
    const styledElements = doc.querySelectorAll('[style]');
    styledElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      // If it's our hidden image, keep display: none
      if (htmlEl.tagName.toLowerCase() === 'img' && htmlEl.getAttribute('data-media-name')) {
        return;
      }

      const originalStyle = htmlEl.getAttribute('style') || '';
      const pairs = originalStyle.split(';').map((p) => p.trim()).filter(Boolean);
      const validPairs: string[] = [];

      for (const pair of pairs) {
        const colonIdx = pair.indexOf(':');
        if (colonIdx !== -1) {
          const prop = pair.substring(0, colonIdx).trim().toLowerCase();
          const val = pair.substring(colonIdx + 1).trim();
          if (ALLOWED_STYLES.has(prop)) {
            validPairs.push(`${prop}: ${val}`);
          }
        }
      }

      if (validPairs.length > 0) {
        htmlEl.setAttribute('style', validPairs.join('; '));
      } else {
        htmlEl.removeAttribute('style');
      }
    });

    return doc.body.innerHTML;
  }

  return clean;
}
