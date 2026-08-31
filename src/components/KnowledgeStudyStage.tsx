'use client';

import { useState } from 'react';
import {
  BookOpen,
  Sparkles,
  Lightbulb,
  PenTool,
  PlusCircle,
  Loader2,
  ChevronRight,
  ShieldCheck,
  Zap,
  Atom,
  Mic,
  Copy,
  Check,
  RefreshCw,
  X,
  Layers,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { KnowledgeTreeNode } from '@/types';
import ClinicalMarkdownRenderer from './ClinicalMarkdownRenderer';
import { SpeechSynthesisButton } from './SpeechSynthesisButton';
import { VoiceInputButton } from './VoiceInputButton';
import { useToast } from '@/hooks/use-toast';
import { AiStreamingRawLogBox } from './AiStreamingRawLogBox';

interface KnowledgeStudyStageProps {
  node: KnowledgeTreeNode | null;
  lineagePath?: string[];
  siblingTitles?: string[];
  documentSummary?: string;
  onClose?: () => void;
  onDissect: (node: KnowledgeTreeNode) => void;
  onExplain: (node: KnowledgeTreeNode, mode: 'standard' | 'first_principles' | 'simplified') => void;
  onUpdateNotes: (nodeId: string, notes: string) => void;
  onStop?: () => void;
  isExplaining?: boolean;
  isDissecting?: boolean;
  streamInputPrompt?: string;
  streamThinking?: string;
  streamText?: string;
  streamStep?: string;
  streamModelName?: string;
}

export function KnowledgeStudyStage({
  node,
  lineagePath = [],
  siblingTitles = [],
  documentSummary,
  onClose,
  onDissect,
  onExplain,
  onUpdateNotes,
  onStop,
  isExplaining = false,
  isDissecting = false,
  streamInputPrompt = '',
  streamThinking = '',
  streamText = '',
  streamStep = '',
  streamModelName = '',
}: KnowledgeStudyStageProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'standard' | 'first_principles' | 'simplified' | 'notes'>('standard');
  const [copied, setCopied] = useState(false);

  if (!node) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center border rounded-2xl bg-card/50 text-muted-foreground space-y-3">
        <div className="p-4 rounded-2xl bg-muted/60 border border-border">
          <Atom className="h-8 w-8 text-primary/70" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-foreground">Select a Concept to Study</h3>
          <p className="text-xs max-w-sm">
            Click on any topic or subtopic from the Knowledge Map to dive into First-Principles derivations, step-by-step pathways, or intuitive analogies.
          </p>
        </div>
      </div>
    );
  }

  const standardExplanation = node.explanation?.standard || '';
  const firstPrinciplesExplanation = node.explanation?.firstPrinciples || '';
  const simplifiedExplanation = node.explanation?.simplified || '';
  const userNotes = node.explanation?.userNotes || '';

  const activeContent =
    activeTab === 'standard'
      ? standardExplanation
      : activeTab === 'first_principles'
      ? firstPrinciplesExplanation
      : activeTab === 'simplified'
      ? simplifiedExplanation
      : userNotes;

  const handleCopy = () => {
    if (!activeContent) return;
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    toast({ title: 'Copied to Clipboard', description: 'Content ready to paste into your notes.' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVoiceTranscription = (transcript: string) => {
    const clean = transcript.trim();
    if (!clean) return;
    const current = userNotes.trim();
    if (current.endsWith(clean)) return;
    const updated = current ? `${current}\n\n${clean}` : clean;
    onUpdateNotes(node.id, updated);
    toast({ title: 'Voice Note Added', description: 'Transcribed dictation appended to personal notes.' });
  };

  return (
    <div className="flex flex-col h-full rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Top Bar with Lineage & Actions */}
      <div className="p-4 sm:p-5 border-b bg-card/80 space-y-2">
        {/* Breadcrumb Lineage */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground overflow-x-auto whitespace-nowrap py-0.5 max-w-[80%] scrollbar-none">
            <span className="font-semibold text-primary">Knowledge Map</span>
            {lineagePath.map((item, idx) => (
              <span key={idx} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                <span className="truncate max-w-[140px]" title={item}>{item}</span>
              </span>
            ))}
          </div>

          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
              title="Close panel"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Title, Badge & Quick Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="stamp-badge text-[9px] border-primary/40 text-primary bg-primary/5">
                Depth Level {node.depth}
              </span>
              {(node.isNewlyDissected || node.isNew) && (
                <Badge variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-bold">
                  <Sparkles className="h-3 w-3 mr-1 text-emerald-600 dark:text-emerald-400" />
                  Newly Dissected
                </Badge>
              )}
              {node.pyqTag && (
                <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                  <Zap className="h-3 w-3 mr-1 text-amber-500" />
                  {node.pyqTag}
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-emerald-500" /> Surgical Token Optimized
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-foreground leading-snug">
              {node.title}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Stop Button when Generating */}
            {(isExplaining || isDissecting) && onStop && (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={onStop}
                className="h-8 text-xs gap-1.5 font-medium shadow-sm animate-pulse"
                title="Stop AI Generation"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>Stop</span>
              </Button>
            )}

            {/* Dissect Button */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onDissect(node)}
              disabled={isDissecting || isExplaining}
              className="h-8 text-xs gap-1.5 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 font-medium"
            >
              {isDissecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlusCircle className="h-3.5 w-3.5" />
              )}
              <span>Dissect Further</span>
            </Button>

            {/* Read Aloud Audio Player */}
            {activeContent && activeTab !== 'notes' && (
              <SpeechSynthesisButton text={activeContent} size="sm" />
            )}

            {/* Copy Button */}
            {activeContent && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleCopy}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title="Copy text"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        </div>

        {/* Node Description / Anchor */}
        {node.description && (
          <p className="text-xs text-muted-foreground leading-relaxed pt-1">
            {node.description}
          </p>
        )}

        {node.firstPrincipleAnchor && (
          <div className="text-xs text-amber-950 dark:text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 flex items-start gap-1.5">
            <Atom className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">First-Principle Anchor: </span>
              <span className="italic">{node.firstPrincipleAnchor}</span>
            </div>
          </div>
        )}
      </div>

      {/* Multi-Lens Switcher Tabs */}
      <div className="border-b bg-muted/40 px-4 pt-2">
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as any)}
          className="w-full"
        >
          <TabsList className="grid grid-cols-4 h-9 bg-card border border-border">
            <TabsTrigger value="standard" className="text-xs font-semibold gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Standard</span> Workup
            </TabsTrigger>

            <TabsTrigger value="first_principles" className="text-xs font-semibold gap-1.5 data-[state=active]:bg-amber-600 data-[state=active]:text-white">
              <Atom className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">1st</span> Principles
            </TabsTrigger>

            <TabsTrigger value="simplified" className="text-xs font-semibold gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <Lightbulb className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Analogy /</span> Simplify
            </TabsTrigger>

            <TabsTrigger value="notes" className="text-xs font-semibold gap-1.5 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              <PenTool className="h-3.5 w-3.5" />
              <span>Notes</span>
              {userNotes && <span className="h-1.5 w-1.5 rounded-full bg-purple-300" />}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Active Tab Body Stage */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* 3-Box AI Request, Reasoning & Stream Inspector */}
        {(isExplaining || isDissecting || Boolean(streamThinking || streamText || streamInputPrompt)) && (
          <AiStreamingRawLogBox
            title={isDissecting ? 'AI Dissection Console (Subtopic Expansion)' : 'AI Academic Workup Console'}
            currentStep={
              streamStep ||
              (isDissecting
                ? 'Dissecting into granular subtopics...'
                : isExplaining
                ? 'Analyzing concept via surgical context...'
                : 'AI response ready.')
            }
            inputPrompt={streamInputPrompt}
            thinkingText={streamThinking}
            streamText={streamText}
            modelName={streamModelName}
            isLoading={isExplaining || isDissecting}
            onStop={onStop}
            permanent={true}
            defaultExpanded={isExplaining || isDissecting}
          />
        )}

        {/* Tab 1: Standard Explanation */}
        {activeTab === 'standard' && (
          <div className="space-y-4">
            {standardExplanation ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground pb-2 border-b">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-primary" /> Rigorous Clinical / Academic Workup
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onExplain(node, 'standard')}
                    disabled={isExplaining}
                    className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-primary"
                  >
                    <RefreshCw className="h-3 w-3" /> Re-generate
                  </Button>
                </div>
                <ClinicalMarkdownRenderer content={standardExplanation} />
              </div>
            ) : !isExplaining ? (
              <div className="py-12 text-center space-y-3">
                <div className="p-3.5 rounded-2xl bg-primary/10 text-primary w-fit mx-auto border border-primary/20">
                  <BookOpen className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-foreground">Standard Explanation Not Yet Generated</h4>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    Generate a full academic/clinical breakdown with definitions, step-by-step pathways, and high-yield rules.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => onExplain(node, 'standard')}
                  className="text-xs font-semibold gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Generate Standard Workup
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {/* Tab 2: First-Principles Derivation */}
        {activeTab === 'first_principles' && (
          <div className="space-y-4">
            {firstPrinciplesExplanation ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground pb-2 border-b">
                  <span className="font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                    <Atom className="h-3.5 w-3.5 text-amber-500" /> Ground-Up First Principles Breakdown
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onExplain(node, 'first_principles')}
                    disabled={isExplaining}
                    className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-amber-600"
                  >
                    <RefreshCw className="h-3 w-3" /> Re-derive
                  </Button>
                </div>
                <ClinicalMarkdownRenderer content={firstPrinciplesExplanation} />
              </div>
            ) : !isExplaining ? (
              <div className="py-12 text-center space-y-3">
                <div className="p-3.5 rounded-2xl bg-amber-500/10 text-amber-600 w-fit mx-auto border border-amber-500/20">
                  <Atom className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-foreground">Deconstruct to Fundamental Truths</h4>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    Explain *why* this concept works from foundational physics, biochemistry, or logic without rote memorization.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => onExplain(node, 'first_principles')}
                  className="text-xs font-semibold gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <Atom className="h-3.5 w-3.5" />
                  Derive from First Principles
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {/* Tab 3: Simplified / Intuitive Analogy */}
        {activeTab === 'simplified' && (
          <div className="space-y-4">
            {simplifiedExplanation ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground pb-2 border-b">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5 text-emerald-500" /> Intuitive Analogy &amp; Plain Language
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onExplain(node, 'simplified')}
                    disabled={isExplaining}
                    className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-emerald-600"
                  >
                    <RefreshCw className="h-3 w-3" /> Simplify Again
                  </Button>
                </div>
                <ClinicalMarkdownRenderer content={simplifiedExplanation} />
              </div>
            ) : !isExplaining ? (
              <div className="py-12 text-center space-y-3">
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-600 w-fit mx-auto border border-emerald-500/20">
                  <Lightbulb className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-foreground">Explain Like I&apos;m 12 (Analogy Mode)</h4>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    Translate dense jargon into relatable real-world physical analogies and memorable visual rules.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => onExplain(node, 'simplified')}
                  className="text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Lightbulb className="h-3.5 w-3.5" />
                  Generate Intuitive Analogy
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {/* Tab 4: Personal Notes / Handwritten Input */}
        {activeTab === 'notes' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <PenTool className="h-3.5 w-3.5 text-purple-600" /> Personal Handwritten &amp; Study Notes
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Saved automatically to this specific topic in your offline database.
                </p>
              </div>
              {/* Dictation voice input button */}
              <VoiceInputButton
                onTranscript={handleVoiceTranscription}
                label="Voice Note"
                size="sm"
                variant="outline"
              />
            </div>

            <Textarea
              value={userNotes}
              onChange={(e) => onUpdateNotes(node.id, e.target.value)}
              placeholder="Type your notes, formulas, clinical mnemonics, or voice dictations here... These will be saved and can also be exported into your printable PDF!"
              className="min-h-[220px] text-xs font-handwriting text-sm leading-relaxed border-border bg-card shadow-2xs resize-y"
            />

            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
              <span>{userNotes.length} characters</span>
              <span className="stamp-badge text-[9px] border-purple-500/40 text-purple-600 bg-purple-500/5">
                ✍️ Attached to printable PDF
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
