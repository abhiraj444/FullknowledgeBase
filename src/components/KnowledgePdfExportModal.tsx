'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import type { KnowledgeMapData, KnowledgeTreeNode } from '@/types';
import ClinicalMarkdownRenderer from './ClinicalMarkdownRenderer';

interface KnowledgePdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  knowledgeMap: KnowledgeMapData;
  activeNodeId?: string | null;
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
  
  // Handwritten Notes Ruling Settings
  const [noteLineCount, setNoteLineCount] = useState<number>(6);
  const [rulingStyle, setRulingStyle] = useState<'ruled' | 'dotted' | 'box' | 'none'>('ruled');

  const activeNode = activeNodeId
    ? findNodeById(knowledgeMap.tree, activeNodeId)
    : null;

  const targetTree =
    scope === 'selected' && activeNode ? [activeNode] : knowledgeMap.tree;

  // Count total nodes in export scope
  const totalExportNodes = countNodes(targetTree);

  const handlePrint = () => {
    // Open standard print window which formats using @media print in globals.css
    window.print();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden border border-border shadow-xl">
        <DialogHeader className="p-4 sm:p-6 pb-3 border-b bg-card/60">
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
          </div>
        </DialogHeader>

        {/* Configuration Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
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
                    Include detailed mechanisms &amp; definitions
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
                    Include fundamental ground-truth breakdowns
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
                    Include your digital notes typed in app
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
                3. Physical Note Space (For Paper Printing)
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
                max={15}
                step={1}
                onValueChange={(val) => setNoteLineCount(val[0])}
                className="py-2"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>0 (No lines)</span>
                <span>3 lines (~20mm)</span>
                <span>6 lines (~40mm standard)</span>
                <span>10 lines (~65mm)</span>
                <span>15 lines (Full page)</span>
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
        </div>

        {/* Footer Actions */}
        <DialogFooter className="p-4 sm:p-6 pt-3 border-t bg-card/80 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground hidden sm:block">
            Ready to export <span className="font-bold text-foreground">{totalExportNodes} topics</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handlePrint}
              className="text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs"
            >
              <Printer className="h-4 w-4" />
              Print / Save as PDF
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Hidden Printable Document Container for Window.Print */}
      <div id="printable-knowledge-map" className="hidden print:block print:w-full print:p-6 print:text-black print:bg-white">
        {/* Print Header */}
        <div className="border-b-2 border-black pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                Knowledge Map &amp; Study Workbook
              </span>
              <h1 className="text-2xl font-black tracking-tight text-black mt-1">
                {knowledgeMap.title || 'Knowledge Hierarchy Map'}
              </h1>
              <p className="text-xs text-neutral-600 mt-1">
                Generated: {new Date(knowledgeMap.createdAt).toLocaleDateString()} • {totalExportNodes} Topics Analyzed
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono border border-black px-2 py-0.5 font-bold">
                MediGen Journal
              </span>
            </div>
          </div>
        </div>

        {/* Document Summary (If enabled) */}
        {includeSummary && knowledgeMap.documentSummary && (
          <div className="mb-8 p-4 border border-neutral-300 rounded-lg bg-neutral-50 print:bg-neutral-50 break-inside-avoid">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-800 border-b border-neutral-300 pb-1 mb-2">
              📖 Document Overview &amp; Key Themes
            </h2>
            <div className="text-xs text-neutral-800 leading-relaxed space-y-2">
              <ClinicalMarkdownRenderer content={knowledgeMap.documentSummary} />
            </div>
          </div>
        )}

        {/* Table of Contents Outline */}
        <div className="mb-8 p-4 border border-neutral-300 rounded-lg break-inside-avoid">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-800 border-b border-neutral-300 pb-1 mb-2">
            📑 Hierarchical Syllabus Index
          </h2>
          <div className="space-y-1.5 text-xs">
            {targetTree.map((root, i) => (
              <div key={root.id} className="space-y-1">
                <div className="font-bold text-neutral-900">
                  {i + 1}. {root.title}
                </div>
                {root.children?.map((sub, j) => (
                  <div key={sub.id} className="pl-4 text-neutral-700 space-y-0.5">
                    <div>
                      {i + 1}.{j + 1} {sub.title}
                    </div>
                    {sub.children?.map((leaf, k) => (
                      <div key={leaf.id} className="pl-4 text-neutral-600 text-[11px]">
                        {i + 1}.{j + 1}.{k + 1} {leaf.title}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Full Hierarchical Topic Breakdown with Explanations & Handwritten Note Lines */}
        <div className="space-y-6">
          <h2 className="text-base font-black uppercase tracking-wider text-black border-b-2 border-black pb-1">
            🔬 Topic Deconstruction &amp; Study Notes
          </h2>

          {targetTree.map((node, index) => (
            <PrintableNodeSection
              key={node.id}
              node={node}
              prefix={`${index + 1}`}
              includeExplanations={includeExplanations}
              includeFirstPrinciples={includeFirstPrinciples}
              includeUserNotes={includeUserNotes}
              noteLineCount={noteLineCount}
              rulingStyle={rulingStyle}
            />
          ))}
        </div>

        {/* Print Footer */}
        <div className="mt-12 pt-4 border-t border-neutral-300 text-center text-[10px] text-neutral-500">
          MediGen Clinical Knowledge Map • First-Principles Deep Learning Engine
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Recursive component for printable node block with page break avoid and ruled lines.
 */
function PrintableNodeSection({
  node,
  prefix,
  includeExplanations,
  includeFirstPrinciples,
  includeUserNotes,
  noteLineCount,
  rulingStyle,
}: {
  node: KnowledgeTreeNode;
  prefix: string;
  includeExplanations: boolean;
  includeFirstPrinciples: boolean;
  includeUserNotes: boolean;
  noteLineCount: number;
  rulingStyle: 'ruled' | 'dotted' | 'box' | 'none';
}) {
  const hasExplanation = Boolean(node.explanation?.standard);
  const hasFirstPrinciples = Boolean(node.explanation?.firstPrinciples);
  const hasUserNotes = Boolean(node.explanation?.userNotes);

  const headingClass =
    node.depth === 0
      ? 'text-base font-bold text-black border-b border-neutral-300 pb-1 mt-6'
      : node.depth === 1
      ? 'text-sm font-bold text-neutral-900 mt-4'
      : 'text-xs font-semibold text-neutral-800 mt-3';

  return (
    <div className="break-inside-avoid space-y-2 border-l-2 border-neutral-200 pl-3.5 my-3">
      {/* Title & Tag */}
      <div className={headingClass}>
        <span className="font-mono text-neutral-500 mr-1.5">{prefix}.</span>
        <span>{node.title}</span>
        {node.pyqTag && (
          <span className="ml-2 text-[9px] font-mono border border-neutral-400 px-1 py-0.2 rounded font-normal text-neutral-700">
            [{node.pyqTag}]
          </span>
        )}
      </div>

      {/* Description */}
      {node.description && (
        <p className="text-xs text-neutral-600 italic leading-snug">
          {node.description}
        </p>
      )}

      {/* First Principle Anchor (Ground truth summary) */}
      {node.firstPrincipleAnchor && (
        <div className="text-[11px] bg-neutral-100 p-2 rounded border border-neutral-200 text-neutral-800">
          <span className="font-bold">⚡ First-Principle Anchor: </span>
          {node.firstPrincipleAnchor}
        </div>
      )}

      {/* Standard Explanation */}
      {includeExplanations && hasExplanation && (
        <div className="text-xs text-neutral-800 bg-neutral-50 p-3 rounded border border-neutral-200 my-2 space-y-1">
          <span className="font-bold text-[11px] uppercase tracking-wider text-neutral-700 block mb-1">
            📖 Standard Explanation &amp; Pathway:
          </span>
          <ClinicalMarkdownRenderer content={node.explanation!.standard!} />
        </div>
      )}

      {/* First Principles Detailed Breakdown */}
      {includeFirstPrinciples && hasFirstPrinciples && (
        <div className="text-xs text-neutral-800 bg-amber-50/50 p-3 rounded border border-amber-200/80 my-2 space-y-1">
          <span className="font-bold text-[11px] uppercase tracking-wider text-amber-900 block mb-1">
            🔬 First-Principles Derivation:
          </span>
          <ClinicalMarkdownRenderer content={node.explanation!.firstPrinciples!} />
        </div>
      )}

      {/* User In-App Notes */}
      {includeUserNotes && hasUserNotes && (
        <div className="text-xs text-neutral-800 bg-purple-50/40 p-2.5 rounded border border-purple-200 my-2">
          <span className="font-bold text-[11px] uppercase tracking-wider text-purple-900 block mb-1">
            📝 Digital Notes:
          </span>
          <p className="font-handwriting text-sm">{node.explanation!.userNotes}</p>
        </div>
      )}

      {/* Configurable Ruled Handwriting Lines for Physical Study */}
      {noteLineCount > 0 && (
        <div className="mt-2 pt-1">
          <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 font-mono block mb-1.5">
            ✍️ Handwritten Notes &amp; Clinical Annotations:
          </span>
          {rulingStyle === 'ruled' && (
            <div className="space-y-3.5 py-1">
              {Array.from({ length: noteLineCount }).map((_, i) => (
                <div key={i} className="h-0 border-b border-neutral-300 border-dashed" />
              ))}
            </div>
          )}
          {rulingStyle === 'dotted' && (
            <div
              className="rounded border border-neutral-300"
              style={{
                height: `${Math.max(noteLineCount * 14, 40)}px`,
                backgroundImage: 'radial-gradient(circle, #9ca3af 1px, transparent 1px)',
                backgroundSize: '12px 12px',
              }}
            />
          )}
          {rulingStyle === 'box' && (
            <div
              className="rounded border border-neutral-300 bg-neutral-50/30"
              style={{ height: `${Math.max(noteLineCount * 14, 40)}px` }}
            />
          )}
        </div>
      )}

      {/* Recursive Children Rendering */}
      {node.children && node.children.length > 0 && (
        <div className="pl-2 pt-2 space-y-3">
          {node.children.map((child, idx) => (
            <PrintableNodeSection
              key={child.id}
              node={child}
              prefix={`${prefix}.${idx + 1}`}
              includeExplanations={includeExplanations}
              includeFirstPrinciples={includeFirstPrinciples}
              includeUserNotes={includeUserNotes}
              noteLineCount={noteLineCount}
              rulingStyle={rulingStyle}
            />
          ))}
        </div>
      )}
    </div>
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
