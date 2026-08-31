'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Printer,
  FileDown,
  Download,
  Loader2,
  Sparkles,
  PenTool,
  Check,
  BookOpen,
  Eye,
  FileText,
  Settings2,
} from 'lucide-react';
import type { KnowledgeMapData, KnowledgeTreeNode } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { registerNotoSansRegular } from '@/lib/pdf-fonts/NotoSansRegular';
import { registerNotoSansBold } from '@/lib/pdf-fonts/NotoSansBold';
import { registerNotoSansItalic } from '@/lib/pdf-fonts/NotoSansItalic';

interface KnowledgePdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  knowledgeMap: KnowledgeMapData;
  activeNodeId?: string | null;
}

/**
 * Escapes HTML characters safely.
 */
function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Strips leading numbering or bullet tokens from a node title to prevent double-prefixing.
 */
function cleanNodeTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  const cleaned = rawTitle
    .replace(/^(\d+(\.\d+)*[\.:\s-]+)+/i, '')
    .replace(/^[•\-\*]\s+/, '')
    .trim();
  return cleaned || rawTitle.trim();
}

/**
 * Strips markdown and formats LaTeX math markers to clean plain text for PDF generation.
 */
function stripMarkdown(md: string): string {
  if (!md) return '';
  return md
    .replace(/\\\[\s*/g, '')
    .replace(/\s*\\\]/g, '')
    .replace(/\\\(\s*/g, '')
    .replace(/\s*\\\)/g, '')
    .replace(/\\propto\b/g, '∝')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\times\b/g, '×')
    .replace(/\\div\b/g, '÷')
    .replace(/\\odot\b/g, '☉')
    .replace(/\\oplus\b/g, '⊕')
    .replace(/\\Delta\b/g, 'Δ')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\theta\b/g, 'θ')
    .replace(/\\alpha\b/g, 'α')
    .replace(/\\beta\b/g, 'β')
    .replace(/\\gamma\b/g, 'γ')
    .replace(/\\mu\b/g, 'μ')
    .replace(/\\sigma\b/g, 'σ')
    .replace(/\\omega\b/g, 'ω')
    .replace(/\\Omega\b/g, 'Ω')
    .replace(/\\lambda\b/g, 'λ')
    .replace(/\\epsilon\b/g, 'ε')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\neq?\b/g, '≠')
    .replace(/\\leq?\b/g, '≤')
    .replace(/\\geq?\b/g, '≥')
    .replace(/\\pm\b/g, '±')
    .replace(/\\infty\b/g, '∞')
    .replace(/\\partial\b/g, '∂')
    .replace(/\\nabla\b/g, '∇')
    .replace(/\\sum\b/g, '∑')
    .replace(/\\int\b/g, '∫')
    .replace(/\\in\b/g, '∈')
    .replace(/\\notin\b/g, '∉')
    .replace(/\\subset\b/g, '⊂')
    .replace(/\\subseteq\b/g, '⊆')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    .replace(/\\mathbf\{([^}]+)\}/g, '$1')
    .replace(/\\textbf\{([^}]+)\}/g, '$1')
    .replace(/\\rightarrow\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\\degree\b/g, '°')
    .replace(/\^2\b/g, '²')
    .replace(/\^3\b/g, '³')
    .replace(/_\{([^}]+)\}/g, '_$1')
    .replace(/\^\{([^}]+)\}/g, '^$1')
    .replace(/\$\$/g, '')
    .replace(/\$/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Formats inline bold, italic, code, and symbols within markdown text.
 */
function formatInline(str: string): string {
  if (!str) return '';
  return str
    .replace(/(\*\*|__)([\s\S]+?)\1/g, '<strong>$2</strong>')
    .replace(/(\*|_)([\s\S]+?)\1/g, '<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code style="background-color: #f1f5f9; padding: 1px 4px; border-radius: 4px; font-family: monospace; font-size: 8.5pt;">$1</code>');
}

/**
 * Converts markdown formatting and LaTeX math to clean semantic HTML for printing.
 */
function simpleMarkdownToHtml(md: string): string {
  if (!md) return '';

  let text = md
    .replace(/\\propto\b/g, '∝')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\times\b/g, '×')
    .replace(/\\odot\b/g, '☉')
    .replace(/\\oplus\b/g, '⊕')
    .replace(/\\Delta\b/g, 'Δ')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\theta\b/g, 'θ')
    .replace(/\\alpha\b/g, 'α')
    .replace(/\\beta\b/g, 'β')
    .replace(/\\mu\b/g, 'μ')
    .replace(/\\sigma\b/g, 'σ')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\neq?\b/g, '≠')
    .replace(/\\leq?\b/g, '≤')
    .replace(/\\geq?\b/g, '≥')
    .replace(/\\pm\b/g, '±')
    .replace(/\\infty\b/g, '∞')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    .replace(/\\mathbf\{([^}]+)\}/g, '<strong>$1</strong>')
    .replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>')
    .replace(/\\rightarrow\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\\degree\b/g, '°')
    .replace(/\^2\b/g, '²')
    .replace(/\^3\b/g, '³')
    .replace(/_\{([^}]+)\}/g, '<sub>$1</sub>')
    .replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>')
    .replace(/\$\$/g, '')
    .replace(/\$/g, '')
    .replace(/\|\s*\|\s*(?=[a-zA-Z0-9_*~`])/g, '|\n| ');

  const lines = text.split('\n');
  const htmlLines: string[] = [];
  let inList = false;
  let inTable = false;
  let tableRows: string[][] = [];

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const headerRow = tableRows[0];
    const bodyRows = tableRows.slice(1);

    let tableHtml = '<table style="width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 9pt; border: 1px solid #cbd5e1;">';
    if (headerRow && headerRow.length > 0) {
      tableHtml += '<thead><tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1;">';
      headerRow.forEach((h) => {
        tableHtml += `<th style="padding: 6px 8px; text-align: left; font-weight: 700; color: #1e293b; border: 1px solid #cbd5e1;">${formatInline(h)}</th>`;
      });
      tableHtml += '</tr></thead>';
    }
    if (bodyRows.length > 0) {
      tableHtml += '<tbody>';
      bodyRows.forEach((r, idx) => {
        const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        tableHtml += `<tr style="background-color: ${bg};">`;
        r.forEach((c) => {
          tableHtml += `<td style="padding: 5px 8px; color: #334155; border: 1px solid #cbd5e1; vertical-align: top;">${formatInline(c)}</td>`;
        });
        tableHtml += '</tr>';
      });
      tableHtml += '</tbody>';
    }
    tableHtml += '</table>';
    htmlLines.push(tableHtml);
    tableRows = [];
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      if (inTable) {
        flushTable();
      }
      continue;
    }

    // Check for Markdown table line (contains '|')
    if (trimmed.includes('|')) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      // If separator line like |---|---| or ---|---
      if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(trimmed)) {
        continue; // Skip separator line
      }
      inTable = true;
      let cleanRow = trimmed;
      if (cleanRow.startsWith('|')) cleanRow = cleanRow.slice(1);
      if (cleanRow.endsWith('|')) cleanRow = cleanRow.slice(0, -1);
      const cells = cleanRow
        .split('|')
        .map((c) => c.trim());
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    if (trimmed.startsWith('### ')) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(
        `<h4 style="margin: 8px 0 4px 0; font-size: 10pt; font-weight: 700; color: #1e293b;">${formatInline(
          trimmed.slice(4)
        )}</h4>`
      );
      continue;
    }
    if (trimmed.startsWith('## ')) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(
        `<h3 style="margin: 10px 0 4px 0; font-size: 11pt; font-weight: 700; color: #0f172a;">${formatInline(
          trimmed.slice(3)
        )}</h3>`
      );
      continue;
    }
    if (trimmed.startsWith('# ')) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(
        `<h2 style="margin: 12px 0 6px 0; font-size: 12pt; font-weight: 800; color: #0f172a;">${formatInline(
          trimmed.slice(2)
        )}</h2>`
      );
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        htmlLines.push(
          '<ul style="margin: 4px 0; padding-left: 20px; font-size: 9.5pt; color: #334155; line-height: 1.45;">'
        );
        inList = true;
      }
      htmlLines.push(`<li style="margin-bottom: 3px;">${formatInline(trimmed.slice(2))}</li>`);
      continue;
    }

    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(
        `<div style="margin: 3px 0; padding-left: 6px; font-size: 9.5pt; color: #334155;"><span style="font-weight: 700; color: #1e293b;">${
          numMatch[1]
        }.</span> ${formatInline(numMatch[2])}</div>`
      );
      continue;
    }

    if (inList) {
      htmlLines.push('</ul>');
      inList = false;
    }

    htmlLines.push(
      `<p style="margin: 4px 0; font-size: 9.5pt; color: #334155; line-height: 1.45;">${formatInline(
        trimmed
      )}</p>`
    );
  }

  if (inList) {
    htmlLines.push('</ul>');
  }
  if (inTable) {
    flushTable();
  }

  return htmlLines.join('\n');
}

/**
 * Robust callout box renderer for jsPDF that handles multi-line text, pagination, and borders without overflowing.
 */
interface PdfCardRenderParams {
  doc: jsPDF;
  title?: string;
  lines: string[];
  margin: number;
  indent: number;
  contentWidth: number;
  bottomLimit: number;
  fillColor: [number, number, number];
  borderColor: [number, number, number];
  titleColor: [number, number, number];
  textColor: [number, number, number];
  isItalic?: boolean;
  fontSize?: number;
  currentY: number;
  onPageBreak: () => number;
}

function renderPdfCard(params: PdfCardRenderParams): number {
  const {
    doc,
    title,
    lines,
    margin,
    indent,
    contentWidth,
    bottomLimit,
    fillColor,
    borderColor,
    titleColor,
    textColor,
    isItalic = false,
    fontSize = 7.8,
    onPageBreak,
  } = params;

  let y = params.currentY;
  const cardWidth = contentWidth - indent;
  const cardX = margin + indent;
  const textX = cardX + 3.5;
  const lineHeight = fontSize * 0.46; // in mm
  const headerHeight = title ? 6.5 : 3;
  const paddingBottom = 3.5;

  const totalNeededHeight = headerHeight + lines.length * lineHeight + paddingBottom;

  // Case 1: Entire card fits comfortably on current page
  if (y + totalNeededHeight <= bottomLimit) {
    doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.roundedRect(cardX, y, cardWidth, totalNeededHeight, 1.5, 1.5, 'FD');

    let textY = y + 4.5;
    if (title) {
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(fontSize + 0.4);
      doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
      doc.text(title, textX, textY);
      textY += 4.5;
    }

    doc.setFont('NotoSans', isItalic ? 'italic' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    for (const line of lines) {
      doc.text(line, textX, textY);
      textY += lineHeight;
    }

    return y + totalNeededHeight + 4.5;
  }

  // Case 2: Does not fit on current page, but fits on a fresh page
  const maxPageContentHeight = bottomLimit - (margin + 12);
  if (totalNeededHeight <= maxPageContentHeight) {
    y = onPageBreak();
    doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.roundedRect(cardX, y, cardWidth, totalNeededHeight, 1.5, 1.5, 'FD');

    let textY = y + 4.5;
    if (title) {
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(fontSize + 0.4);
      doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
      doc.text(title, textX, textY);
      textY += 4.5;
    }

    doc.setFont('NotoSans', isItalic ? 'italic' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    for (const line of lines) {
      doc.text(line, textX, textY);
      textY += lineHeight;
    }

    return y + totalNeededHeight + 4.5;
  }

  // Case 3: Large multi-page block that must be cleanly chunked across pages
  let remainingLines = [...lines];
  let isFirstChunk = true;

  while (remainingLines.length > 0) {
    // If not enough room for even a header + 2 lines, advance page
    if (bottomLimit - y < 20) {
      y = onPageBreak();
    }

    const availableSpace = bottomLimit - y - paddingBottom;
    const chunkTitle = isFirstChunk ? title : title ? `${title} (Continued)` : undefined;
    const chunkHeaderH = chunkTitle ? 6.5 : 3;
    const maxLinesThisPage = Math.max(1, Math.floor((availableSpace - chunkHeaderH) / lineHeight));
    const linesThisPage = remainingLines.slice(0, maxLinesThisPage);
    remainingLines = remainingLines.slice(maxLinesThisPage);

    const chunkHeight = chunkHeaderH + linesThisPage.length * lineHeight + paddingBottom;

    doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.roundedRect(cardX, y, cardWidth, chunkHeight, 1.5, 1.5, 'FD');

    let textY = y + 4.5;
    if (chunkTitle) {
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(fontSize + 0.4);
      doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
      doc.text(chunkTitle, textX, textY);
      textY += 4.5;
    }

    doc.setFont('NotoSans', isItalic ? 'italic' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    for (const line of linesThisPage) {
      doc.text(line, textX, textY);
      textY += lineHeight;
    }

    y += chunkHeight + 4.5;
    isFirstChunk = false;

    if (remainingLines.length > 0) {
      y = onPageBreak();
    }
  }

  return y;
}

function cleanMarkdownForPdf(text: string): string {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\$\$(.*?)\$\$/gs, '$1')
    .replace(/\$(.*?)\$/g, '$1')
    .replace(/\\\[(.*?)\\\]/gs, '$1')
    .replace(/\\\((.*?)\\\)/g, '$1')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 / $2')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\rightarrow/g, '→')
    .replace(/\\leftarrow/g, '←')
    .replace(/\\uparrow/g, '↑')
    .replace(/\\downarrow/g, '↓')
    .replace(/\\pm/g, '±')
    .replace(/\\le(q)?/g, '≤')
    .replace(/\\ge(q)?/g, '≥')
    .replace(/\\approx/g, '≈')
    .replace(/\\times/g, '×')
    .replace(/\\degree/g, '°')
    .replace(/\\circ/g, '°')
    .replace(/\\([a-zA-Z]+)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface MarkdownBlock {
  type: 'paragraph' | 'bullet_list' | 'numbered_list' | 'table';
  text?: string;
  items?: string[];
  headers?: string[];
  rows?: string[][];
}

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  if (!markdown) return [];
  const lines = markdown.split('\n');
  const blocks: MarkdownBlock[] = [];
  let currentParagraph: string[] = [];
  let currentBullets: string[] = [];
  let currentNumbered: string[] = [];
  let tableLines: string[] = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      const text = currentParagraph.join(' ').trim();
      if (text) blocks.push({ type: 'paragraph', text });
      currentParagraph = [];
    }
  };

  const flushBullets = () => {
    if (currentBullets.length > 0) {
      blocks.push({ type: 'bullet_list', items: [...currentBullets] });
      currentBullets = [];
    }
  };

  const flushNumbered = () => {
    if (currentNumbered.length > 0) {
      blocks.push({ type: 'numbered_list', items: [...currentNumbered] });
      currentNumbered = [];
    }
  };

  const flushTable = () => {
    if (tableLines.length >= 2) {
      const parseRow = (line: string) =>
        line
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());

      const headers = parseRow(tableLines[0]);
      const dataRows = tableLines.slice(1).filter((l) => !/^\|?[\s-:]+\|?$/.test(l.trim()));
      const rows = dataRows.map(parseRow);
      if (headers.length > 0) {
        blocks.push({ type: 'table', headers, rows });
      }
      tableLines = [];
    } else {
      tableLines = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('|')) {
      flushParagraph();
      flushBullets();
      flushNumbered();
      tableLines.push(line);
      continue;
    } else if (tableLines.length > 0) {
      flushTable();
    }

    if (/^[-*•]\s+/.test(line)) {
      flushParagraph();
      flushNumbered();
      currentBullets.push(line.replace(/^[-*•]\s+/, ''));
      continue;
    } else if (/^\d+[\.\)]\s+/.test(line)) {
      flushParagraph();
      flushBullets();
      currentNumbered.push(line.replace(/^\d+[\.\)]\s+/, ''));
      continue;
    }

    if (!line) {
      flushParagraph();
      flushBullets();
      flushNumbered();
      continue;
    }

    if (currentBullets.length > 0) {
      flushBullets();
    }
    if (currentNumbered.length > 0) {
      flushNumbered();
    }

    currentParagraph.push(line);
  }

  flushParagraph();
  flushBullets();
  flushNumbered();
  flushTable();

  return blocks;
}

interface PdfRichCardRenderParams {
  doc: jsPDF;
  title?: string;
  markdown: string;
  margin: number;
  indent: number;
  contentWidth: number;
  bottomLimit: number;
  fillColor: [number, number, number];
  borderColor: [number, number, number];
  titleColor: [number, number, number];
  textColor: [number, number, number];
  isItalic?: boolean;
  fontSize?: number;
  currentY: number;
  onPageBreak: () => number;
}

function renderPdfRichCard(params: PdfRichCardRenderParams): number {
  const {
    doc,
    title,
    markdown,
    margin,
    indent,
    contentWidth,
    bottomLimit,
    fillColor,
    borderColor,
    titleColor,
    textColor,
    isItalic = false,
    fontSize = 7.8,
    onPageBreak,
  } = params;

  let y = params.currentY;
  const cardWidth = contentWidth - indent;
  const cardX = margin + indent;
  const textX = cardX + 3.5;
  const innerWidth = cardWidth - 7;
  const lineHeight = fontSize * 0.46;

  const blocks = parseMarkdownBlocks(markdown);
  if (blocks.length === 0) return y;

  if (y + 18 > bottomLimit) {
    y = onPageBreak();
  }

  // Draw Header / Title Box if provided
  if (title) {
    doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.roundedRect(cardX, y, cardWidth, 6.5, 1, 1, 'FD');

    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(fontSize + 0.4);
    doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
    doc.text(title, textX, y + 4.5);
    y += 8.5;
  }

  for (const block of blocks) {
    if (block.type === 'paragraph' && block.text) {
      doc.setFont('NotoSans', isItalic ? 'italic' : 'normal');
      doc.setFontSize(fontSize);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);

      const cleanP = cleanMarkdownForPdf(block.text);
      const pLines = doc.splitTextToSize(cleanP, innerWidth);
      const pHeight = pLines.length * lineHeight;

      if (y + pHeight > bottomLimit) {
        y = onPageBreak();
      }

      doc.text(pLines, textX, y + lineHeight * 0.8);
      y += pHeight + 2.5;
    } else if (block.type === 'bullet_list' && block.items) {
      for (const itemText of block.items) {
        doc.setFont('NotoSans', 'normal');
        doc.setFontSize(fontSize);
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);

        const cleanItem = cleanMarkdownForPdf(itemText);
        const itemLines = doc.splitTextToSize(cleanItem, innerWidth - 5);
        const itHeight = itemLines.length * lineHeight;

        if (y + itHeight > bottomLimit) {
          y = onPageBreak();
        }

        doc.setFont('NotoSans', 'bold');
        doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
        doc.text('•', textX, y + lineHeight * 0.8);

        doc.setFont('NotoSans', isItalic ? 'italic' : 'normal');
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.text(itemLines, textX + 4, y + lineHeight * 0.8);
        y += itHeight + 1.8;
      }
      y += 1.5;
    } else if (block.type === 'numbered_list' && block.items) {
      block.items.forEach((itemText, idx) => {
        doc.setFont('NotoSans', 'normal');
        doc.setFontSize(fontSize);
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);

        const cleanItem = cleanMarkdownForPdf(itemText);
        const itemLines = doc.splitTextToSize(cleanItem, innerWidth - 6);
        const itHeight = itemLines.length * lineHeight;

        if (y + itHeight > bottomLimit) {
          y = onPageBreak();
        }

        doc.setFont('NotoSans', 'bold');
        doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
        doc.text(`${idx + 1}.`, textX, y + lineHeight * 0.8);

        doc.setFont('NotoSans', isItalic ? 'italic' : 'normal');
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.text(itemLines, textX + 5, y + lineHeight * 0.8);
        y += itHeight + 1.8;
      });
      y += 1.5;
    } else if (block.type === 'table' && block.headers && block.rows) {
      if (y + 25 > bottomLimit) {
        y = onPageBreak();
      }

      const cleanHeaders = block.headers.map((h) => cleanMarkdownForPdf(h));
      const cleanRows = block.rows.map((r) => r.map((c) => cleanMarkdownForPdf(c)));

      (doc as any).autoTable({
        startY: y,
        head: [cleanHeaders],
        body: cleanRows,
        margin: { left: cardX, right: margin },
        theme: 'grid',
        styles: {
          font: 'NotoSans',
          fontSize: 7.2,
          cellPadding: 2,
          overflow: 'linebreak',
          textColor: [30, 41, 59],
        },
        headStyles: {
          fillColor: titleColor,
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 7.5,
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
      });

      y = (doc as any).lastAutoTable?.finalY
        ? (doc as any).lastAutoTable.finalY + 4
        : y + 15;
    }
  }

  return y + 2;
}

export function KnowledgePdfExportModal({
  isOpen,
  onClose,
  knowledgeMap,
  activeNodeId,
}: KnowledgePdfExportModalProps) {
  const { toast } = useToast();

  // Export Configurations
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeExplanations, setIncludeExplanations] = useState(true);
  const [includeFirstPrinciples, setIncludeFirstPrinciples] = useState(true);
  const [includeUserNotes, setIncludeUserNotes] = useState(true);
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [activeTab, setActiveTab] = useState<'settings' | 'preview'>('settings');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Handwritten Notes Ruling Settings
  const [noteLineCount, setNoteLineCount] = useState<number>(4);
  const [rulingStyle, setRulingStyle] = useState<'ruled' | 'dotted' | 'box' | 'none'>('ruled');

  const activeNode = useMemo(() => {
    return activeNodeId ? findNodeById(knowledgeMap.tree, activeNodeId) : null;
  }, [knowledgeMap.tree, activeNodeId]);

  const targetTree = useMemo(() => {
    return scope === 'selected' && activeNode ? [activeNode] : knowledgeMap.tree;
  }, [scope, activeNode, knowledgeMap.tree]);

  const totalExportNodes = countNodes(targetTree);

  /**
   * Generates a direct PDF document using jsPDF with proper page breaks and typography.
   */
  const handleDownloadDirectPdf = async () => {
    if (!targetTree || targetTree.length === 0) {
      toast({
        title: 'Empty Knowledge Map',
        description: 'No topics found to export.',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      registerNotoSansRegular(doc);
      registerNotoSansBold(doc);
      registerNotoSansItalic(doc);
      doc.setFont('NotoSans', 'normal');

      const margin = 14;
      let currentY = margin;
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const contentWidth = pageWidth - 2 * margin;
      const bottomLimit = pageHeight - margin - 8;

      let pageCount = 1;

      const checkPageBreak = (neededHeight: number) => {
        if (currentY + neededHeight > bottomLimit) {
          doc.addPage();
          pageCount += 1;
          currentY = margin + 4;
          // Mini running header
          doc.setFont('NotoSans', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `${knowledgeMap.title || 'Knowledge Study Guide'} • MediGen AI`,
            margin,
            currentY - 2
          );
          doc.setDrawColor(226, 232, 240);
          doc.line(margin, currentY, pageWidth - margin, currentY);
          currentY += 5;
        }
      };

      // 1. Header Banner
      doc.setFillColor(30, 58, 138); // Navy Blue
      doc.rect(margin, currentY, contentWidth, 18, 'F');

      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text('MEDIGEN KNOWLEDGE MAP & STUDY GUIDE', margin + 4, currentY + 6.5);

      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(200, 220, 255);
      const subheader = `${knowledgeMap.title || 'Study Outline'} | ${totalExportNodes} Analyzed Topics | Generated: ${new Date().toLocaleDateString()}`;
      doc.text(doc.splitTextToSize(subheader, contentWidth - 8)[0], margin + 4, currentY + 13);

      currentY += 23;

      // 2. High-Yield Document Summary
      if (includeSummary && knowledgeMap.documentSummary) {
        currentY = renderPdfRichCard({
          doc,
          title: 'HIGH-YIELD SYNTHESIS & CLINICAL THEMES',
          markdown: knowledgeMap.documentSummary,
          margin,
          indent: 0,
          contentWidth,
          bottomLimit,
          fillColor: [248, 250, 252],
          borderColor: [203, 213, 225],
          titleColor: [30, 41, 59],
          textColor: [51, 65, 85],
          fontSize: 8.2,
          currentY,
          onPageBreak: () => {
            checkPageBreak(999);
            return currentY;
          },
        });
      }

      // 3. Syllabus Topic Index
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      checkPageBreak(14);
      doc.text(`SYLLABUS TOPIC INDEX (${totalExportNodes} Concepts)`, margin, currentY);
      currentY += 4;
      doc.setDrawColor(203, 213, 225);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      currentY += 4.5;

      targetTree.forEach((root, idx) => {
        checkPageBreak(8);
        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 58, 138);
        doc.text(`${idx + 1}. ${cleanNodeTitle(root.title)}`, margin + 2, currentY);
        currentY += 4.5;

        if (root.children && root.children.length > 0) {
          root.children.forEach((sub, sIdx) => {
            checkPageBreak(6);
            doc.setFont('NotoSans', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.text(`${idx + 1}.${sIdx + 1} ${cleanNodeTitle(sub.title)}`, margin + 6, currentY);
            currentY += 4;
          });
        }
      });

      currentY += 6;

      // 4. Detailed Hierarchical Breakdown
      checkPageBreak(14);
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('DETAILED TOPIC DECONSTRUCTIONS & EXPLANATIONS', margin, currentY);
      currentY += 4;
      doc.setDrawColor(15, 23, 42);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      currentY += 6;

      const renderPdfNode = (node: KnowledgeTreeNode, numStr: string, indent: number = 0) => {
        const isRoot = node.depth === 0;
        const isSub = node.depth === 1;
        const cleanTitle = cleanNodeTitle(node.title);

        const titlePrefix = isRoot ? `${numStr}.` : numStr;
        let titleStr = `${titlePrefix} ${cleanTitle}`;
        if (node.pyqTag) {
          titleStr += `  [${node.pyqTag}]`;
        }

        // Title Spacing and Page Break
        if (isRoot) {
          checkPageBreak(22);
          currentY += 3;
          doc.setFont('NotoSans', 'bold');
          doc.setFontSize(10.5);
          doc.setTextColor(30, 58, 138);
        } else if (isSub) {
          checkPageBreak(18);
          currentY += 2.5;
          doc.setFont('NotoSans', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(2, 132, 199);
        } else {
          checkPageBreak(14);
          currentY += 2;
          doc.setFont('NotoSans', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(71, 85, 105);
        }

        const titleLines = doc.splitTextToSize(titleStr, contentWidth - indent - 4);
        doc.text(titleLines, margin + indent, currentY);
        currentY += titleLines.length * (isRoot ? 5.0 : isSub ? 4.4 : 4.0) + 1.5;

        // Node Description
        if (node.description) {
          doc.setFont('NotoSans', 'italic');
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          const descLines = doc.splitTextToSize(node.description, contentWidth - indent - 4);
          checkPageBreak(descLines.length * 3.8 + 3);
          doc.text(descLines, margin + indent + 2, currentY);
          currentY += descLines.length * 3.8 + 3.0;
        }

        // First Principle Anchor Callout
        if (node.firstPrincipleAnchor) {
          const anchorRaw = `First-Principle Anchor: ${stripMarkdown(node.firstPrincipleAnchor)}`;
          doc.setFont('NotoSans', 'normal');
          doc.setFontSize(8);
          const anchorLines = doc.splitTextToSize(anchorRaw, contentWidth - indent - 8);

          currentY = renderPdfCard({
            doc,
            lines: anchorLines,
            margin,
            indent,
            contentWidth,
            bottomLimit,
            fillColor: [255, 251, 235], // Light Amber
            borderColor: [253, 230, 138],
            titleColor: [146, 64, 14],
            textColor: [146, 64, 14],
            fontSize: 8,
            currentY,
            onPageBreak: () => {
              checkPageBreak(999);
              return currentY;
            },
          });
        }

        // Standard Explanation (Clinical Pathway)
        if (includeExplanations && node.explanation?.standard) {
          currentY = renderPdfRichCard({
            doc,
            title: 'Clinical Pathway & Explanation:',
            markdown: node.explanation.standard,
            margin,
            indent,
            contentWidth,
            bottomLimit,
            fillColor: [248, 250, 252],
            borderColor: [226, 232, 240],
            titleColor: [30, 41, 59],
            textColor: [51, 65, 85],
            fontSize: 7.8,
            currentY,
            onPageBreak: () => {
              checkPageBreak(999);
              return currentY;
            },
          });
        }

        // First-Principles Explanation
        if (includeFirstPrinciples && node.explanation?.firstPrinciples) {
          currentY = renderPdfRichCard({
            doc,
            title: 'First-Principles Derivation:',
            markdown: node.explanation.firstPrinciples,
            margin,
            indent,
            contentWidth,
            bottomLimit,
            fillColor: [255, 253, 245],
            borderColor: [254, 215, 170],
            titleColor: [154, 52, 18],
            textColor: [124, 45, 18],
            fontSize: 7.8,
            currentY,
            onPageBreak: () => {
              checkPageBreak(999);
              return currentY;
            },
          });
        }

        // User Personal Notes
        if (includeUserNotes && node.explanation?.userNotes) {
          const unRaw = stripMarkdown(node.explanation.userNotes);
          doc.setFont('NotoSans', 'normal');
          doc.setFontSize(7.8);
          const unLines = doc.splitTextToSize(unRaw, contentWidth - indent - 8);

          currentY = renderPdfCard({
            doc,
            title: 'Personal Study Notes:',
            lines: unLines,
            margin,
            indent,
            contentWidth,
            bottomLimit,
            fillColor: [250, 245, 255],
            borderColor: [233, 213, 255],
            titleColor: [107, 33, 168],
            textColor: [88, 28, 135],
            isItalic: true,
            fontSize: 7.8,
            currentY,
            onPageBreak: () => {
              checkPageBreak(999);
              return currentY;
            },
          });
        }

        // Handwritten Annotation Space (Ruled Lines) - only on subtopics
        if (noteLineCount > 0 && isSub) {
          const rulingHeight = noteLineCount * 5.2;
          const totalBoxHeight = rulingHeight + 10;
          checkPageBreak(totalBoxHeight + 6);

          currentY += 2;
          doc.setFont('NotoSans', 'bold');
          doc.setFontSize(7.2);
          doc.setTextColor(148, 163, 184);
          doc.text('ANNOTATIONS & LECTURE NOTES', margin + indent + 2, currentY + 3);
          currentY += 5.5; // Distinct spacing before box starts

          doc.setDrawColor(203, 213, 225);
          if (rulingStyle === 'ruled') {
            for (let l = 0; l < noteLineCount; l++) {
              doc.setLineDashPattern([1.5, 1.5], 0);
              doc.line(margin + indent, currentY, pageWidth - margin, currentY);
              currentY += 5.2;
            }
            doc.setLineDashPattern([], 0); // reset
          } else if (rulingStyle === 'box' || rulingStyle === 'dotted') {
            doc.setDrawColor(203, 213, 225);
            doc.setFillColor(252, 252, 253);
            doc.roundedRect(margin + indent, currentY, contentWidth - indent, rulingHeight, 1.5, 1.5, 'FD');
            currentY += rulingHeight;
          }
          currentY += 4.5; // Clear spacing after box
        }

        // Render Children Recursively
        if (node.children && node.children.length > 0) {
          node.children.forEach((child, cIdx) => {
            renderPdfNode(child, `${numStr}.${cIdx + 1}`, Math.min(indent + 6, 18));
          });
        }

        currentY += 3;
      };

      targetTree.forEach((root, rIdx) => {
        renderPdfNode(root, `${rIdx + 1}`, 0);
      });

      // 5. Add Page Numbers
      const totalPages = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('NotoSans', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Page ${i} of ${totalPages}  •  MediGen First-Principles Clinical AI  •  Confidential`,
          pageWidth / 2,
          pageHeight - 6,
          { align: 'center' }
        );
      }

      const cleanTitle = (knowledgeMap.title || 'knowledge_map')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_');
      doc.save(`${cleanTitle}_study_guide.pdf`);

      toast({
        title: 'PDF Downloaded',
        description: `Successfully exported ${totalExportNodes} topics into your study guide.`,
      });
    } catch (err) {
      console.error('PDF generation error:', err);
      toast({
        title: 'Export Failed',
        description: 'Failed to generate PDF document. Please try printing via browser.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  /**
   * Generates the self-contained, standalone printable HTML document.
   */
  const printableHtml = useMemo(() => {
    const renderNodeHtml = (node: KnowledgeTreeNode, numStr: string): string => {
      const hasExplanation = Boolean(node.explanation?.standard);
      const hasFirstPrinciples = Boolean(node.explanation?.firstPrinciples);
      const hasUserNotes = Boolean(node.explanation?.userNotes);

      const isRoot = node.depth === 0;
      const isLevel1 = node.depth === 1;
      const cleanTitle = cleanNodeTitle(node.title);
      const prefix = isRoot ? `${numStr}.` : numStr;

      let rulingHtml = '';
      if (noteLineCount > 0 && isLevel1) {
        if (rulingStyle === 'ruled') {
          const lines = Array.from({ length: noteLineCount })
            .map(() => '<div style="height: 20px; border-bottom: 1px dashed #cbd5e1;"></div>')
            .join('');
          rulingHtml = `
            <div style="margin-top: 8px; margin-bottom: 4px; page-break-inside: avoid; break-inside: avoid;">
              <div style="font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 4px;">✍️ Student Notes &amp; Formula Space</div>
              ${lines}
            </div>
          `;
        } else if (rulingStyle === 'dotted') {
          rulingHtml = `
            <div style="margin-top: 8px; margin-bottom: 4px; page-break-inside: avoid; break-inside: avoid;">
              <div style="font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 4px;">✍️ Scratchpad &amp; Grid</div>
              <div style="height: ${Math.max(noteLineCount * 16, 40)}px; border: 1px solid #cbd5e1; border-radius: 4px; background-image: radial-gradient(circle, #94a3b8 1px, transparent 1px); background-size: 12px 12px;"></div>
            </div>
          `;
        } else if (rulingStyle === 'box') {
          rulingHtml = `
            <div style="margin-top: 8px; margin-bottom: 4px; page-break-inside: avoid; break-inside: avoid;">
              <div style="font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 4px;">✍️ Sketched Diagram Frame</div>
              <div style="height: ${Math.max(noteLineCount * 16, 40)}px; border: 1px dashed #94a3b8; border-radius: 4px; background: #fafafa;"></div>
            </div>
          `;
        }
      }

      let childrenHtml = '';
      if (node.children && node.children.length > 0) {
        childrenHtml = node.children
          .map((child, idx) => renderNodeHtml(child, `${numStr}.${idx + 1}`))
          .join('\n');
      }

      const tagHtml = node.pyqTag
        ? `<span style="display: inline-block; font-size: 7.5pt; font-weight: 700; font-family: monospace; border: 1px solid #475569; color: #1e293b; padding: 1px 5px; border-radius: 3px; margin-left: 6px;">[${escapeHtml(
            node.pyqTag
          )}]</span>`
        : '';

      const borderLeftColor = isRoot ? '#2563eb' : isLevel1 ? '#0284c7' : '#94a3b8';
      const headingFontSize = isRoot ? '12pt' : isLevel1 ? '10.5pt' : '9.5pt';
      const headingFontWeight = isRoot ? '800' : isLevel1 ? '700' : '600';

      return `
        <div style="border-left: 3px solid ${borderLeftColor}; padding-left: 12px; margin-bottom: 14px; margin-top: ${
        isRoot ? '18px' : '8px'
      };">
          <div style="page-break-inside: avoid; break-inside: avoid;">
            <div style="font-size: ${headingFontSize}; font-weight: ${headingFontWeight}; color: #0f172a; line-height: 1.3;">
              <span style="font-family: monospace; color: #64748b; margin-right: 4px;">${prefix}</span>
              <span>${escapeHtml(cleanTitle)}</span>
              ${tagHtml}
            </div>

            ${
              node.description
                ? `<p style="font-size: 9pt; color: #475569; font-style: italic; margin: 4px 0 6px 0; line-height: 1.35;">${escapeHtml(
                    node.description
                  )}</p>`
                : ''
            }

            ${
              node.firstPrincipleAnchor
                ? `
              <div style="background: #fffbeb; border: 1px solid #fef3c7; border-left: 3px solid #d97706; border-radius: 4px; padding: 6px 10px; margin: 6px 0; font-size: 8.5pt; color: #78350f;">
                <strong style="color: #92400e;">⚡ First-Principle Anchor:</strong> ${escapeHtml(
                  stripMarkdown(node.firstPrincipleAnchor)
                )}
              </div>
            `
                : ''
            }

            ${
              includeExplanations && hasExplanation
                ? `
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px 10px; margin: 6px 0;">
                <div style="font-size: 7.5pt; font-weight: 700; text-transform: uppercase; color: #475569; margin-bottom: 4px;">📖 Standard Explanation &amp; Clinical Pathway:</div>
                ${simpleMarkdownToHtml(node.explanation!.standard!)}
              </div>
            `
                : ''
            }

            ${
              includeFirstPrinciples && hasFirstPrinciples
                ? `
              <div style="background: #fffdf5; border: 1px solid #fed7aa; border-left: 3px solid #f97316; border-radius: 4px; padding: 8px 10px; margin: 6px 0;">
                <div style="font-size: 7.5pt; font-weight: 700; text-transform: uppercase; color: #9a3412; margin-bottom: 4px;">🔬 First-Principles Derivation:</div>
                ${simpleMarkdownToHtml(node.explanation!.firstPrinciples!)}
              </div>
            `
                : ''
            }

            ${
              includeUserNotes && hasUserNotes
                ? `
              <div style="background: #faf5ff; border: 1px solid #e9d5ff; border-left: 3px solid #9333ea; border-radius: 4px; padding: 6px 10px; margin: 6px 0;">
                <div style="font-size: 7.5pt; font-weight: 700; text-transform: uppercase; color: #6b21a8; margin-bottom: 3px;">📝 Digital Notes:</div>
                <div style="font-size: 8.5pt; color: #581c87; font-family: Georgia, serif;">${escapeHtml(
                  node.explanation!.userNotes!
                )}</div>
              </div>
            `
                : ''
            }

            ${rulingHtml}
          </div>

          ${
            childrenHtml
              ? `<div style="padding-left: 6px; margin-top: 6px;">${childrenHtml}</div>`
              : ''
          }
        </div>
      `;
    };

    const treeContentHtml = targetTree
      .map((node, index) => renderNodeHtml(node, `${index + 1}`))
      .join('\n');

    const syllabusHtml = targetTree
      .map((root, i) => {
        let subItems = '';
        if (root.children && root.children.length > 0) {
          subItems = root.children
            .map((sub, j) => {
              let leafItems = '';
              if (sub.children && sub.children.length > 0) {
                leafItems = sub.children
                  .map(
                    (leaf, k) =>
                      `<div style="padding-left: 16px; font-size: 8.5pt; color: #64748b;">${i + 1}.${
                        j + 1
                      }.${k + 1} ${escapeHtml(cleanNodeTitle(leaf.title))}</div>`
                  )
                  .join('');
              }
              return `
                <div style="padding-left: 14px; font-size: 9pt; color: #334155; margin-top: 2px;">
                  <span style="font-weight: 600;">${i + 1}.${j + 1}</span> ${escapeHtml(cleanNodeTitle(sub.title))}
                  ${leafItems}
                </div>
              `;
            })
            .join('');
        }
        return `
          <div style="margin-bottom: 6px;">
            <div style="font-weight: 700; font-size: 9.5pt; color: #0f172a;">${i + 1}. ${escapeHtml(
          cleanNodeTitle(root.title)
        )}</div>
            ${subItems}
          </div>
        `;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(knowledgeMap.title || 'Knowledge Map Study Guide')}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 14mm 12mm 14mm 12mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.45;
      color: #0f172a !important;
      background: #ffffff !important;
      margin: 0;
      padding: 0;
    }
    h1, h2, h3, h4, h5, h6, p, div, span, li {
      color: #0f172a;
    }
    .print-header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .badge {
      display: inline-block;
      font-size: 8pt;
      font-family: monospace;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 6px;
      border: 1px solid #0f172a;
    }
  </style>
</head>
<body>
  <!-- Document Header -->
  <div class="print-header">
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <div style="font-size: 8pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">
          MediGen First-Principles Mind Map &amp; Study Workbook
        </div>
        <h1 style="font-size: 18pt; font-weight: 900; margin: 4px 0 2px 0; color: #0f172a; letter-spacing: -0.02em;">
          ${escapeHtml(knowledgeMap.title || 'Knowledge Hierarchy Map')}
        </h1>
        <div style="font-size: 8.5pt; color: #64748b;">
          Generated: ${new Date(
            knowledgeMap.createdAt
          ).toLocaleDateString()} • ${totalExportNodes} Analyzed Topics • Clinical Synthesis
        </div>
      </div>
      <div style="text-align: right;">
        <span class="badge">Study Guide</span>
      </div>
    </div>
  </div>

  <!-- Document Summary -->
  ${
    includeSummary && knowledgeMap.documentSummary
      ? `
    <div style="page-break-inside: avoid; break-inside: avoid; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px;">
      <div style="font-size: 9pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px;">
        📖 High-Yield Synthesis &amp; Clinical Core Themes
      </div>
      <div style="font-size: 9pt; color: #334155; line-height: 1.45;">
        ${simpleMarkdownToHtml(knowledgeMap.documentSummary)}
      </div>
    </div>
  `
      : ''
  }

  <!-- Syllabus Index Table of Contents -->
  <div style="page-break-inside: avoid; break-inside: avoid; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 18px; background: #ffffff;">
    <div style="font-size: 9pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px;">
      📑 Syllabus Topic Index (${totalExportNodes} Concepts)
    </div>
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px;">
      ${syllabusHtml}
    </div>
  </div>

  <!-- Detailed Topic Breakdown -->
  <div style="margin-top: 16px;">
    <div style="font-size: 11pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 4px; margin-bottom: 12px;">
      🔬 Topic Deconstructions &amp; Deep Explanations
    </div>
    ${treeContentHtml}
  </div>

  <!-- Document Footer -->
  <div style="margin-top: 24px; padding-top: 8px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 8pt; color: #94a3b8;">
    MediGen Clinical AI • First-Principles Reasoning Engine • Confidential Study Material
  </div>
</body>
</html>`;
  }, [
    knowledgeMap,
    targetTree,
    totalExportNodes,
    includeSummary,
    includeExplanations,
    includeFirstPrinciples,
    includeUserNotes,
    noteLineCount,
    rulingStyle,
  ]);

  /**
   * Browser Print execution.
   */
  const handlePrint = () => {
    window.print();
  };

  /**
   * Download standalone clean HTML file for offline opening and printing.
   */
  const handleDownloadHtml = () => {
    const blob = new Blob([printableHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanTitle = (knowledgeMap.title || 'knowledge_map')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_');
    a.download = `${cleanTitle}_workbook.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden border border-border shadow-2xl">
        <DialogHeader className="p-4 sm:p-5 pb-3 border-b bg-card/70 print:hidden">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono border-amber-500/40 text-amber-600 bg-amber-500/10"
                >
                  <Printer className="h-3 w-3 mr-1" /> Printable Study Sheet
                </Badge>
                <span className="text-xs font-handwriting text-primary">
                  ✍️ Hand-written note ready
                </span>
              </div>
              <DialogTitle className="text-lg sm:text-xl font-bold text-foreground">
                Export Knowledge Map &amp; Study Notes
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Generate high-resolution printable worksheets or download directly as a formatted PDF.
              </DialogDescription>
            </div>

            {/* View Mode Toggle */}
            <div className="hidden sm:flex items-center gap-1 border border-border rounded-lg p-0.5 bg-muted/30">
              <Button
                type="button"
                size="sm"
                variant={activeTab === 'settings' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('settings')}
                className="h-7 text-xs gap-1 px-2.5"
              >
                <Settings2 className="h-3 w-3" />
                <span>Options</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeTab === 'preview' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('preview')}
                className="h-7 text-xs gap-1 px-2.5"
              >
                <Eye className="h-3 w-3" />
                <span>Live Preview</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 print:hidden">
          {activeTab === 'settings' ? (
            <>
              {/* Export Scope Selector */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  1. Export Scope
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setScope('all')}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      scope === 'all'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border bg-card hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-foreground">Entire Knowledge Tree</span>
                      {scope === 'all' && <Check className="h-4 w-4 text-primary" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      All {countNodes(knowledgeMap.tree)} topics &amp; subtopics across all branches.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScope('selected')}
                    disabled={!activeNode}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      !activeNode
                        ? 'opacity-40 cursor-not-allowed border-border'
                        : scope === 'selected'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border bg-card hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-foreground">
                        {activeNode ? 'Active Branch Only' : 'Select a topic first'}
                      </span>
                      {scope === 'selected' && <Check className="h-4 w-4 text-primary" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {activeNode
                        ? `"${activeNode.title}" + children`
                        : 'Click a node in the tree to select'}
                    </p>
                  </button>
                </div>
              </div>

              {/* Content Inclusions */}
              <div className="space-y-3 pt-3 border-t">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  2. Content Inclusions
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-card/60">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <BookOpen className="h-3.5 w-3.5 text-primary" /> Document Summary
                      </span>
                      <p className="text-[10px] text-muted-foreground">
                        Include top synthesis &amp; domain overview
                      </p>
                    </div>
                    <Switch checked={includeSummary} onCheckedChange={setIncludeSummary} />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-card/60">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-emerald-600" /> Standard Explanations
                      </span>
                      <p className="text-[10px] text-muted-foreground">
                        Include detailed mechanisms &amp; pathways
                      </p>
                    </div>
                    <Switch checked={includeExplanations} onCheckedChange={setIncludeExplanations} />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-card/60">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-amber-600" /> First-Principles Derivations
                      </span>
                      <p className="text-[10px] text-muted-foreground">
                        Include ground-truth mechanism breakdowns
                      </p>
                    </div>
                    <Switch
                      checked={includeFirstPrinciples}
                      onCheckedChange={setIncludeFirstPrinciples}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-card/60">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <PenTool className="h-3.5 w-3.5 text-purple-600" /> Personal Handwritten Notes
                      </span>
                      <p className="text-[10px] text-muted-foreground">
                        Include notes you typed into the app
                      </p>
                    </div>
                    <Switch checked={includeUserNotes} onCheckedChange={setIncludeUserNotes} />
                  </div>
                </div>
              </div>

              {/* Configurable Handwritten Note Ruling */}
              <div className="space-y-4 pt-3 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    3. Physical Note Space (For Paper Worksheets)
                  </Label>
                  <span className="text-xs font-mono font-bold text-primary">
                    {noteLineCount === 0 ? 'Compact (0 lines)' : `${noteLineCount} lines per subtopic`}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  Add empty ruled handwriting lines under each subtopic so you can write custom annotations, formulas, or lecture notes by hand after printing.
                </p>

                {/* Slider */}
                <div className="space-y-2 px-1">
                  <Slider
                    value={[noteLineCount]}
                    min={0}
                    max={8}
                    step={1}
                    onValueChange={(val) => setNoteLineCount(val[0])}
                    className="py-2"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                    <span>0 (Compact)</span>
                    <span>2 lines</span>
                    <span>4 lines (Standard)</span>
                    <span>6 lines</span>
                    <span>8 lines</span>
                  </div>
                </div>

                {/* Ruling Style Tabs */}
                {noteLineCount > 0 && (
                  <div className="space-y-2 pt-1">
                    <span className="text-[11px] font-semibold text-foreground">Ruling Style:</span>
                    <Tabs value={rulingStyle} onValueChange={(v) => setRulingStyle(v as any)}>
                      <TabsList className="grid grid-cols-3 h-8">
                        <TabsTrigger value="ruled" className="text-xs">
                          Ruled Lines
                        </TabsTrigger>
                        <TabsTrigger value="dotted" className="text-xs">
                          Dotted Grid
                        </TabsTrigger>
                        <TabsTrigger value="box" className="text-xs">
                          Framed Box
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                )}
              </div>

              {/* Preview Box of Ruled Area */}
              {noteLineCount > 0 && (
                <div className="rounded-xl border border-dashed border-border p-3 bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="font-semibold">Sample Ruled Note Area Preview:</span>
                    <span className="font-handwriting text-primary text-xs">
                      ✍️ Student Handwriting Area
                    </span>
                  </div>
                  <div className="bg-card p-3 rounded-lg border border-border">
                    {rulingStyle === 'ruled' && (
                      <div className="space-y-3 py-1">
                        {Array.from({ length: Math.min(noteLineCount, 4) }).map((_, i) => (
                          <div key={i} className="h-0 border-b border-border/80 border-dashed" />
                        ))}
                      </div>
                    )}
                    {rulingStyle === 'dotted' && (
                      <div
                        className="h-16 rounded-md border border-border/50"
                        style={{
                          backgroundImage:
                            'radial-gradient(circle, currentColor 1px, transparent 1px)',
                          backgroundSize: '12px 12px',
                          color: 'var(--border)',
                        }}
                      />
                    )}
                    {rulingStyle === 'box' && (
                      <div className="h-16 rounded-md border border-dashed border-border flex items-center justify-center text-[10px] text-muted-foreground font-handwriting">
                        Blank sketched diagram &amp; clinical formula frame
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Live HTML Preview Tab */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Document Sheet Layout Preview:</span>
                <span className="text-[11px] text-muted-foreground">{totalExportNodes} Topics in queue</span>
              </div>
              <div className="rounded-xl border border-border bg-white text-slate-900 p-4 sm:p-6 shadow-inner max-h-[500px] overflow-y-auto">
                <iframe
                  title="Print Preview Frame"
                  srcDoc={printableHtml}
                  className="w-full min-h-[460px] border-0 rounded bg-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* Dedicated Print DOM Container for High-Fidelity Browser Print */}
        <div
          id="printable-knowledge-map"
          className="hidden print:block p-8 bg-white text-slate-900"
          dangerouslySetInnerHTML={{ __html: printableHtml.replace(/^<!DOCTYPE[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '') }}
        />

        {/* Footer Actions */}
        <DialogFooter className="p-4 sm:p-5 pt-3 border-t bg-card/80 flex items-center justify-between gap-3 print:hidden">
          <div className="text-xs text-muted-foreground hidden sm:block">
            Ready to export <span className="font-bold text-foreground">{totalExportNodes} topics</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
              Close
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadHtml}
              className="text-xs gap-1.5"
              title="Download standalone HTML file for offline viewing"
            >
              <FileDown className="h-3.5 w-3.5" />
              <span>HTML File</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="text-xs gap-1.5"
            >
              <Printer className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Print</span>
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadDirectPdf}
              disabled={isGeneratingPdf}
              className="text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs"
            >
              {isGeneratingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>{isGeneratingPdf ? 'Generating PDF...' : 'Download PDF (.pdf)'}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Helpers
function findNodeById(tree: KnowledgeTreeNode[], id: string): KnowledgeTreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function countNodes(tree: KnowledgeTreeNode[]): number {
  let count = 0;
  for (const node of tree) {
    count += 1;
    if (node.children) {
      count += countNodes(node.children);
    }
  }
  return count;
}

