import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Link2, Eraser } from 'lucide-react';
import { escapeHtml, looksLikeHtml, plainTextToHtml, sanitizeHtml } from '../lib/richText';

/**
 * A small dependency-free WYSIWYG editor.
 *
 * Why WYSIWYG and not Markdown: job notifications pasted from government PDFs are
 * full of literal "*" and "**" characters (e.g. "*(UR-02) (PwBD-01)**"). A Markdown
 * parser would treat those as formatting and silently corrupt real vacancy data.
 * With real buttons, an asterisk is always just an asterisk.
 *
 * Pasting is forced to PLAIN TEXT with line breaks preserved, so pasted content
 * never drags in fonts, colours or junk markup from Word / a browser / a PDF.
 *
 * Note: document.execCommand is formally deprecated but is still implemented in
 * every current browser and is the standard approach for an editor this small.
 */

const RTE_CSS = `
.rte-content { outline: none; }
.rte-content ul { list-style: disc; padding-left: 1.25rem; margin: 0.5rem 0; }
.rte-content ol { list-style: decimal; padding-left: 1.25rem; margin: 0.5rem 0; }
.rte-content li { margin: 0.15rem 0; }
.rte-content b, .rte-content strong { font-weight: 600; }
.rte-content i, .rte-content em { font-style: italic; }
.rte-content u { text-decoration: underline; text-underline-offset: 2px; }
.rte-content s, .rte-content strike { text-decoration: line-through; }
.rte-content a { color: #8b2df2; text-decoration: underline; }
.rte-content p { margin: 0 0 0.5rem; }
.rte-content h3 { font-weight: 600; font-size: 1rem; margin: 0.75rem 0 0.35rem; }
.rte-content h4 { font-weight: 600; font-size: 0.875rem; margin: 0.75rem 0 0.25rem; }
.rte-content blockquote { border-left: 2px solid #e4e4e7; padding-left: 0.75rem; color: #52525b; margin: 0.5rem 0; }
`;

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const tag = document.createElement('style');
  tag.setAttribute('data-rte', 'true');
  tag.textContent = RTE_CSS;
  document.head.appendChild(tag);
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = '',
  minHeight = 120,
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [active, setActive] = useState<Record<string, boolean>>({});

  // Load the initial content ONCE. The parent remounts this component (via `key`)
  // whenever it switches records, which is what keeps the caret from jumping.
  useEffect(() => {
    ensureStyles();
    const el = ref.current;
    if (!el) return;
    el.innerHTML = looksLikeHtml(value) ? sanitizeHtml(value) : plainTextToHtml(value || '');
    setIsEmpty(!el.textContent?.trim() && !el.querySelector('li'));
    // Produce <b>/<i> tags rather than <span style="...">, which sanitises better.
    try { document.execCommand('styleWithCSS', false, 'false'); } catch { /* not critical */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    setIsEmpty(!el.textContent?.trim() && !el.querySelector('li'));
    onChange(el.innerHTML);
  };

  const refreshActive = () => {
    try {
      setActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
      });
    } catch { /* queryCommandState can throw when nothing is selected */ }
  };

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    try { document.execCommand(command, false, arg); } catch { /* ignore */ }
    emit();
    refreshActive();
  };

  const addLink = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      alert('Select the text you want to turn into a link first.');
      return;
    }
    const url = prompt('Link URL (must start with https://)', 'https://');
    if (!url) return;
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(url.trim())) {
      alert('Please enter a valid link starting with https://, mailto: or tel:');
      return;
    }
    exec('createLink', url.trim());
  };

  // Force plain-text paste, but keep the line breaks. This is the fix for pasted
  // notification text arriving as one unbroken paragraph.
  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const html = escapeHtml(text).replace(/\r\n|\r|\n/g, '<br>');
    try { document.execCommand('insertHTML', false, html); } catch { /* ignore */ }
    emit();
  };

  const Btn = ({
    cmd, icon: Icon, label, onClick,
  }: {
    cmd?: string;
    icon: typeof Bold;
    label: string;
    onClick?: () => void;
  }) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      // preventDefault on mousedown keeps the text selection alive when the
      // button steals focus — without this, Bold would apply to nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => (onClick ? onClick() : cmd && exec(cmd))}
      className={`p-1.5 rounded-md transition ${
        cmd && active[cmd]
          ? 'bg-[#8b2df2] text-white'
          : 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800'
      }`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-[#8b2df2]/30 focus-within:border-[#8b2df2] transition">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-zinc-100 bg-zinc-50 flex-wrap">
        <Btn cmd="bold" icon={Bold} label="Bold (Ctrl+B)" />
        <Btn cmd="italic" icon={Italic} label="Italic (Ctrl+I)" />
        <Btn cmd="underline" icon={Underline} label="Underline (Ctrl+U)" />
        <span className="w-px h-5 bg-zinc-200 mx-1" />
        <Btn cmd="insertUnorderedList" icon={List} label="Bulleted list" />
        <Btn cmd="insertOrderedList" icon={ListOrdered} label="Numbered list" />
        <span className="w-px h-5 bg-zinc-200 mx-1" />
        <Btn icon={Link2} label="Insert link" onClick={addLink} />
        <Btn icon={Eraser} label="Clear formatting" onClick={() => exec('removeFormat')} />
      </div>

      <div className="relative">
        {isEmpty && placeholder && (
          <div className="absolute top-3 left-3 text-sm text-zinc-400 pointer-events-none select-none">
            {placeholder}
          </div>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          className="rte-content px-3 py-3 text-sm text-zinc-900 leading-relaxed overflow-y-auto"
          style={{ minHeight: `${minHeight}px`, maxHeight: '460px' }}
          onInput={emit}
          onBlur={emit}
          onPaste={handlePaste}
          onKeyUp={refreshActive}
          onMouseUp={refreshActive}
          onFocus={refreshActive}
        />
      </div>
    </div>
  );
}