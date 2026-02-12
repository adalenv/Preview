/**
 * Rewrite relative URLs in HTML to absolute raw.githubusercontent.com URLs.
 * Uses DOMParser for safe parsing and to avoid injection when setting attributes.
 */

const URL_ATTRS = {
  a: ['href'],
  img: ['src'],
  script: ['src'],
  link: ['href'],
  source: ['src'],
  video: ['src', 'poster'],
  audio: ['src'],
};

/**
 * Check if a URL should not be rewritten: absolute http(s), hash-only, data:, mailto:, tel:, javascript:.
 * @param {string} url
 * @returns {boolean}
 */
function isAbsoluteOrSpecial(url) {
  if (!url || typeof url !== 'string') return true;
  const t = url.trim();
  if (t.startsWith('http://') || t.startsWith('https://')) return true;
  if (t.startsWith('#')) return true;
  if (t.startsWith('data:')) return true;
  if (t.startsWith('mailto:') || t.startsWith('tel:') || t.startsWith('javascript:')) return true;
  return false;
}

/**
 * Resolve relative URL against base (raw directory URL).
 * @param {string} relative
 * @param {string} baseRawDirUrl
 * @returns {string}
 */
function resolveUrl(relative, baseRawDirUrl) {
  const base = baseRawDirUrl.endsWith('/') ? baseRawDirUrl : baseRawDirUrl + '/';
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

/**
 * Rewrite relative href/src (etc.) in the document to absolute raw URLs.
 * @param {Document} doc
 * @param {string} baseRawDirUrl
 */
function rewriteDocument(doc, baseRawDirUrl) {
  for (const [tag, attrs] of Object.entries(URL_ATTRS)) {
    const nodes = doc.querySelectorAll(`${tag}[${attrs[0]}]`);
    for (const el of nodes) {
      for (const attr of attrs) {
        const url = el.getAttribute(attr);
        if (url && !isAbsoluteOrSpecial(url)) {
          const absolute = resolveUrl(url, baseRawDirUrl);
          el.setAttribute(attr, absolute);
        }
      }
    }
  }
}

/**
 * Rewrite HTML string: parse with DOMParser, rewrite relative URLs, serialize back.
 * @param {string} htmlText
 * @param {string} baseRawDirUrl - base URL for the directory containing the HTML file (raw GitHub dir).
 * @returns {string}
 */
export function rewriteHtml(htmlText, baseRawDirUrl) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');
  rewriteDocument(doc, baseRawDirUrl);
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}
