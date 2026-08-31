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

  // 2. If it's a JSON object string, try to parse and extract relevant medical fields
  if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed === 'object' && parsed !== null) {
        if (typeof parsed.text === 'string') return parsed.text;
        if (typeof parsed.answer === 'string') return parsed.answer;
        if (typeof parsed.explanation === 'string') return parsed.explanation;
        if (typeof parsed.content === 'string') return parsed.content;
        if (typeof parsed.analysis === 'string') return parsed.analysis;
        if (typeof parsed.summary === 'string') return parsed.summary;
        if (typeof parsed.rationale === 'string') return parsed.rationale;
        
        // If it's a structured response with sections, reconstruct clean markdown
        const parts: string[] = [];
        for (const [k, v] of Object.entries(parsed)) {
          const title = k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
          if (typeof v === 'string') {
            parts.push(`### ${title}\n${v}`);
          } else if (Array.isArray(v)) {
            parts.push(`### ${title}\n` + v.map((item) => typeof item === 'object' ? `- ${JSON.stringify(item)}` : `- ${item}`).join('\n'));
          } else if (typeof v === 'object' && v !== null) {
            parts.push(`### ${title}\n` + Object.entries(v).map(([subK, subV]) => `**${subK}**: ${subV}`).join('\n\n'));
          }
        }
        if (parts.length > 0) return parts.join('\n\n');
      }
    } catch {
      // Not strictly JSON, proceed with string
    }
  }

  // 3. Clean up unescaped \n if stringified
  if (str.includes('\\n') && !str.includes('\n')) {
    str = str.replace(/\\n/g, '\n');
  }

  return str;
}

/**
 * Normalizes biomedical notation, LaTeX delimiters, and escapes so KaTeX and Markdown render cleanly.
 */
function normalizeBiomedicalNotation(raw: string): string {
  if (!raw) return '';

  let text = raw;

  // 1. Normalize unescaped double-backslashes from JSON string serialization (e.g. \\frac -> \frac)
  text = text.replace(/\\\\([a-zA-Z]+)/g, '\\$1');

  // 2. Convert standard LaTeX display math \[ ... \] into $$ ... $$
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, '\n\n$$$$1$$\n\n');

  // 3. Convert standard LaTeX inline math \( ... \) into $ ... $
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$');

  // 4. Support common clinical/biomedical arrows and degree shorthand outside math
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
            <h1 className="text-base sm:text-lg font-bold text-foreground mt-3 mb-1.5 border-b border-border pb-1">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm sm:text-base font-bold text-foreground mt-2.5 mb-1 text-primary">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs sm:text-sm font-semibold text-foreground mt-2 mb-1">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed mb-2 last:mb-0">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside text-xs sm:text-sm space-y-1 mb-2 pl-1 text-foreground/90">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside text-xs sm:text-sm space-y-1 mb-2 pl-1 text-foreground/90">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">
              <span className="text-foreground/90">{children}</span>
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/60 pl-3 italic text-muted-foreground my-2 bg-primary/5 py-1 rounded-r">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            return isInline ? (
              <code className="px-1 py-0.5 rounded bg-muted font-mono text-[11px] text-foreground border border-border/60">
                {children}
              </code>
            ) : (
              <code className="block p-2 rounded-lg bg-muted font-mono text-[11px] text-foreground overflow-x-auto border border-border my-2">
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-2 rounded-lg border border-border">
              <table className="w-full text-xs text-left border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="bg-muted/80 px-3 py-1.5 font-bold text-foreground border-b border-border">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-1.5 border-b border-border/50 text-foreground/90">{children}</td>
          ),
        }}
      >
        {sanitizedContent}
      </ReactMarkdown>
    </div>
  );
}

export default ClinicalMarkdownRenderer;
