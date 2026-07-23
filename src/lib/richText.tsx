import { createElement, Fragment, ReactNode } from 'react';

/**
 * Rich-text helpers for job content.
 *
 * Content is stored as a small, strictly allow-listed subset of HTML.
 * IMPORTANT: nothing here ever uses dangerouslySetInnerHTML. The renderer parses
 * the stored string into a detached DOM and rebuilds it as React elements, so
 * even a compromised manager account cannot inject a working <script>.
 *
 * Backward compatible: jobs saved before this feature are plain text with "\n"
 * line breaks. Those still render correctly (see FormattedText).
 */

/** Tags we keep. Everything else is unwrapped (contents kept, tag dropped). */
const ALLOWED = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL',
  'P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'A', 'H3', 'H4', 'BLOCKQUOTE',
]);

/** Tags dropped together with all their contents. */
const DROP_ENTIRELY = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META',
  'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'SVG', 'MATH', 'BASE',
]);

/** Map stored tag -> tag we actually render. */
const RENDER_AS: Record<string, string> = {
  B: 'strong', STRONG: 'strong',
  I: 'em', EM: 'em',
  U: 'u',
  S: 's', STRIKE: 's', DEL: 's',
  P: 'p', DIV: 'div',
  UL: 'ul', OL: 'ol', LI: 'li',
  A: 'a',
  H3: 'h3', H4: 'h4',
  BLOCKQUOTE: 'blockquote',
};

/** Tailwind classes applied per rendered tag. */
const TAG_CLASS: Record<string, string> = {
  strong: 'font-semibold text-zinc-900',
  em: 'italic',
  u: 'underline underline-offset-2',
  s: 'line-through',
  p: 'mb-2 last:mb-0',
  div: '',
  ul: 'list-disc pl-5 space-y-1 my-2',
  ol: 'list-decimal pl-5 space-y-1 my-2',
  li: 'pl-0.5',
  h3: 'font-heading font-semibold text-zinc-900 text-base mt-3 mb-1.5',
  h4: 'font-heading font-semibold text-zinc-900 text-sm mt-3 mb-1',
  blockquote: 'border-l-2 border-zinc-200 pl-3 text-zinc-600 my-2',
  a: 'text-[#8b2df2] underline underline-offset-2 hover:opacity-80 break-words',
};

/** Only these protocols are allowed on links. Blocks javascript: and data: URLs. */
function safeUrl(raw: string | null): string | null {
  if (!raw) return null;
  const url = raw.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) return url;
  if (/^www\./i.test(url)) return `https://${url}`;
  return null;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Decode the handful of entities a contentEditable produces.
 *
 * Needed because a value like "Health &amp; Family Welfare" contains no tags, so
 * it takes the plain-text path below — without this it would render the literal
 * text "&amp;". Order matters: &amp; must be decoded LAST, or "&amp;lt;" would
 * double-decode into "<".
 */
export function decodeBasicEntities(s: string): string {
  if (!s) return '';
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

/** Does this value contain any of our formatting tags? (false = legacy plain text) */
export function looksLikeHtml(v?: string | null): boolean {
  if (!v) return false;
  return /<\/?(b|strong|i|em|u|s|strike|del|p|div|br|ul|ol|li|a|h3|h4|blockquote)\b[^>]*>/i.test(v);
}

/** Convert plain text (with newlines) into our HTML form. Used when a legacy job is opened for editing. */
export function plainTextToHtml(text: string): string {
  if (!text) return '';
  return escapeHtml(text).replace(/\r\n|\r|\n/g, '<br>');
}

/** True when the value renders as nothing (covers "", "<p></p>", "<div><br></div>", "&nbsp;"). */
export function isEmptyHtml(v?: string | null): boolean {
  if (!v) return true;
  if (!looksLikeHtml(v)) return decodeBasicEntities(v).trim().length === 0;
  const text = v
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length === 0;
}

/** Recursively rebuild a clean tree. Rebuilding (not filtering in place) is what makes this safe. */
function rebuild(src: Node, dest: Element, doc: Document): void {
  Array.from(src.childNodes).forEach((node) => {
    if (node.nodeType === 3) {
      dest.appendChild(doc.createTextNode(node.nodeValue || ''));
      return;
    }
    if (node.nodeType !== 1) return;

    const el = node as Element;
    const tag = el.tagName.toUpperCase();

    if (DROP_ENTIRELY.has(tag)) return;                       // drop tag AND contents
    if (!ALLOWED.has(tag)) { rebuild(el, dest, doc); return; } // unwrap: keep contents only

    const fresh = doc.createElement(tag.toLowerCase());       // fresh node = zero attributes carried over
    if (tag === 'A') {
      const href = safeUrl(el.getAttribute('href'));
      if (!href) { rebuild(el, dest, doc); return; }
      fresh.setAttribute('href', href);
    }
    rebuild(el, fresh, doc);
    dest.appendChild(fresh);
  });
}

/** Strip everything not on the allow-list. Call this before writing to Firestore. */
export function sanitizeHtml(dirty?: string | null): string {
  if (!dirty) return '';
  if (typeof DOMParser === 'undefined') return '';
  try {
    const doc = new DOMParser().parseFromString(`<body>${dirty}</body>`, 'text/html');
    const out = doc.createElement('div');
    rebuild(doc.body, out, doc);
    return out.innerHTML;
  } catch {
    return '';
  }
}

/** Convert one parsed DOM node into React elements. */
function toReact(node: Node, key: number): ReactNode {
  if (node.nodeType === 3) return node.nodeValue;
  if (node.nodeType !== 1) return null;

  const el = node as Element;
  const tag = el.tagName.toUpperCase();
  if (DROP_ENTIRELY.has(tag)) return null;
  if (tag === 'BR') return <br key={key} />;

  const kids = Array.from(el.childNodes).map((child, i) => toReact(child, i));
  const rendered = RENDER_AS[tag];

  // Unknown tag: keep the text, drop the wrapper.
  if (!rendered) return <Fragment key={key}>{kids}</Fragment>;

  if (rendered === 'a') {
    const href = safeUrl(el.getAttribute('href'));
    if (!href) return <Fragment key={key}>{kids}</Fragment>;
    return (
      <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={TAG_CLASS.a}>
        {kids}
      </a>
    );
  }

  return createElement(
    rendered,
    { key, className: TAG_CLASS[rendered] || undefined },
    kids.length ? kids : undefined,
  );
}

interface FormattedTextProps {
  value?: string | null;
  /** Classes for the wrapper. Note: renders a <div>, so never nest inside a <p>. */
  className?: string;
}

/**
 * Renders stored job content.
 * - Legacy plain text  -> whitespace-pre-wrap, so pasted line breaks and numbering survive.
 * - Formatted HTML     -> parsed and rebuilt as React elements.
 */
export function FormattedText({ value, className = '' }: FormattedTextProps) {
  if (isEmptyHtml(value)) return null;
  const v = value as string;

  // Legacy plain text, or editor output with no tags (e.g. "Health &amp; Family").
  // Entities must be decoded here or they would render literally.
  if (!looksLikeHtml(v)) {
    return <div className={`whitespace-pre-wrap ${className}`}>{decodeBasicEntities(v)}</div>;
  }

  if (typeof DOMParser === 'undefined') {
    return <div className={`whitespace-pre-wrap ${className}`}>{decodeBasicEntities(v.replace(/<[^>]*>/g, ''))}</div>;
  }

  try {
    const doc = new DOMParser().parseFromString(`<body>${v}</body>`, 'text/html');
    const kids = Array.from(doc.body.childNodes).map((n, i) => toReact(n, i));
    return <div className={className}>{kids}</div>;
  } catch {
    return <div className={`whitespace-pre-wrap ${className}`}>{decodeBasicEntities(v.replace(/<[^>]*>/g, ''))}</div>;
  }
}

export default FormattedText;