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
  Layers,
  Sparkles,
  PenTool,
  Check,
  BookOpen,
  Eye,
  FileText,
  Settings2,
} from 'lucide-react';
import type { KnowledgeMapData, KnowledgeTreeNode } from '@/types';
import ClinicalMarkdownRenderer from './ClinicalMarkdownRenderer';

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
 * Converts basic markdown formatting to clean semantic HTML for printing.
 */
function simpleMarkdownToHtml(md: string): string {
  if (!md) return '';
  
  // Clean raw LaTeX or double escaped backslashes
  let text = md
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    .replace(/\\mathbf\{([^}]+)\}/g, '<strong>$1</strong>')
    .replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)')
    .replace(/\\ge\b/g, '≥')
    .replace(/\\le\b/g, '≤')
    .replace(/\\pm\b/g, '±')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\times\b/g, '×')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\rightarrow\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\\uparrow\b/g, '↑')
    .replace(/\\downarrow\b/g, '↓')
    .replace(/\\Delta\b/g, 'Δ')
    .replace(/\\degree\b/g, '°')
    .replace(/\\circ\b/g, '°');

  // Handle display formulas $$ ... $$
  text = text.replace(/\$\$([^$]+)\$\$/g, (_, eq) => {
    return `\n\n<div style="text-align: center; margin: 8px 0; padding: 6px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-family: 'Times New Roman', serif; font-size: 10.5pt; font-style: italic; color: #0f172a;">${formatMathString(eq)}</div>\n\n`;
  });

  const lines = text.split('\n');
  const htmlLines: string[] = [];
  let inList = false;

  for (let line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      continue;
    }

    // Pass-through preformatted display divs
    if (trimmed.startsWith('<div style="text-align: center;')) {
      if (inList) { htmlLines.push('</ul>'); inList = false; }
      htmlLines.push(trimmed);
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      if (inList) { htmlLines.push('</ul>'); inList = false; }
      htmlLines.push(`<h4 style="margin: 8px 0 4px 0; font-size: 10pt; font-weight: 700; color: #1e293b;">${formatInline(trimmed.slice(4))}</h4>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      if (inList) { htmlLines.push('</ul>'); inList = false; }
      htmlLines.push(`<h3 style="margin: 10px 0 4px 0; font-size: 11pt; font-weight: 700; color: #0f172a;">${formatInline(trimmed.slice(3))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      if (inList) { htmlLines.push('</ul>'); inList = false; }
      htmlLines.push(`<h2 style="margin: 12px 0 6px 0; font-size: 12pt; font-weight: 800; color: #0f172a;">${formatInline(trimmed.slice(2))}</h2>`);
      continue;
    }

    // Unordered Lists
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        htmlLines.push('<ul style="margin: 4px 0; padding-left: 20px; font-size: 9.5pt; color: #334155; line-height: 1.45;">');
        inList = true;
      }
      htmlLines.push(`<li style="margin-bottom: 3px;">${formatInline(trimmed.slice(2))}</li>`);
      continue;
    }

    // Numbered lists
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      if (inList) { htmlLines.push('</ul>'); inList = false; }
      htmlLines.push(`<div style="margin: 3px 0; padding-left: 6px; font-size: 9.5pt; color: #334155;"><span style="font-weight: 700; color: #1e293b;">${numMatch[1]}.</span> ${formatInline(numMatch[2])}</div>`);
      continue;
    }

    if (inList) {
      htmlLines.push('</ul>');
      inList = false;
    }

    // Normal paragraph
    htmlLines.push(`<p style="margin: 4px 0; font-size: 9.5pt; color: #334155; line-height: 1.45;">${formatInline(trimmed)}</p>`);
  }

  if (inList) {
    htmlLines.push('</ul>');
  }

  return htmlLines.join('\n');
}

function formatMathString(math: string): string {
  return math
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathbf\{([^}]+)\}/g, '<strong>$1</strong>')
    .replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)')
    .replace(/_\{([^}]+)\}/g, '<sub>$1</sub>')
    .replace(/_([a-zA-Z0-9])/g, '<sub>$1</sub>')
    .replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>')
    .replace(/\^([a-zA-Z0-9+-])/g, '<sup>$1</sup>')
    .replace(/\\approx/g, '≈')
    .replace(/\\times/g, '×')
    .replace(/\\ge/g, '≥')
    .replace(/\\le/g, '≤')
    .replace(/\\pm/g, '±')
    .replace(/\\uparrow/g, '↑')
    .replace(/\\downarrow/g, '↓');
}

function formatInline(str: string): string {
  // Convert inline math $...$ to styled formula
  let res = str.replace(/\$([^$]+)\$/g, (_, math) => {
    return `<span style="font-family: 'Times New Roman', serif; font-style: italic; color: #0f172a;">${formatMathString(math)}</span>`;
  });

  return res
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 8.5pt;">$1</code>');
}

export function KnowledgePdfExportModal({
  isOpen,
  onClose,
  knowledgeMap,
  activeNodeId,
}: KnowledgePdfExportModalProps) {
  // Export Configurations
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeExplanations, setIncludeExplanations] = useState(true);
  const [includeFirstPrinciples, setIncludeFirstPrinciples] = useState(true);
  const [includeUserNotes, setIncludeUserNotes] = useState(true);
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [activeTab, setActiveTab] = useState<'settings' | 'preview'>('settings');
  
  // Handwritten Notes Ruling Settings
  const [noteLineCount, setNoteLineCount] = useState<number>(5);
  const [rulingStyle, setRulingStyle] = useState<'ruled' | 'dotted' | 'box' | 'none'>('ruled');

  const activeNode = useMemo(() => {
    return activeNodeId ? findNodeById(knowledgeMap.tree, activeNodeId) : null;
  }, [knowledgeMap.tree, activeNodeId]);

  const targetTree = useMemo(() => {
    return scope === 'selected' && activeNode ? [activeNode] : knowledgeMap.tree;
  }, [scope, activeNode, knowledgeMap.tree]);

  // Count total nodes in export scope
  const totalExportNodes = countNodes(targetTree);

  /**
   * Generates the self-contained, standalone printable HTML document.
   */
  const printableHtml = useMemo(() => {
    const renderNodeHtml = (node: KnowledgeTreeNode, prefix: string): string => {
      const hasExplanation = Boolean(node.explanation?.standard);
      const hasFirstPrinciples = Boolean(node.explanation?.firstPrinciples);
      const hasUserNotes = Boolean(node.explanation?.userNotes);

      const isRoot = node.depth === 0;
      const isLevel1 = node.depth === 1;

      let rulingHtml = '';
      if (noteLineCount > 0) {
        if (rulingStyle === 'ruled') {
          const lines = Array.from({ length: noteLineCount })
            .map(() => '<div style="height: 22px; border-bottom: 1px dashed #cbd5e1;"></div>')
            .join('');
          rulingHtml = `
            <div style="margin-top: 8px;">
              <div style="font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 4px;">✍️ Student Notes & Clinical Annotations</div>
              ${lines}
            </div>
          `;
        } else if (rulingStyle === 'dotted') {
          rulingHtml = `
            <div style="margin-top: 8px;">
              <div style="font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 4px;">✍️ Scratchpad & Formula Grid</div>
              <div style="height: ${Math.max(noteLineCount * 18, 50)}px; border: 1px solid #cbd5e1; border-radius: 4px; background-image: radial-gradient(circle, #94a3b8 1px, transparent 1px); background-size: 14px 14px;"></div>
            </div>
          `;
        } else if (rulingStyle === 'box') {
          rulingHtml = `
            <div style="margin-top: 8px;">
              <div style="font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 4px;">✍️ Sketched Diagram Frame</div>
              <div style="height: ${Math.max(noteLineCount * 18, 50)}px; border: 1px dashed #94a3b8; border-radius: 4px; background: #fafafa;"></div>
            </div>
          `;
        }
      }

      let childrenHtml = '';
      if (node.children && node.children.length > 0) {
        childrenHtml = node.children
          .map((child, idx) => renderNodeHtml(child, `${prefix}.${idx + 1}`))
          .join('\n');
      }

      const tagHtml = node.pyqTag
        ? `<span style="display: inline-block; font-size: 7.5pt; font-weight: 700; font-family: monospace; border: 1px solid #475569; color: #1e293b; padding: 1px 5px; border-radius: 3px; margin-left: 6px;">[${escapeHtml(node.pyqTag)}]</span>`
        : '';

      const borderLeftColor = isRoot ? '#2563eb' : isLevel1 ? '#0284c7' : '#94a3b8';
      const headingFontSize = isRoot ? '12pt' : isLevel1 ? '10.5pt' : '9.5pt';
      const headingFontWeight = isRoot ? '800' : isLevel1 ? '700' : '600';

      return `
        <div style="page-break-inside: avoid; break-inside: avoid; border-left: 3px solid ${borderLeftColor}; padding-left: 12px; margin-bottom: 14px; margin-top: ${isRoot ? '18px' : '8px'};">
          <div style="font-size: ${headingFontSize}; font-weight: ${headingFontWeight}; color: #0f172a; line-height: 1.3;">
            <span style="font-family: monospace; color: #64748b; margin-right: 4px;">${prefix}.</span>
            <span>${escapeHtml(node.title)}</span>
            ${tagHtml}
          </div>

          ${node.description ? `<p style="font-size: 9pt; color: #475569; font-style: italic; margin: 4px 0 6px 0; line-height: 1.35;">${escapeHtml(node.description)}</p>` : ''}

          ${node.firstPrincipleAnchor ? `
            <div style="background: #fffbeb; border: 1px solid #fef3c7; border-left: 3px solid #d97706; border-radius: 4px; padding: 6px 10px; margin: 6px 0; font-size: 9pt; color: #78350f;">
              <strong style="color: #92400e;">⚡ First-Principle Anchor:</strong> ${escapeHtml(node.firstPrincipleAnchor)}
            </div>
          ` : ''}

          ${includeExplanations && hasExplanation ? `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px 10px; margin: 6px 0;">
              <div style="font-size: 8pt; font-weight: 700; text-transform: uppercase; color: #475569; margin-bottom: 4px;">📖 Standard Explanation & Clinical Pathway:</div>
              ${simpleMarkdownToHtml(node.explanation!.standard!)}
            </div>
          ` : ''}

          ${includeFirstPrinciples && hasFirstPrinciples ? `
            <div style="background: #fffdf5; border: 1px solid #fed7aa; border-left: 3px solid #f97316; border-radius: 4px; padding: 8px 10px; margin: 6px 0;">
              <div style="font-size: 8pt; font-weight: 700; text-transform: uppercase; color: #9a3412; margin-bottom: 4px;">🔬 First-Principles Derivation:</div>
              ${simpleMarkdownToHtml(node.explanation!.firstPrinciples!)}
            </div>
          ` : ''}

          ${includeUserNotes && hasUserNotes ? `
            <div style="background: #faf5ff; border: 1px solid #e9d5ff; border-left: 3px solid #9333ea; border-radius: 4px; padding: 6px 10px; margin: 6px 0;">
              <div style="font-size: 8pt; font-weight: 700; text-transform: uppercase; color: #6b21a8; margin-bottom: 2px;">📝 Digital Notes:</div>
              <div style="font-size: 9pt; color: #581c87; font-family: Georgia, serif;">${escapeHtml(node.explanation!.userNotes!)}</div>
            </div>
          ` : ''}

          ${rulingHtml}

          ${childrenHtml ? `<div style="padding-left: 6px; margin-top: 6px;">${childrenHtml}</div>` : ''}
        </div>
      `;
    };

    const treeContentHtml = targetTree
      .map((node, index) => renderNodeHtml(node, `${index + 1}`))
      .join('\n');

    // Syllabus index
    const syllabusHtml = targetTree
      .map((root, i) => {
        let subItems = '';
        if (root.children && root.children.length > 0) {
          subItems = root.children
            .map((sub, j) => {
              let leafItems = '';
              if (sub.children && sub.children.length > 0) {
                leafItems = sub.children
                  .map((leaf, k) => `<div style="padding-left: 16px; font-size: 8.5pt; color: #64748b;">${i + 1}.${j + 1}.${k + 1} ${escapeHtml(leaf.title)}</div>`)
                  .join('');
              }
              return `
                <div style="padding-left: 14px; font-size: 9pt; color: #334155; margin-top: 2px;">
                  ${i + 1}.${j + 1} ${escapeHtml(sub.title)}
                  ${leafItems}
                </div>
              `;
            })
            .join('');
        }
        return `
          <div style="margin-bottom: 6px;">
            <div style="font-weight: 700; font-size: 9.5pt; color: #0f172a;">${i + 1}. ${escapeHtml(root.title)}</div>
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
          Generated: ${new Date(knowledgeMap.createdAt).toLocaleDateString()} • ${totalExportNodes} Analyzed Topics • Clinical Synthesis
        </div>
      </div>
      <div style="text-align: right;">
        <span class="badge">Study Guide</span>
      </div>
    </div>
  </div>

  <!-- Document Summary -->
  ${includeSummary && knowledgeMap.documentSummary ? `
    <div style="page-break-inside: avoid; break-inside: avoid; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px;">
      <div style="font-size: 9pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px;">
        📖 High-Yield Synthesis &amp; Clinical Core Themes
      </div>
      <div style="font-size: 9pt; color: #334155; line-height: 1.45;">
        ${simpleMarkdownToHtml(knowledgeMap.documentSummary)}
      </div>
    </div>
  ` : ''}

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
   * Executes printing in an isolated hidden iframe so no modal backdrop,
   * CSS variables, or dark themes can corrupt the white paper printout.
   */
  const handlePrint = () => {
    try {
      let iframe = document.getElementById('print-sandbox-iframe') as HTMLIFrameElement | null;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-sandbox-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.visibility = 'hidden';
        document.body.appendChild(iframe);
      }

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(printableHtml);
        doc.close();

        // Give the iframe document a moment to parse and render fonts
        setTimeout(() => {
          try {
            iframe?.contentWindow?.focus();
            iframe?.contentWindow?.print();
          } catch (err) {
            console.error('Iframe print failed, falling back to popup window', err);
            const win = window.open('', '_blank');
            if (win) {
              win.document.write(printableHtml);
              win.document.close();
              win.focus();
              setTimeout(() => win.print(), 300);
            }
          }
        }, 250);
      }
    } catch (err) {
      console.error('Printing error:', err);
      // Fallback: standard print
      window.print();
    }
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
        <DialogHeader className="p-4 sm:p-5 pb-3 border-b bg-card/70">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] font-mono border-amber-500/40 text-amber-600 bg-amber-500/10">
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
                Generate high-resolution printable worksheets formatted with custom handwritten ruling lines.
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
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
                      {activeNode ? `"${activeNode.title}" + children` : 'Click a node in the tree to select'}
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
                    <Switch checked={includeFirstPrinciples} onCheckedChange={setIncludeFirstPrinciples} />
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
                    max={12}
                    step={1}
                    onValueChange={(val) => setNoteLineCount(val[0])}
                    className="py-2"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                    <span>0 (No lines)</span>
                    <span>3 lines (~20mm)</span>
                    <span>5 lines (Recommended)</span>
                    <span>8 lines</span>
                    <span>12 lines (Full section)</span>
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
                    <span className="font-handwriting text-primary text-xs">✍️ Student Handwriting Area</span>
                  </div>
                  <div className="bg-card p-3 rounded-lg border border-border">
                    {rulingStyle === 'ruled' && (
                      <div className="space-y-3 py-1">
                        {Array.from({ length: Math.min(noteLineCount, 4) }).map((_, i) => (
                          <div key={i} className="h-0 border-b border-border/80 border-dashed" />
                        ))}
                        {noteLineCount > 4 && (
                          <div className="text-[10px] text-center text-muted-foreground font-mono">
                            + {noteLineCount - 4} more lines on printout...
                          </div>
                        )}
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

        {/* Footer Actions */}
        <DialogFooter className="p-4 sm:p-5 pt-3 border-t bg-card/80 flex items-center justify-between gap-3">
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
              size="sm"
              onClick={handlePrint}
              className="text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs"
            >
              <Printer className="h-4 w-4" />
              <span>Print / Save as PDF</span>
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
