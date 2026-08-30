'use client';

import { useState, type ChangeEvent, type ClipboardEvent, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  Network,
  Sparkles,
  Layers,
  PlusCircle,
  X,
  Upload,
  Search,
  Printer,
  Download,
  Presentation,
  BookOpen,
  Atom,
  RefreshCw,
  Zap,
  CheckCircle2,
  FileText,
  HelpCircle,
  Maximize2,
  Minimize2,
  ChevronRight,
  ShieldCheck,
  BrainCircuit,
  Settings,
  ArrowRight,
  RotateCcw,
  Square,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/context/SettingsContext';
import { ModeLanguageSelector } from '@/components/ModeLanguageSelector';
import { LocalDataService, type LocalCase } from '@/lib/LocalDataService';
import { ClientSideAiService, formatModelDisplayName } from '@/lib/ClientSideAiService';
import type { KnowledgeMapData, KnowledgeTreeNode } from '@/types';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { AudioRecorder } from '@/components/AudioRecorder';
import { AudioPlayerCard } from '@/components/AudioPlayerCard';
import type { RecordedAudio } from '@/hooks/useAudioRecorder';
import { convertPdfToImages, isPdfFile } from '@/lib/pdf-to-images';
import { compressImagesForAi, prepareImagesForAiPrompt } from '@/lib/image-compressor';
import { ImageCompressionOption } from '@/components/ImageCompressionOption';
import { AiStreamingRawLogBox } from '@/components/AiStreamingRawLogBox';
import ClinicalMarkdownRenderer from '@/components/ClinicalMarkdownRenderer';
import { KnowledgeNodeCard } from '@/components/KnowledgeNodeCard';
import { KnowledgeStudyStage } from '@/components/KnowledgeStudyStage';
import { KnowledgePdfExportModal } from '@/components/KnowledgePdfExportModal';
import Link from 'next/link';

function KnowledgeMapContent() {
  const {
    apiKey,
    aiConfig,
    isConfigured,
    activeModel,
    language,
    audienceMode,
    modelReasoningEffort,
  } = useSettings();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const caseIdParam = searchParams.get('caseId');
  const { toast } = useToast();

  // Input states
  const [topicInput, setTopicInput] = useState('');
  const [learningGoal, setLearningGoal] = useState<'comprehensive' | 'pyq_mastery' | 'clinical_pathway' | 'first_principles'>('comprehensive');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [recordedAudios, setRecordedAudios] = useState<RecordedAudio[]>([]);
  const [audioTranscripts, setAudioTranscripts] = useState<string[]>([]);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [compressImages, setCompressImages] = useState(true);

  // Active Knowledge Map state
  const [currentCaseId, setCurrentCaseId] = useState<string | null>(null);
  const [knowledgeMap, setKnowledgeMap] = useState<KnowledgeMapData | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');

  // UI Flow & Modals
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDissectingNodeId, setIsDissectingNodeId] = useState<string | null>(null);
  const [isExplainingNodeId, setIsExplainingNodeId] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [mobileActiveTab, setMobileActiveTab] = useState<'tree' | 'study'>('tree');
  const [isInputExpanded, setIsInputExpanded] = useState(true);

  // Streaming Raw Logs State
  const [streamStep, setStreamStep] = useState('');
  const [streamThinking, setStreamThinking] = useState('');
  const [streamText, setStreamText] = useState('');
  const [streamModelName, setStreamModelName] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadCaseById = useCallback(async (id: string) => {
    try {
      const existing = await LocalDataService.getCase(id);
      if (existing && existing.type === 'knowledge-map' && existing.outputData?.knowledgeMap) {
        setCurrentCaseId(existing.id);
        const mapData = existing.outputData.knowledgeMap as KnowledgeMapData;
        setKnowledgeMap(mapData);
        setTopicInput(existing.inputData?.topic || existing.title || '');
        if (mapData.tree && mapData.tree.length > 0) {
          setActiveNodeId(mapData.tree[0].id);
        }
        setIsInputExpanded(false);
        toast({ title: 'Knowledge Map Loaded', description: `Loaded "${existing.title}".` });
      }
    } catch (err) {
      console.error('Failed to load knowledge map case:', err);
    }
  }, [toast]);

  // Load existing case if param exists
  useEffect(() => {
    if (caseIdParam) {
      loadCaseById(caseIdParam);
    }
  }, [caseIdParam, loadCaseById]);

  // Handle PDF and Image File Uploads
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);

    const pdfs = fileArray.filter((f) => isPdfFile(f));
    const nonPdfs = fileArray.filter((f) => !isPdfFile(f));

    if (pdfs.length > 0) {
      setIsProcessingPdf(true);
      toast({
        title: 'Processing Document Pages',
        description: 'Rendering multi-page document into high-resolution pages for analysis...',
      });
      try {
        for (const pdf of pdfs) {
          const pageImages = await convertPdfToImages(pdf, 1.6);
          const newFiles = pageImages.map((p) => p.file);
          const newPreviews = pageImages.map((p) => p.dataUrl);
          setUploadedFiles((prev) => [...prev, ...newFiles]);
          setImagePreviews((prev) => [...prev, ...newPreviews]);
        }
        toast({
          title: 'Document Ingestion Complete',
          description: `Extracted visual pages ready for knowledge dissection.`,
        });
      } catch (err) {
        console.error('PDF parsing error:', err);
        toast({
          title: 'PDF Processing Notice',
          description: 'Could not render PDF pages directly. Will analyze available text and uploads.',
          variant: 'destructive',
        });
      } finally {
        setIsProcessingPdf(false);
      }
    }

    if (nonPdfs.length > 0) {
      setUploadedFiles((prev) => [...prev, ...nonPdfs]);
      for (const file of nonPdfs) {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              setImagePreviews((prev) => [...prev, e.target!.result as string]);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      handleFileUpload(dt.files);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // Generate Initial Knowledge Map
  const handleGenerateKnowledgeMap = async () => {
    if (!isConfigured) {
      toast({
        title: 'API Configuration Required',
        description: 'Please configure your AI API Key in Settings to generate knowledge maps.',
        variant: 'destructive',
      });
      return;
    }

    if (!topicInput.trim() && uploadedFiles.length === 0 && recordedAudios.length === 0) {
      toast({
        title: 'Input Required',
        description: 'Please enter a topic, question, PYQ paper, or upload lecture notes / PDF.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    setStreamStep('Ingesting content & constructing hierarchical knowledge tree...');
    setStreamThinking('');
    setStreamText('');
    setStreamModelName(formatModelDisplayName(activeModel));

    abortControllerRef.current = new AbortController();

    try {
      // 1. Prepare images if any
      let processedImages = uploadedFiles;
      if (uploadedFiles.length > 0 && compressImages) {
        processedImages = await compressImagesForAi(uploadedFiles);
      }
      const { processedImages: imagesForAi, summaryText: prepSummary } = await prepareImagesForAiPrompt(processedImages);

      // 2. Prepare audio transcript context
      const fullText = [
        topicInput.trim(),
        prepSummary ? `[Attached Document/Visual Pages: ${prepSummary}]` : '',
        audioTranscripts.length > 0 ? `Voice Memo Notes: ${audioTranscripts.join('\n')}` : '',
        `Learning Focus Goal: ${learningGoal}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      // 3. Call AI Service
      const mapResult = await ClientSideAiService.generateKnowledgeMap(
        aiConfig,
        {
          text: fullText,
          images: imagesForAi,
          language,
          audienceMode,
          onStreamChunk: (chunk) => {
            if (chunk.thinking) setStreamThinking(chunk.thinking);
            if (chunk.text) setStreamText(chunk.text);
            if (chunk.modelUsed) setStreamModelName(formatModelDisplayName(chunk.modelUsed));
          },
          signal: abortControllerRef.current.signal,
        }
      );

      setKnowledgeMap(mapResult);
      if (mapResult.tree && mapResult.tree.length > 0) {
        setActiveNodeId(mapResult.tree[0].id);
      }
      setIsInputExpanded(false);

      // 4. Save to Dexie Local Database
      const newCase: LocalCase = {
        id: currentCaseId || crypto.randomUUID(),
        userId: user?.id || 'local-user',
        title: mapResult.title || topicInput.slice(0, 60) || 'Knowledge Map Case',
        type: 'knowledge-map',
        inputData: {
          topic: topicInput,
          learningGoal,
        },
        outputData: {
          knowledgeMap: mapResult,
          totalNodesCount: countTotalNodes(mapResult.tree),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await LocalDataService.saveCase(newCase);
      setCurrentCaseId(newCase.id);

      toast({
        title: 'Knowledge Map Generated!',
        description: `Constructed ${countTotalNodes(mapResult.tree)} structured topics with first-principles anchors.`,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || abortControllerRef.current?.signal.aborted || ClientSideAiService.isAbortError(err)) {
        toast({ title: 'Generation Cancelled', description: 'Request was aborted.' });
      } else {
        console.error('Error generating knowledge map:', err);
        toast({
          title: 'Knowledge Map Error',
          description: err.message || 'Failed to construct knowledge tree. Please check API settings.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsGenerating(false);
      setStreamStep('');
    }
  };

  // Stop ongoing AI generation request
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setIsDissectingNodeId(null);
    setIsExplainingNodeId(null);
    setStreamStep('');
    toast({
      title: 'AI Generation Stopped',
      description: 'The running AI request was cancelled.',
    });
  };

  // Dissect a specific node into 3-6 deeper subtopics
  const handleDissectNode = async (node: KnowledgeTreeNode) => {
    if (!knowledgeMap || !isConfigured) return;

    abortControllerRef.current = new AbortController();
    setIsDissectingNodeId(node.id);
    setStreamStep(`Dissecting "${node.title}" into granular sub-principles...`);
    setStreamThinking('');
    setStreamText('');
    setStreamModelName(formatModelDisplayName(activeModel));

    try {
      const lineage = getNodeLineageTitles(knowledgeMap.tree, node.id);
      const siblings = getNodeSiblingTitles(knowledgeMap.tree, node.id);

      const subNodes = await ClientSideAiService.dissectAndExpandKnowledgeNode(
        aiConfig,
        {
          documentSummary: knowledgeMap.documentSummary,
          targetNode: { id: node.id, title: node.title, description: node.description, depth: node.depth },
          parentTitle: lineage[lineage.length - 2],
          rootTitle: lineage[0],
          siblingTitles: siblings,
          language,
          audienceMode,
          onStreamChunk: (chunk) => {
            if (chunk.thinking) setStreamThinking(chunk.thinking);
            if (chunk.text) setStreamText(chunk.text);
            if (chunk.modelUsed) setStreamModelName(formatModelDisplayName(chunk.modelUsed));
          },
          signal: abortControllerRef.current.signal,
        }
      );

      // Insert new children into tree
      const updatedTree = insertChildrenIntoNode(knowledgeMap.tree, node.id, subNodes);
      const updatedMap: KnowledgeMapData = {
        ...knowledgeMap,
        tree: updatedTree,
      };

      setKnowledgeMap(updatedMap);
      saveMapToDatabase(updatedMap);

      toast({
        title: 'Subtopic Dissected!',
        description: `Added ${subNodes.length} granular sub-principles under "${node.title}".`,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || abortControllerRef.current?.signal.aborted || ClientSideAiService.isAbortError(err)) {
        toast({ title: 'Dissection Stopped', description: 'Request was cancelled.' });
      } else {
        console.error('Dissect node error:', err);
        toast({
          title: 'Dissection Failed',
          description: err.message || 'Could not dissect subtopic.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsDissectingNodeId(null);
      setStreamStep('');
    }
  };

  // Explain a specific node
  const handleExplainNode = async (
    node: KnowledgeTreeNode,
    mode: 'standard' | 'first_principles' | 'simplified'
  ) => {
    if (!knowledgeMap || !isConfigured) return;

    abortControllerRef.current = new AbortController();
    setIsExplainingNodeId(node.id);
    setActiveNodeId(node.id);
    setMobileActiveTab('study');

    const modeLabels = {
      standard: 'Standard Academic / Clinical Workup',
      first_principles: 'First-Principles Fundamental Truths',
      simplified: 'Intuitive Analogy & Simplification',
    };

    setStreamStep(`Deriving ${modeLabels[mode]} for "${node.title}"...`);
    setStreamThinking('');
    setStreamText('');
    setStreamModelName(formatModelDisplayName(activeModel));

    try {
      const lineage = getNodeLineageTitles(knowledgeMap.tree, node.id);
      const siblings = getNodeSiblingTitles(knowledgeMap.tree, node.id);

      const explanation = await ClientSideAiService.explainKnowledgeNode(
        aiConfig,
        {
          documentSummary: knowledgeMap.documentSummary,
          targetNode: { title: node.title, description: node.description, depth: node.depth, firstPrincipleAnchor: node.firstPrincipleAnchor },
          parentTitle: lineage[lineage.length - 2],
          rootTitle: lineage[0],
          siblingTitles: siblings,
          mode,
          language,
          audienceMode,
          onStreamChunk: (chunk) => {
            if (chunk.thinking) setStreamThinking(chunk.thinking);
            if (chunk.text) setStreamText(chunk.text);
            if (chunk.modelUsed) setStreamModelName(formatModelDisplayName(chunk.modelUsed));
          },
          signal: abortControllerRef.current.signal,
        }
      );

      // Update node explanation in tree
      const updatedTree = updateNodeExplanation(knowledgeMap.tree, node.id, mode, explanation);
      const updatedMap: KnowledgeMapData = {
        ...knowledgeMap,
        tree: updatedTree,
      };

      setKnowledgeMap(updatedMap);
      saveMapToDatabase(updatedMap);

      toast({
        title: 'Explanation Ready',
        description: `Derived ${modeLabels[mode]} for "${node.title}".`,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || abortControllerRef.current?.signal.aborted || ClientSideAiService.isAbortError(err)) {
        toast({ title: 'Explanation Stopped', description: 'Request was cancelled.' });
      } else {
        console.error('Explain node error:', err);
        toast({
          title: 'Explanation Failed',
          description: err.message || 'Could not generate explanation.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsExplainingNodeId(null);
      setStreamStep('');
    }
  };

  // Toggle expand / collapse of a node branch
  const handleToggleExpand = (nodeId: string) => {
    if (!knowledgeMap) return;
    const updatedTree = toggleNodeExpandState(knowledgeMap.tree, nodeId);
    setKnowledgeMap({
      ...knowledgeMap,
      tree: updatedTree,
    });
  };

  // Update user personal notes for a node
  const handleUpdateNotes = (nodeId: string, notes: string) => {
    if (!knowledgeMap) return;
    const updatedTree = updateNodeUserNotes(knowledgeMap.tree, nodeId, notes);
    const updatedMap: KnowledgeMapData = {
      ...knowledgeMap,
      tree: updatedTree,
    };
    setKnowledgeMap(updatedMap);
    saveMapToDatabase(updatedMap);
  };

  // Expand all / Collapse all in tree
  const handleSetAllExpanded = (expanded: boolean) => {
    if (!knowledgeMap) return;
    const updatedTree = setAllNodesExpandState(knowledgeMap.tree, expanded);
    setKnowledgeMap({
      ...knowledgeMap,
      tree: updatedTree,
    });
  };

  // Helper to persist updated map into Dexie DB
  const saveMapToDatabase = async (mapToSave: KnowledgeMapData) => {
    if (!currentCaseId) return;
    try {
      await LocalDataService.updateCase(currentCaseId, {
        outputData: {
          knowledgeMap: mapToSave,
          totalNodesCount: countTotalNodes(mapToSave.tree),
        },
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to auto-save knowledge map:', err);
    }
  };

  // Find active node object
  const activeNode = activeNodeId && knowledgeMap ? findNodeById(knowledgeMap.tree, activeNodeId) : null;
  const activeLineage = activeNodeId && knowledgeMap ? getNodeLineageTitles(knowledgeMap.tree, activeNodeId) : [];
  const activeSiblings = activeNodeId && knowledgeMap ? getNodeSiblingTitles(knowledgeMap.tree, activeNodeId) : [];

  // Filter tree nodes by search query
  const filteredTree = knowledgeMap
    ? filterTreeNodes(knowledgeMap.tree, searchQuery.trim().toLowerCase())
    : [];

  const totalNodesCount = knowledgeMap ? countTotalNodes(knowledgeMap.tree) : 0;
  const totalExploredCount = knowledgeMap ? countExploredNodes(knowledgeMap.tree) : 0;

  return (
    <div className="container mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-mono border-amber-500/40 text-amber-600 bg-amber-500/10">
              <Network className="h-3 w-3 mr-1" /> Deep Knowledge Tree
            </Badge>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              First-Principles Deconstruction &amp; Syllabus Mind Maps
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Knowledge Map &amp; First-Principles Studio
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Active AI Stop Button */}
          {(isGenerating || Boolean(isDissectingNodeId) || Boolean(isExplainingNodeId)) && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleStopGeneration}
              className="text-xs gap-1.5 font-bold animate-pulse shadow-sm"
              title="Stop ongoing AI generation"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>Stop AI Request</span>
            </Button>
          )}

          {knowledgeMap && (
            <>
              {/* PDF Printable Export Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExportModalOpen(true)}
                className="text-xs gap-1.5 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 font-bold"
              >
                <Printer className="h-3.5 w-3.5 text-amber-600" />
                <span>Export PDF / Study Sheet</span>
              </Button>

              {/* Bridge to Slide Deck Studio */}
              <Button
                asChild
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                title="Convert Knowledge Map into Teaching Presentation Slides"
              >
                <Link href={`/content-generator?fromCaseId=${currentCaseId || ''}`}>
                  <Presentation className="h-3.5 w-3.5 text-primary" />
                  <span className="hidden sm:inline">Build</span> Slides
                </Link>
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsInputExpanded((prev) => !prev)}
            className="text-xs gap-1 text-muted-foreground"
          >
            {isInputExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            <span>{isInputExpanded ? 'Collapse Input' : 'New Ingestion'}</span>
          </Button>
        </div>
      </div>

      {/* 1. Input & Material Ingestion Card */}
      {isInputExpanded && (
        <Card className="border shadow-sm">
          <CardHeader className="p-4 sm:p-5 pb-3">
            <CardTitle className="text-sm sm:text-base font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Input Material, PYQ Paper, or Subject Topic
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] font-mono border-border bg-muted/40 text-muted-foreground">
                  Model: {formatModelDisplayName(activeModel)}
                </Badge>
              </div>
            </CardTitle>
            <CardDescription className="text-xs">
              Upload multi-page PDFs, medical question sets, scanned textbook pages, or paste any complex medical topic. The AI will dissect it into an interactive hierarchical tree.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4 sm:p-5 pt-0 space-y-4">
            {/* Topic & Questions Textarea */}
            <div className="space-y-1.5" onPaste={handlePaste}>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">
                  Topic, Question, Syllabus Excerpt, or Clinical Problem:
                </Label>
                <VoiceInputButton
                  onTranscript={(txt) => {
                    const clean = txt.trim();
                    if (!clean) return;
                    setTopicInput((prev) => {
                      const cur = (prev || '').trim();
                      if (!cur) return clean;
                      if (cur.endsWith(clean)) return cur;
                      return `${cur} ${clean}`;
                    });
                  }}
                  label="Dictate Topic"
                  size="sm"
                  variant="ghost"
                />
              </div>
              <Textarea
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                placeholder="e.g., 'Cardiac Action Potential, Ion Channels, and Antiarrhythmic Drug Classifications with PYQ focus' or paste a set of 10 board exam questions..."
                className="min-h-[100px] text-xs sm:text-sm leading-relaxed"
              />
            </div>

            {/* Learning Focus Goal Selector */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setLearningGoal('comprehensive')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  learningGoal === 'comprehensive'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border bg-card hover:bg-muted/40'
                }`}
              >
                <div className="text-xs font-bold text-foreground flex items-center gap-1">
                  <Layers className="h-3 w-3 text-primary" /> Full Syllabus
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Complete domain hierarchy &amp; core sub-branches
                </p>
              </button>

              <button
                type="button"
                onClick={() => setLearningGoal('pyq_mastery')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  learningGoal === 'pyq_mastery'
                    ? 'border-amber-500 bg-amber-500/5 ring-1 ring-amber-500'
                    : 'border-border bg-card hover:bg-muted/40'
                }`}
              >
                <div className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                  <Zap className="h-3 w-3 text-amber-500" /> High-Yield PYQ
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Focus on past-year questions &amp; key trap concepts
                </p>
              </button>

              <button
                type="button"
                onClick={() => setLearningGoal('clinical_pathway')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  learningGoal === 'clinical_pathway'
                    ? 'border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500'
                    : 'border-border bg-card hover:bg-muted/40'
                }`}
              >
                <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                  <BrainCircuit className="h-3 w-3 text-emerald-500" /> Clinical Pathway
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Etiology, differential diagnosis &amp; workup tree
                </p>
              </button>

              <button
                type="button"
                onClick={() => setLearningGoal('first_principles')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  learningGoal === 'first_principles'
                    ? 'border-purple-500 bg-purple-500/5 ring-1 ring-purple-500'
                    : 'border-border bg-card hover:bg-muted/40'
                }`}
              >
                <div className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1">
                  <Atom className="h-3 w-3 text-purple-500" /> 1st Principles
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Physics &amp; biochemical ground truths
                </p>
              </button>
            </div>

            {/* File Upload Zone */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5 text-primary" /> Upload PDFs, Lecture Notes, or Medical Scans:
                </Label>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {uploadedFiles.length} file(s) attached
                </span>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:bg-muted/30 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="application/pdf,image/*"
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="hidden"
                />
                <div className="flex flex-col items-center gap-1">
                  {isProcessingPdf ? (
                    <div className="flex items-center gap-2 text-primary text-xs font-medium">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Converting PDF pages to visual analysis stream...</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground">
                        Click or drag &amp; drop PDF documents, question papers, or notes
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Supports multi-page PDFs (auto-converted), PNG, JPG, and clipboard screenshots
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Uploaded File Previews */}
              {imagePreviews.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
                  {imagePreviews.map((src, i) => (
                    <div key={i} className="relative group shrink-0 w-16 h-16 rounded-lg border overflow-hidden bg-muted">
                      <img src={src} alt="Upload preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(i);
                        }}
                        className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Audio Recording & Compression Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t">
              <div className="flex items-center gap-3">
                <AudioRecorder
                  onAudioRecorded={(audio) => {
                    setRecordedAudios((prev) => [...prev, audio]);
                    if (audio.transcription) {
                      setAudioTranscripts((prev) => [...prev, audio.transcription!]);
                    }
                  }}
                  onTranscriptReady={(transcript) => {
                    setAudioTranscripts((prev) => [...prev, transcript]);
                    setTopicInput((prev) => prev ? `${prev}\n\n[Voice Note]: ${transcript}` : transcript);
                  }}
                />
                <ImageCompressionOption
                  checked={compressImages}
                  onChange={setCompressImages}
                />
              </div>

              <div className="flex items-center gap-2">
                <ModeLanguageSelector />
                {isGenerating && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleStopGeneration}
                    className="text-xs font-bold gap-1.5 shadow-xs animate-pulse"
                    title="Stop ongoing knowledge map generation"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    <span>Stop Request</span>
                  </Button>
                )}
                <Button
                  onClick={handleGenerateKnowledgeMap}
                  disabled={isGenerating || isProcessingPdf}
                  className="text-xs font-bold gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Dissecting Knowledge...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Generate Knowledge Map</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Streaming Thinking Process Box during generation */}
      {isGenerating && (
        <AiStreamingRawLogBox
          currentStep={streamStep || 'Constructing hierarchical knowledge tree...'}
          thinkingText={streamThinking}
          streamText={streamText}
          modelName={streamModelName}
          isStreaming={true}
          onStop={handleStopGeneration}
        />
      )}

      {/* 2. Knowledge Map Workspace (Split View on Desktop, Tabs on Mobile) */}
      {knowledgeMap && (
        <div className="space-y-4">
          {/* Document Summary Card (Collapsible) */}
          {knowledgeMap.documentSummary && (
            <Card className="border shadow-xs bg-card/60">
              <CardHeader className="p-3 sm:p-4 pb-2">
                <CardTitle className="text-xs sm:text-sm font-bold flex items-center justify-between text-foreground">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4 text-primary" />
                    Document Synthesis &amp; Primary Themes: &quot;{knowledgeMap.title}&quot;
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {totalNodesCount} Topics Dissected
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0">
                <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto leading-relaxed pr-2">
                  <ClinicalMarkdownRenderer content={knowledgeMap.documentSummary} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Mobile Tab Switcher */}
          <div className="block lg:hidden">
            <Tabs
              value={mobileActiveTab}
              onValueChange={(val) => setMobileActiveTab(val as any)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-2 h-9">
                <TabsTrigger value="tree" className="text-xs gap-1.5">
                  <Network className="h-3.5 w-3.5" />
                  Knowledge Tree ({totalNodesCount})
                </TabsTrigger>
                <TabsTrigger value="study" className="text-xs gap-1.5">
                  <Atom className="h-3.5 w-3.5" />
                  Active Study Stage
                  {activeNode && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Main Content Grid: Left Tree (45%), Right Study Stage (55%) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Left Column: Interactive Hierarchical Tree View */}
            <div
              className={`lg:col-span-5 space-y-3 ${
                mobileActiveTab === 'study' ? 'hidden lg:block' : 'block'
              }`}
            >
              {/* Tree Controls Bar */}
              <div className="p-3 rounded-xl border bg-card shadow-2xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search topics, ions, mechanisms..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSetAllExpanded(true)}
                      className="h-8 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                      title="Expand all branches"
                    >
                      Expand All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSetAllExpanded(false)}
                      className="h-8 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                      title="Collapse all branches"
                    >
                      Collapse All
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono pt-1 border-t">
                  <span>{totalNodesCount} total topics</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    {totalExploredCount} explored ({Math.round((totalExploredCount / Math.max(totalNodesCount, 1)) * 100)}%)
                  </span>
                </div>
              </div>

              {/* Recursive Tree Node List */}
              <div className="space-y-2.5 max-h-[750px] overflow-y-auto pr-1">
                {filteredTree.length > 0 ? (
                  filteredTree.map((rootNode, index) => (
                    <RecursiveNodeRenderer
                      key={rootNode.id}
                      node={rootNode}
                      pathIndex={`${index + 1}`}
                      selectedNodeId={activeNodeId}
                      onSelect={(node) => {
                        setActiveNodeId(node.id);
                        setMobileActiveTab('study');
                      }}
                      onToggleExpand={handleToggleExpand}
                      onDissect={handleDissectNode}
                      onExplain={handleExplainNode}
                      onAddNote={(node) => {
                        setActiveNodeId(node.id);
                        setMobileActiveTab('study');
                      }}
                      isDissectingNodeId={isDissectingNodeId}
                      isExplainingNodeId={isExplainingNodeId}
                    />
                  ))
                ) : (
                  <div className="p-8 text-center border rounded-xl bg-card/50 text-muted-foreground text-xs">
                    No topics match &quot;{searchQuery}&quot;.
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Active Study Stage / Multi-Lens Panel */}
            <div
              className={`lg:col-span-7 min-h-[650px] ${
                mobileActiveTab === 'tree' ? 'hidden lg:block' : 'block'
              }`}
            >
              <KnowledgeStudyStage
                node={activeNode}
                lineagePath={activeLineage}
                siblingTitles={activeSiblings}
                documentSummary={knowledgeMap.documentSummary}
                onClose={() => setMobileActiveTab('tree')}
                onDissect={handleDissectNode}
                onExplain={handleExplainNode}
                onUpdateNotes={handleUpdateNotes}
                onStop={handleStopGeneration}
                isExplaining={Boolean(isExplainingNodeId && isExplainingNodeId === activeNodeId)}
                isDissecting={Boolean(isDissectingNodeId && isDissectingNodeId === activeNodeId)}
                streamThinking={streamThinking}
                streamText={streamText}
                streamStep={streamStep}
                streamModelName={streamModelName}
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. Printable PDF Export Modal with Custom Note Ruling Lines */}
      {knowledgeMap && (
        <KnowledgePdfExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          knowledgeMap={knowledgeMap}
          activeNodeId={activeNodeId}
        />
      )}
    </div>
  );
}

/**
 * Recursive tree node renderer with hierarchical indentation and connector lines.
 */
function RecursiveNodeRenderer({
  node,
  pathIndex,
  selectedNodeId,
  onSelect,
  onToggleExpand,
  onDissect,
  onExplain,
  onAddNote,
  isDissectingNodeId,
  isExplainingNodeId,
}: {
  node: KnowledgeTreeNode;
  pathIndex: string;
  selectedNodeId: string | null;
  onSelect: (node: KnowledgeTreeNode) => void;
  onToggleExpand: (nodeId: string) => void;
  onDissect: (node: KnowledgeTreeNode) => void;
  onExplain: (node: KnowledgeTreeNode, mode: 'standard' | 'first_principles' | 'simplified') => void;
  onAddNote: (node: KnowledgeTreeNode) => void;
  isDissectingNodeId: string | null;
  isExplainingNodeId: string | null;
}) {
  const isSelected = selectedNodeId === node.id;
  const isExpanded = node.isExpanded ?? true;
  const hasChildren = Boolean(node.children && node.children.length > 0);

  return (
    <div className="space-y-2">
      {/* Node Card */}
      <KnowledgeNodeCard
        node={node}
        pathIndex={pathIndex}
        isSelected={isSelected}
        onSelect={onSelect}
        onToggleExpand={onToggleExpand}
        onDissect={onDissect}
        onExplain={onExplain}
        onAddNote={onAddNote}
        isDissecting={isDissectingNodeId === node.id}
        isExplaining={isExplainingNodeId === node.id}
      />

      {/* Children Branches */}
      {hasChildren && isExpanded && (
        <div className="pl-3 sm:pl-4 border-l-2 border-border/80 ml-3.5 space-y-2 pt-0.5">
          {node.children!.map((child, idx) => (
            <RecursiveNodeRenderer
              key={child.id}
              node={child}
              pathIndex={`${pathIndex}.${idx + 1}`}
              selectedNodeId={selectedNodeId}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onDissect={onDissect}
              onExplain={onExplain}
              onAddNote={onAddNote}
              isDissectingNodeId={isDissectingNodeId}
              isExplainingNodeId={isExplainingNodeId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Tree Helper Functions
function countTotalNodes(tree: KnowledgeTreeNode[]): number {
  let count = 0;
  for (const n of tree) {
    count += 1;
    if (n.children) {
      count += countTotalNodes(n.children);
    }
  }
  return count;
}

function countExploredNodes(tree: KnowledgeTreeNode[]): number {
  let count = 0;
  for (const n of tree) {
    if (n.explanation?.standard || n.explanation?.firstPrinciples || n.explanation?.simplified) {
      count += 1;
    }
    if (n.children) {
      count += countExploredNodes(n.children);
    }
  }
  return count;
}

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

function getNodeLineageTitles(tree: KnowledgeTreeNode[], targetId: string, currentPath: string[] = []): string[] {
  for (const node of tree) {
    const nextPath = [...currentPath, node.title];
    if (node.id === targetId) return nextPath;
    if (node.children) {
      const found = getNodeLineageTitles(node.children, targetId, nextPath);
      if (found.length > 0) return found;
    }
  }
  return [];
}

function getNodeSiblingTitles(tree: KnowledgeTreeNode[], targetId: string, parentChildren: KnowledgeTreeNode[] = []): string[] {
  for (const node of tree) {
    if (node.id === targetId) {
      return parentChildren.filter((n) => n.id !== targetId).map((n) => n.title);
    }
    if (node.children) {
      const found = getNodeSiblingTitles(node.children, targetId, node.children);
      if (found.length > 0) return found;
    }
  }
  return [];
}

function insertChildrenIntoNode(
  tree: KnowledgeTreeNode[],
  targetId: string,
  newChildren: KnowledgeTreeNode[]
): KnowledgeTreeNode[] {
  return tree.map((node) => {
    if (node.id === targetId) {
      const existing = node.children || [];
      return {
        ...node,
        isExpanded: true,
        children: [...existing, ...newChildren],
      };
    }
    if (node.children) {
      return {
        ...node,
        children: insertChildrenIntoNode(node.children, targetId, newChildren),
      };
    }
    return node;
  });
}

function updateNodeExplanation(
  tree: KnowledgeTreeNode[],
  targetId: string,
  mode: 'standard' | 'first_principles' | 'simplified',
  explanationText: string
): KnowledgeTreeNode[] {
  return tree.map((node) => {
    if (node.id === targetId) {
      const currentExplanation = node.explanation || {};
      const updatedExplanation = {
        ...currentExplanation,
        [mode === 'standard' ? 'standard' : mode === 'first_principles' ? 'firstPrinciples' : 'simplified']: explanationText,
      };
      return {
        ...node,
        explanation: updatedExplanation,
      };
    }
    if (node.children) {
      return {
        ...node,
        children: updateNodeExplanation(node.children, targetId, mode, explanationText),
      };
    }
    return node;
  });
}

function updateNodeUserNotes(
  tree: KnowledgeTreeNode[],
  targetId: string,
  notes: string
): KnowledgeTreeNode[] {
  return tree.map((node) => {
    if (node.id === targetId) {
      return {
        ...node,
        explanation: {
          ...(node.explanation || {}),
          userNotes: notes,
        },
      };
    }
    if (node.children) {
      return {
        ...node,
        children: updateNodeUserNotes(node.children, targetId, notes),
      };
    }
    return node;
  });
}

function toggleNodeExpandState(tree: KnowledgeTreeNode[], targetId: string): KnowledgeTreeNode[] {
  return tree.map((node) => {
    if (node.id === targetId) {
      return {
        ...node,
        isExpanded: !(node.isExpanded ?? true),
      };
    }
    if (node.children) {
      return {
        ...node,
        children: toggleNodeExpandState(node.children, targetId),
      };
    }
    return node;
  });
}

function setAllNodesExpandState(tree: KnowledgeTreeNode[], isExpanded: boolean): KnowledgeTreeNode[] {
  return tree.map((node) => {
    return {
      ...node,
      isExpanded,
      children: node.children ? setAllNodesExpandState(node.children, isExpanded) : undefined,
    };
  });
}

function filterTreeNodes(tree: KnowledgeTreeNode[], query: string): KnowledgeTreeNode[] {
  if (!query) return tree;

  return tree
    .map((node) => {
      const matchesSelf =
        node.title.toLowerCase().includes(query) ||
        node.description?.toLowerCase().includes(query) ||
        node.pyqTag?.toLowerCase().includes(query) ||
        node.firstPrincipleAnchor?.toLowerCase().includes(query);

      const filteredChildren = node.children ? filterTreeNodes(node.children, query) : [];

      if (matchesSelf || filteredChildren.length > 0) {
        return {
          ...node,
          isExpanded: true,
          children: filteredChildren.length > 0 ? filteredChildren : node.children,
        };
      }
      return null;
    })
    .filter(Boolean) as KnowledgeTreeNode[];
}

export default function KnowledgeMapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <KnowledgeMapContent />
    </Suspense>
  );
}
