'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface ClinicalMarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Extracts human-readable markdown from potentially JSON-wrapped or raw text strings.
 */
function extractReadableContent(raw: string): string {
  if (!raw) return '';
  let str = raw.trim();

  // 1. Strip triple backtick blocks if it wrapped the entire response
  if (str.startsWith('```json') && str.endsWith('```')) {
    str = str.slice(7, -3).trim();
  } else if (str.startsWith('```markdown') && str.endsWith('```')) {
    str = str.slice(11, -3).trim();
  } else if (str.startsWith('```') && str.endsWith('```')) {
    str = str.slice(3, -3).trim();
  }

  // 2. If it's a JSON object string, try to parse and extract relevant medical/academic fields
  if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed === 'object' && parsed !== null) {
        if (typeof parsed.text === 'string' && parsed.text.trim()) return parsed.text;
        if (typeof parsed.answer === 'string' && parsed.answer.trim()) return parsed.answer;
        if (typeof parsed.explanation === 'string' && parsed.explanation.trim()) return parsed.explanation;
        if (typeof parsed.content === 'string' && parsed.content.trim()) return parsed.content;
        if (typeof parsed.analysis === 'string' && parsed.analysis.trim()) return parsed.analysis;
        if (typeof parsed.summary === 'string' && parsed.summary.trim()) return parsed.summary;
        if (typeof parsed.rationale === 'string' && parsed.rationale.trim()) return parsed.rationale;
        
        // If it's a structured response with sections, reconstruct clean markdown
        const parts: string[] = [];
        for (const [k, v] of Object.entries(parsed)) {
          const title = k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
          if (typeof v === 'string' && v.trim()) {
            parts.push(`### ${title}\n${v}`);
          } else if (Array.isArray(v) && v.length > 0) {
            parts.push(`### ${title}\n` + v.map((item) => typeof item === 'object' ? `- ${JSON.stringify(item)}` : `- ${item}`).join('\n'));
          } else if (typeof v === 'object' && v !== null) {
            parts.push(`### ${title}\n` + Object.entries(v).map(([subK, subV]) => `**${subK}**: ${subV}`).join('\n\n'));
          }
        }
        if (parts.length > 0) return parts.join('\n\n');
      }
    } catch {
      // Not strictly valid JSON, proceed with string
    }
  }

  // 3. Clean up unescaped \n if stringified
  if (str.includes('\\n') && !str.includes('\n')) {
    str = str.replace(/\\n/g, '\n');
  }

  return str;
}

/**
 * Normalizes biomedical notation, LaTeX delimiters, tables, and indentation
 * so KaTeX, Tables, and Markdown elements render cleanly and accurately.
 */
function normalizeBiomedicalNotation(raw: string): string {
  if (!raw) return '';

  let text = raw;

  // 1. Remove inadvertent 4-space indentation from normal markdown text so it doesn't turn into pre/code blocks
  // (Preserve code blocks that are explicitly wrapped in ```)
  const lines = text.split('\n');
  let inCodeBlock = false;
  const processedLines: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      processedLines.push(line);
      continue;
    }
    if (!inCodeBlock) {
      // If line is indented with 4+ spaces or a tab, but is actually markdown (header, list, table, text), trim leading indent
      if (/^\s{4,}/.test(line) && !line.startsWith('    //') && !line.startsWith('    const ') && !line.startsWith('    function ')) {
        processedLines.push(line.replace(/^\s{2,4}/, ''));
      } else {
        processedLines.push(line);
      }
    } else {
      processedLines.push(line);
    }
  }
  text = processedLines.join('\n');

  // 2. Normalize unescaped double-backslashes from JSON string serialization (e.g. \\frac -> \frac)
  text = text.replace(/\\\\([a-zA-Z]+)/g, '\\$1');

  // 3. Convert standard LaTeX display math \[ ... \] into $$ ... $$ using function callback to avoid $1 escape bug
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
    return `\n\n$$\n${math.trim()}\n$$\n\n`;
  });

  // 4. Convert standard LaTeX inline math \( ... \) into $ ... $ using function callback
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
    return `$${math.trim()}$`;
  });

  // 5. Ensure Markdown tables have an empty line before and after so remarkGfm parses them correctly
  text = text.replace(/([^\n])\n(\|[\s\S]*?\|)\n([^\n])/g, '$1\n\n$2\n\n$3');

  // 6. Support common clinical/biomedical arrows and degree shorthand outside math
  text = text
    .replace(/\\uparrow\b/g, '↑')
    .replace(/\\downarrow\b/g, '↓')
    .replace(/\\rightarrow\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\\degree\b/g, '°');

  return text;
}

export function ClinicalMarkdownRenderer({ content, className = '' }: ClinicalMarkdownRendererProps) {
  if (!content) return null;

  const rawCleaned = extractReadableContent(content);
  const sanitizedContent = normalizeBiomedicalNotation(rawCleaned);

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none break-words font-sans ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [
            rehypeKatex,
            {
              throwOnError: false,
              strict: false,
              trust: true,
              macros: {
                '\\odot': '\\odot',
                '\\oplus': '\\oplus',
                '\\degree': '^{\\circ}',
              },
            },
          ],
        ]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-base sm:text-lg font-bold text-foreground mt-3 mb-2 border-b border-border pb-1">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm sm:text-base font-bold text-primary mt-3 mb-1.5 flex items-center gap-1.5">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs sm:text-sm font-semibold text-foreground mt-2.5 mb-1">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed mb-2.5 last:mb-0">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-outside text-xs sm:text-sm space-y-1 mb-2.5 pl-4 text-foreground/90">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside text-xs sm:text-sm space-y-1 mb-2.5 pl-4 text-foreground/90">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-0.5">
              <span className="text-foreground/90">{children}</span>
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-foreground underline decoration-primary/30 decoration-1 underline-offset-2">
              {children}
            </strong>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-primary/70 pl-3.5 italic text-muted-foreground my-2.5 bg-primary/5 py-1.5 rounded-r">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            return isInline ? (
              <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-[11px] text-foreground border border-border/60">
                {children}
              </code>
            ) : (
              <code className="block p-3 rounded-lg bg-muted/80 font-mono text-[11px] text-foreground overflow-x-auto border border-border my-2.5">
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-xl border border-border bg-card shadow-2xs">
              <table className="w-full text-xs text-left border-collapse min-w-full divide-y divide-border">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/70 text-foreground font-bold">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border/50 bg-card">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-3.5 py-2.5 font-bold text-foreground text-xs uppercase tracking-wider border-b border-border">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3.5 py-2 text-foreground/90 border-b border-border/40 text-xs align-top">
              {children}
            </td>
          ),
          hr: () => <hr className="my-3 border-border/60" />,
        }}
      >
        {sanitizedContent}
      </ReactMarkdown>
    </div>
  );
}

export default ClinicalMarkdownRenderer;
