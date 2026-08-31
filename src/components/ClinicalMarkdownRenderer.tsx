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
 * Normalizes Markdown tables to strictly comply with GFM requirements:
 * 1. Splits accidentally merged table rows (e.g., "... | | Next Row | ...").
 * 2. Ensures leading and trailing pipes on all rows of a table block.
 * 3. Validates delimiter rows (e.g., "|---|---|").
 * 4. Ensures table blocks are isolated with blank lines (\n\n) before and after so remark-gfm parses them.
 */
function normalizeMarkdownTables(text: string): string {
  if (!text || !text.includes('|')) return text;

  // Step 1: Split merged table rows that were concatenated on a single line
  // e.g., "... | | Col 1 | Col 2 |" -> "... |\n| Col 1 | Col 2 |"
  let sanitized = text.replace(/\|\s*\|\s*(?=[a-zA-Z0-9_*~`])/g, '|\n| ');

  // Step 2: Process line-by-line to identify and isolate table blocks
  const lines = sanitized.split('\n');
  const result: string[] = [];
  let inTable = false;
  let tableBuffer: string[] = [];

  const isDelimiterLine = (line: string): boolean => {
    const trimmed = line.trim();
    return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(trimmed);
  };

  const isTableRow = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed.includes('|')) return false;
    // Must contain at least one pipe and not be a pure delimiter
    return true;
  };

  const flushTableBuffer = () => {
    if (tableBuffer.length === 0) return;

    // Check if tableBuffer has at least 2 lines and contains a valid delimiter row (typically at index 1)
    let delimiterIdx = -1;
    for (let i = 0; i < tableBuffer.length; i++) {
      if (isDelimiterLine(tableBuffer[i])) {
        delimiterIdx = i;
        break;
      }
    }

    if (delimiterIdx >= 1) {
      // Valid table found!
      // Normalize all rows in this table: ensure leading '|' and trailing '|'
      const normalizedTable = tableBuffer.map((row) => {
        let r = row.trim();
        if (!r.startsWith('|')) r = '| ' + r;
        if (!r.endsWith('|')) r = r + ' |';
        return r;
      });

      // Ensure empty line before table if previous line isn't empty
      if (result.length > 0 && result[result.length - 1].trim() !== '') {
        result.push('');
      }

      result.push(...normalizedTable);

      // Add trailing empty line placeholder
      result.push('');
    } else {
      // Not a recognized table structure, push original lines as is
      result.push(...tableBuffer);
    }

    tableBuffer = [];
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (inTable) {
        flushTableBuffer();
      } else {
        result.push(line);
      }
      continue;
    }

    // Check if line looks like part of a table (contains '|')
    if (isTableRow(line)) {
      inTable = true;
      tableBuffer.push(line);
    } else {
      if (inTable) {
        flushTableBuffer();
      }
      result.push(line);
    }
  }

  if (inTable) {
    flushTableBuffer();
  }

  return result.join('\n');
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

  // 5. Robust Markdown table parsing normalization
  text = normalizeMarkdownTables(text);

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
            <div className="overflow-x-auto my-4 rounded-xl border border-border/80 bg-card shadow-xs">
              <table className="w-full text-xs text-left border-collapse min-w-full">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/80 text-foreground font-bold border-b border-border">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border/40 bg-card">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="even:bg-muted/20 odd:bg-card hover:bg-primary/5 transition-colors">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-3.5 py-2.5 font-bold text-foreground text-xs uppercase tracking-wider border-r border-border/40 last:border-r-0">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3.5 py-2.5 text-foreground/90 text-xs leading-relaxed align-top border-r border-border/30 last:border-r-0">
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
