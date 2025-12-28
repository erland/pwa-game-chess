import { Fragment } from 'react';

function renderInline(text: string): React.ReactNode[] {
  // Very small, safe subset: inline code, bold, italics.
  // No HTML is interpreted.
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    if (p.startsWith('`') && p.endsWith('`') && p.length >= 2) {
      out.push(
        <code key={i} className="inlineCode">
          {p.slice(1, -1)}
        </code>
      );
      continue;
    }
    if (p.startsWith('**') && p.endsWith('**') && p.length >= 4) {
      out.push(
        <strong key={i}>
          {p.slice(2, -2)}
        </strong>
      );
      continue;
    }
    if (p.startsWith('*') && p.endsWith('*') && p.length >= 2) {
      out.push(
        <em key={i}>
          {p.slice(1, -1)}
        </em>
      );
      continue;
    }
    out.push(<Fragment key={i}>{p}</Fragment>);
  }
  return out;
}

export function MarkdownLite({ text }: { text: string }) {
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n');

  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) i++;

      blocks.push(
        <pre key={`code_${blocks.length}`} className="codeBlock">
          <code data-lang={lang || undefined}>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Headings
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const content = h[2];
      const Tag = (level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5') as any;
      blocks.push(
        <Tag key={`h_${blocks.length}`} style={{ marginTop: 0 }}>
          {renderInline(content)}
        </Tag>
      );
      i++;
      continue;
    }

    // Lists
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`ul_${blocks.length}`}>
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Paragraphs (collapse consecutive non-empty lines)
    if (line.trim().length === 0) {
      i++;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim().length > 0 && !/^\s*[-*]\s+/.test(lines[i]) && !lines[i].trim().startsWith('```') && !/^(#{1,3})\s+/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }

    blocks.push(
      <p key={`p_${blocks.length}`} style={{ marginTop: 0 }}>
        {renderInline(para.join(' '))}
      </p>
    );
  }

  return <div className="markdownLite">{blocks}</div>;
}
