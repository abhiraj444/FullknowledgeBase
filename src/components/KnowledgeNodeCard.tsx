'use client';

import { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Sparkles,
  BookOpen,
  Lightbulb,
  PlusCircle,
  PenTool,
  CheckCircle2,
  Layers,
  ArrowRight,
  Zap,
  HelpCircle,
  Loader2,
  Atom,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { KnowledgeTreeNode } from '@/types';

interface KnowledgeNodeCardProps {
  node: KnowledgeTreeNode;
  pathIndex: string;
  isSelected: boolean;
  onSelect: (node: KnowledgeTreeNode) => void;
  onToggleExpand: (nodeId: string) => void;
  onDissect: (node: KnowledgeTreeNode) => void;
  onExplain: (node: KnowledgeTreeNode, mode: 'standard' | 'first_principles' | 'simplified') => void;
  onAddNote: (node: KnowledgeTreeNode) => void;
  isDissecting?: boolean;
  isExplaining?: boolean;
}

export function KnowledgeNodeCard({
  node,
  pathIndex,
  isSelected,
  onSelect,
  onToggleExpand,
  onDissect,
  onExplain,
  onAddNote,
  isDissecting = false,
  isExplaining = false,
}: KnowledgeNodeCardProps) {
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isExpanded = node.isExpanded ?? true;

  const hasStandard = Boolean(node.explanation?.standard);
  const hasFirstPrinciples = Boolean(node.explanation?.firstPrinciples);
  const hasSimplified = Boolean(node.explanation?.simplified);
  const hasNotes = Boolean(node.explanation?.userNotes);
  const hasAnyExplanation = hasStandard || hasFirstPrinciples || hasSimplified;

  // Depth-specific styling
  const depthColors = [
    {
      border: 'border-l-4 border-l-primary border-border',
      bg: isSelected ? 'bg-primary/10' : 'bg-card hover:bg-muted/40',
      badge: 'border-primary/40 text-primary bg-primary/5',
      label: 'Primary Domain',
      tagIcon: Layers,
    },
    {
      border: 'border-l-4 border-l-emerald-500 border-border',
      bg: isSelected ? 'bg-emerald-500/10' : 'bg-card hover:bg-muted/40',
      badge: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5',
      label: 'Core Subtopic',
      tagIcon: BookOpen,
    },
    {
      border: 'border-l-4 border-l-amber-500 border-border',
      bg: isSelected ? 'bg-amber-500/10' : 'bg-card hover:bg-muted/40',
      badge: 'border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/5',
      label: 'Granular Mechanism',
      tagIcon: Atom,
    },
    {
      border: 'border-l-4 border-l-purple-500 border-border',
      bg: isSelected ? 'bg-purple-500/10' : 'bg-card hover:bg-muted/40',
      badge: 'border-purple-500/40 text-purple-600 dark:text-purple-400 bg-purple-500/5',
      label: 'Sub-Principle',
      tagIcon: Sparkles,
    },
  ];

  const currentStyle = depthColors[Math.min(node.depth, depthColors.length - 1)];

  return (
    <div
      className={cn(
        'group relative rounded-xl border transition-all duration-150 p-3 sm:p-4 shadow-2xs',
        currentStyle.border,
        currentStyle.bg,
        isSelected && 'ring-2 ring-primary shadow-sm'
      )}
    >
      <div className="flex items-start justify-between gap-2.5">
        {/* Left Toggle / Index / Title Block */}
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          {/* Expand/Collapse Chevron if children exist */}
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(node.id);
              }}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors mt-0.5"
              title={isExpanded ? 'Collapse branch' : 'Expand branch'}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-primary" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          ) : (
            <div className="w-6 h-4 flex items-center justify-center mt-1">
              <span className="h-1.5 w-1.5 rounded-full bg-border group-hover:bg-primary/70 transition-colors" />
            </div>
          )}

          {/* Node Content */}
          <div
            className="space-y-1 min-w-0 flex-1 cursor-pointer"
            onClick={() => onSelect(node)}
          >
            {/* Header Badges */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[11px] font-bold text-muted-foreground">
                {pathIndex}
              </span>
              <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 font-medium', currentStyle.badge)}>
                {currentStyle.label}
              </Badge>

              {node.pyqTag && (
                <Badge
                  variant="secondary"
                  className="text-[9px] px-1.5 py-0 font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                >
                  <Zap className="h-2.5 w-2.5 mr-0.5 text-amber-500" />
                  {node.pyqTag}
                </Badge>
              )}

              {/* Status Chips */}
              {hasFirstPrinciples && (
                <span className="stamp-badge text-[8px] py-0 px-1 border-amber-500/40 text-amber-600 bg-amber-500/5">
                  🔬 1st Principles
                </span>
              )}
              {hasStandard && (
                <span className="stamp-badge text-[8px] py-0 px-1 border-emerald-500/40 text-emerald-600 bg-emerald-500/5">
                  📖 Explored
                </span>
              )}
              {hasNotes && (
                <span className="stamp-badge text-[8px] py-0 px-1 border-purple-500/40 text-purple-600 bg-purple-500/5">
                  📝 Notes
                </span>
              )}
            </div>

            {/* Title */}
            <h3
              className={cn(
                'text-xs sm:text-sm font-bold text-foreground transition-colors group-hover:text-primary leading-snug',
                isSelected && 'text-primary'
              )}
            >
              {node.title}
            </h3>

            {/* Description */}
            {node.description && (
              <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed line-clamp-2">
                {node.description}
              </p>
            )}

            {/* First-Principle Anchor in-card callout */}
            {node.firstPrincipleAnchor && (
              <div className="text-[10px] sm:text-[11px] text-amber-900 dark:text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1 flex items-start gap-1 mt-1">
                <span className="font-bold shrink-0">⚡ Ground Truth:</span>
                <span className="italic">{node.firstPrincipleAnchor}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side Quick Actions (Mobile friendly flex-wrap) */}
        <div className="flex items-center gap-1 shrink-0 pt-0.5">
          {/* Quick Dissect/Expand Button */}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onDissect(node);
            }}
            disabled={isDissecting}
            className="h-7 px-2 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 gap-1 rounded-md"
            title="Dissect into granular sub-subtopics"
          >
            {isDissecting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <PlusCircle className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Dissect</span>
          </Button>

          {/* Quick Explain Button */}
          <Button
            type="button"
            size="sm"
            variant={isSelected ? 'default' : 'outline'}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(node);
              if (!hasAnyExplanation) {
                onExplain(node, 'standard');
              }
            }}
            disabled={isExplaining}
            className="h-7 px-2 text-[11px] font-semibold gap-1 rounded-md"
            title="Open explanation & First Principles"
          >
            {isExplaining ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : hasAnyExplanation ? (
              <BookOpen className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span>{hasAnyExplanation ? 'Study' : 'Explain'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
