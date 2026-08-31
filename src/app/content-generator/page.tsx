'use client';

import { useState, type ChangeEvent, type ClipboardEvent, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  Wand2,
  BrainCircuit,
  PlusCircle,
  X,
  Settings,
  Sparkles,
  Layers,
  ArrowRight,
  BookOpen,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  Upload,
  Square,
  Zap,
} from 'lucide-react';
import { SlideEditor } from '@/components/SlideEditor';
import type { Slide } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/context/SettingsContext';
import { ModeLanguageSelector } from '@/components/ModeLanguageSelector';
import { LocalDataService, type LocalCase } from '@/lib/LocalDataService';
import { ClientSideAiService, formatModelDisplayName, isAbortError } from '@/lib/ClientSideAiService';
import { extractProgressiveClinicalAnswer, extractProgressiveSlides } from '@/lib/streaming-parser';
import type { StructuredQuestion, FollowUpThread } from '@/types';
import { QuestionDisplay } from '@/components/QuestionDisplay';
import { Skeleton } from '@/components/ui/skeleton';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { AudioRecorder } from '@/components/AudioRecorder';
import { AudioPlayerCard } from '@/components/AudioPlayerCard';
import { FollowUpChat } from '@/components/FollowUpChat';
import type { RecordedAudio } from '@/hooks/useAudioRecorder';
import { convertPdfToImages, isPdfFile } from '@/lib/pdf-to-images';
import { compressImagesForAi, prepareImagesForAiPrompt } from '@/lib/image-compressor';
import { ImageCompressionOption } from '@/components/ImageCompressionOption';
import { ClinicalThinkingBox } from '@/components/ClinicalThinkingBox';
import { ClinicalMarkdownRenderer } from '@/components/ClinicalMarkdownRenderer';
import Link from 'next/link';

function ContentGeneratorContent() {
  const {
    apiKey,
    aiConfig,
    isConfigured,
    activeModel,
    language,
    audienceMode,
    compressImagesForAi: isCompressionEnabled,
    setCompressImagesForAi,
    targetImageKb,
    setTargetImageKb,
    mergeImagesIntoSingle,
    setMergeImagesIntoSingle,
    mergeTargetKb,
    setMergeTargetKb,
    enableReasoning,
    setEnableReasoning,
  } = useSettings();

  const [mode, setMode] = useState<'question' | 'topic'>('question');
  const [question, setQuestion] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCase, setIsLoadingCase] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isAskingFollowUp, setIsAskingFollowUp] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Streaming & Thinking process states
  const [streamInputPrompt, setStreamInputPrompt] = useState<string>('');
  const [streamThinking, setStreamThinking] = useState<string>('');
  const [streamText, setStreamText] = useState<string>('');
  const [followUpStreamInputPrompt, setFollowUpStreamInputPrompt] = useState<string>('');
  const [followUpStreamText, setFollowUpStreamText] = useState<string>('');
  const [followUpStreamThought, setFollowUpStreamThought] = useState<string>('');
  const [streamStep, setStreamStep] = useState<string>('');
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [streamModelName, setStreamModelName] = useState<string>(() => formatModelDisplayName(activeModel));

  useEffect(() => {
    if (activeModel) {
      setStreamModelName(formatModelDisplayName(activeModel));
    }
  }, [activeModel]);

  const [result, setResult] = useState<any | null>(null);
  const [proactiveQuestions, setProactiveQuestions] = useState<string[]>([]);
  const [followUpThreads, setFollowUpThreads] = useState<FollowUpThread[]>([]);
  const [structuredQuestion, setStructuredQuestion] = useState<StructuredQuestion | null>(null);
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [presentationOutline, setPresentationOutline] = useState<string[] | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [currentCaseId, setCurrentCaseId] = useState<string | null>(null);
  const [usedTopics, setUsedTopics] = useState<string[]>([]);
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [audioDurations, setAudioDurations] = useState<Record<number, number>>({});
  const [audioTranscripts, setAudioTranscripts] = useState<Record<number, string>>({});
  const [transcribingAudioIndices, setTranscribingAudioIndices] = useState<Set<number>>(new Set());

  const processedFromCaseRef = useRef<string | null>(null);
  const loadedCaseIdRef = useRef<string | null>(null);
  const lastQuestionUpdateRef = useRef<number>(0);
  const lastSlideUpdateRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const followUpAbortControllerRef = useRef<AbortController | null>(null);

  const handleStopCurrentRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleStopFollowUp = () => {
    if (followUpAbortControllerRef.current) {
      followUpAbortControllerRef.current.abort();
      followUpAbortControllerRef.current = null;
    }
  };

  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Load case from history or bridge from AI Diagnosis
  useEffect(() => {
    const caseId = searchParams.get('caseId');
    const fromCaseId = searchParams.get('fromCaseId');
    const topicParam = searchParams.get('topic');

    if (caseId && user && loadedCaseIdRef.current !== caseId) {
      loadedCaseIdRef.current = caseId;
      const loadCase = async () => {
        setIsLoadingCase(true);
        setIsLoading(true);
        try {
          const caseData = await LocalDataService.getCase(caseId);
          if (caseData && caseData.userId === user.id) {
            setMode(caseData.inputData?.mode || 'question');
            if (caseData.inputData?.mode === 'question') {
              setQuestion(caseData.inputData?.question || '');
            } else {
              setTopic(caseData.inputData?.topic || '');
            }
            setImagePreviews(caseData.inputData?.images || []);
            setResult(caseData.outputData?.result || null);
            setSlides(caseData.outputData?.slides || null);
            setPresentationOutline(caseData.outputData?.outline || null);
            setSelectedTopics(caseData.outputData?.selectedTopics || []);
            setUsedTopics(caseData.outputData?.usedTopics || []);
            setSuggestedTopics(caseData.outputData?.suggestedTopics || []);
            setFollowUpThreads(caseData.outputData?.followUpThreads || []);

            if (caseData.outputData?.thinkingProcess) {
              setStreamThinking(caseData.outputData.thinkingProcess);
            }
            if (caseData.outputData?.streamText) {
              setStreamText(caseData.outputData.streamText);
            }

            if (caseData.outputData?.structuredQuestion) {
              setStructuredQuestion(caseData.outputData.structuredQuestion);
            }

            setCurrentCaseId(caseId);
            toast({ title: 'Case Loaded', description: `Loaded: ${caseData.title}` });
          }
        } catch (error) {
          console.error('Failed to load case:', error);
          toast({ title: 'Error', description: 'Failed to load case.', variant: 'destructive' });
        } finally {
          setIsLoading(false);
          setIsLoadingCase(false);
        }
      };
      loadCase();
    } else if (fromCaseId && user && isConfigured && processedFromCaseRef.current !== fromCaseId) {
      // Guard against multiple bridge executions
      processedFromCaseRef.current = fromCaseId;

      const bridgeFromSource = async () => {
        setIsLoading(true);
        setErrorMessage(null);
        setStreamThinking('');
        setStreamText('');
        setStreamStep('Retrieving case data to generate presentation outline...');
        setActiveStepIndex(0);

        try {
          let targetCase = await LocalDataService.getCase(fromCaseId);
          let cachedKnowledgeMap: any = null;

          if (!targetCase && typeof window !== 'undefined') {
            try {
              const raw = sessionStorage.getItem('medigen_bridge_knowledge_map');
              if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.caseId === fromCaseId || parsed.knowledgeMap) {
                  cachedKnowledgeMap = parsed.knowledgeMap;
                }
              }
            } catch (err) {
              console.warn('Could not read cached knowledge map:', err);
            }
          }

          const isKnowledgeMapCase = targetCase?.type === 'knowledge-map' || Boolean(targetCase?.outputData?.knowledgeMap) || Boolean(cachedKnowledgeMap);
          const knowledgeMapObj = targetCase?.outputData?.knowledgeMap || cachedKnowledgeMap;

          if (isKnowledgeMapCase && knowledgeMapObj) {
            const mapTitle = knowledgeMapObj.title || targetCase?.title || 'Knowledge Presentation';
            const mapSummary = knowledgeMapObj.documentSummary || targetCase?.inputData?.topic || mapTitle;
            setTopic(mapTitle);
            setQuestion(mapSummary);
            setMode('topic');
            setResult({
              topic: mapTitle,
              answer: `Teaching presentation generated directly from Knowledge Map: "${mapTitle}".`,
            });
            setStreamStep('Generating slide outline and synthesizing structured slides from Knowledge Tree...');

            const bridgeResult = await ClientSideAiService.generatePresentationFromKnowledgeMap(
              aiConfig,
              knowledgeMapObj,
              {
                language,
                audienceMode,
                onOutlineReady: (outline) => {
                  setPresentationOutline(outline);
                  setSelectedTopics(outline);
                  setSuggestedTopics(outline);
                  const placeholders = outline.map((t) => ({ title: t, content: [] }));
                  setSlides(placeholders);
                  setStreamStep('Synthesizing structured multi-slide presentation in real-time...');
                  setActiveStepIndex(1);
                },
                onStreamChunk: (payload) => {
                  if (payload.thinking) setStreamThinking(payload.thinking);
                  if (payload.model) setStreamModelName(formatModelDisplayName(payload.model));
                  if (payload.step) setStreamStep(payload.step);
                  if (payload.text) {
                    setStreamText(payload.text);
                    const progressiveSlides = extractProgressiveSlides(payload.text);
                    if (progressiveSlides.length > 0) {
                      setSlides((prev: Slide[] | null) => {
                        if (!prev || prev.length === 0) return progressiveSlides;
                        const next = [...prev];
                        for (let i = 0; i < progressiveSlides.length; i++) {
                          if (i < next.length) {
                            next[i] = progressiveSlides[i];
                          } else {
                            next.push(progressiveSlides[i]);
                          }
                        }
                        return next;
                      });
                    }
                  }
                },
              }
            );

            setPresentationOutline(bridgeResult.outline);
            setSelectedTopics(bridgeResult.outline);
            setSlides(bridgeResult.slides);
            setUsedTopics(bridgeResult.slides.map((s) => s.title));
            setSuggestedTopics(bridgeResult.outline);
            setResult({
              topic: mapTitle,
              answer: `Teaching presentation generated directly from Knowledge Map: "${mapTitle}".`,
            });

            // Save new presentation case
            const newCaseData: Partial<LocalCase> = {
              userId: user.id,
              type: 'content-generator',
              title: `Presentation: ${mapTitle}`,
              inputData: {
                mode: 'topic',
                topic: mapTitle,
                fromDiagnosisCaseId: fromCaseId,
              },
              outputData: {
                result: { topic: mapTitle, answer: `Presentation synthesized from Knowledge Tree (${bridgeResult.slides.length} slides).` },
                slides: bridgeResult.slides,
                outline: bridgeResult.outline,
                selectedTopics: bridgeResult.outline,
                usedTopics: bridgeResult.slides.map((s) => s.title),
                suggestedTopics: bridgeResult.outline,
                followUpThreads: [],
              },
            };

            const savedId = await LocalDataService.saveCase(newCaseData);
            setCurrentCaseId(savedId);
            loadedCaseIdRef.current = savedId;
            router.replace(`/content-generator?caseId=${savedId}`);
            toast({ title: 'Presentation Ready', description: `Generated ${bridgeResult.slides.length} slides from Knowledge Map.` });
          } else if (targetCase) {
            // Diagnosis case bridge
            const diagSummary = targetCase.outputData?.caseSummaryForPresentation || targetCase.title || 'Clinical Case Presentation';
            const diagTopic = targetCase.title || 'Clinical Case Study';
            setTopic(diagTopic);
            setQuestion(diagSummary);
            setMode('topic');
            setResult({
              topic: diagTopic,
              answer: `Teaching presentation generated directly from Diagnosis Case #${fromCaseId.slice(0, 6)}.`,
            });

            // Generate outline & slides directly using token-efficient bridge with live streaming
            const bridgeResult = await ClientSideAiService.generatePresentationFromCaseSummary(
              aiConfig,
              diagSummary,
              diagTopic,
              targetCase.outputData?.clinicalAnswer?.answer,
              {
                language,
                audienceMode,
                onOutlineReady: (outline) => {
                  setPresentationOutline(outline);
                  setSelectedTopics(outline);
                  setSuggestedTopics(outline);
                  const placeholders = outline.slice(0, 10).map((t) => ({ title: t, content: [] }));
                  setSlides(placeholders);
                  setStreamStep('Synthesizing structured multi-slide presentation in real-time...');
                  setActiveStepIndex(1);
                },
                onStreamChunk: (payload) => {
                  if (payload.thinking) setStreamThinking(payload.thinking);
                  if (payload.model) setStreamModelName(formatModelDisplayName(payload.model));
                  if (payload.step) setStreamStep(payload.step);
                  if (payload.text) {
                    setStreamText(payload.text);
                    const progressiveSlides = extractProgressiveSlides(payload.text);
                    if (progressiveSlides.length > 0) {
                      setSlides((prev: Slide[] | null) => {
                        if (!prev || prev.length === 0) return progressiveSlides;
                        const next = [...prev];
                        for (let i = 0; i < progressiveSlides.length; i++) {
                          if (i < next.length) {
                            next[i] = progressiveSlides[i];
                          } else {
                            next.push(progressiveSlides[i]);
                          }
                        }
                        return next;
                      });
                    }
                  }
                },
              }
            );

            setPresentationOutline(bridgeResult.outline);
            setSelectedTopics(bridgeResult.outline);
            setSlides(bridgeResult.slides);
            setUsedTopics(bridgeResult.slides.map((s) => s.title));
            setSuggestedTopics(bridgeResult.outline);
            setResult({
              topic: diagTopic,
              answer: `Teaching presentation generated directly from Diagnosis Case #${fromCaseId.slice(0, 6)}.`,
            });

            // Save new presentation case
            const newCaseData: Partial<LocalCase> = {
              userId: user.id,
              type: 'content-generator',
              title: `Presentation: ${diagTopic}`,
              inputData: {
                mode: 'topic',
                topic: diagTopic,
                fromDiagnosisCaseId: fromCaseId,
              },
              outputData: {
                result: { topic: diagTopic, answer: 'Case presentation synthesized.' },
                slides: bridgeResult.slides,
                outline: bridgeResult.outline,
                selectedTopics: bridgeResult.outline,
                usedTopics: bridgeResult.slides.map((s) => s.title),
                suggestedTopics: bridgeResult.outline,
                followUpThreads: [],
              },
            };

            const savedId = await LocalDataService.saveCase(newCaseData);
            setCurrentCaseId(savedId);
            loadedCaseIdRef.current = savedId;
            // Clean URL query param so re-renders don't trigger the bridge again
            router.replace(`/content-generator?caseId=${savedId}`);
            toast({ title: 'Presentation Ready', description: 'Generated slide deck from diagnosis summary.' });
          } else {
            toast({
              title: 'Case Not Found',
              description: 'Could not find the referenced case data to construct slides. Please select or generate a case.',
              variant: 'destructive',
            });
          }
        } catch (e: any) {
          console.error('Failed to bridge presentation:', e);
          const msg = e?.message || 'Failed to generate presentation from case.';
          setErrorMessage(msg);
          toast({ title: 'Bridge Error', description: msg, variant: 'destructive' });
        } finally {
          setIsLoading(false);
        }
      };
      bridgeFromSource();
    } else if (topicParam && !topic && !fromCaseId && !caseId) {
      setTopic(topicParam);
      setMode('topic');
    }
  }, [searchParams, user, isConfigured, aiConfig, router, toast, topic, language, audienceMode]);

  const processIncomingFiles = async (incomingFiles: File[]) => {
    if (!incomingFiles || incomingFiles.length === 0) return;
    const processedFiles: File[] = [];
    const processedPreviews: string[] = [];

    for (const file of incomingFiles) {
      if (isPdfFile(file)) {
        toast({
          title: 'Unpacking PDF Document',
          description: `Converting "${file.name}" pages into images...`,
        });
        try {
          const pageImages = await convertPdfToImages(file);
          for (const page of pageImages) {
            processedFiles.push(page.file);
            processedPreviews.push(page.dataUrl);
          }
          toast({
            title: 'PDF Unpacked',
            description: `Converted "${file.name}" into ${pageImages.length} slide image${pageImages.length > 1 ? 's' : ''}.`,
          });
        } catch (err) {
          console.error('PDF conversion failed:', err);
          processedFiles.push(file);
          processedPreviews.push(URL.createObjectURL(file));
        }
      } else {
        processedFiles.push(file);
        processedPreviews.push(URL.createObjectURL(file));
      }
    }

    setImageFiles((prev) => [...prev, ...processedFiles]);
    setImagePreviews((prev) => [...prev, ...processedPreviews]);
    toast({
      title: 'Files Attached',
      description: `Attached ${processedFiles.length} item${processedFiles.length > 1 ? 's' : ''} to slide deck context.`,
    });
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    const incomingFiles = Array.from(event.target.files);
    await processIncomingFiles(incomingFiles);
    event.target.value = '';
  };

  const handleAudioRecorded = async (audio: RecordedAudio) => {
    const newIndex = imageFiles.length;
    setImageFiles((prev) => [...prev, audio.file]);
    const audioSrc = audio.dataUri || audio.url;
    setImagePreviews((prev) => [...prev, audioSrc]);
    if (audio.duration && audio.duration > 0) {
      setAudioDurations((prev) => ({ ...prev, [newIndex]: Math.round(audio.duration) }));
    }

    toast({
      title: 'Voice Note Attached',
      description: `Attached ${audio.fileName} (${audio.duration}s). Transcribing speech to text...`,
    });

    // Auto-transcribe audio memo to text using AI Whisper/Gemini
    if (isConfigured && audioSrc) {
      setTranscribingAudioIndices((prev) => new Set(prev).add(newIndex));
      try {
        const transcript = await ClientSideAiService.transcribeAudio(
          aiConfig,
          audioSrc,
          audio.file.type || 'audio/webm'
        );
        if (transcript) {
          setAudioTranscripts((prev) => ({ ...prev, [newIndex]: transcript }));
          setQuestion((prev) =>
            prev.trim()
              ? `${prev.trim()}\n\n[Voice Dictation]:\n"${transcript}"`
              : `[Voice Dictation]:\n"${transcript}"`
          );
          toast({
            title: 'Voice Note Transcribed',
            description: 'Transcribed speech text added directly to slide inquiry!',
          });
        }
      } catch (err) {
        console.warn('Audio auto-transcription failed in content-generator:', err);
      } finally {
        setTranscribingAudioIndices((prev) => {
          const next = new Set(prev);
          next.delete(newIndex);
          return next;
        });
      }
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setImageFiles(imageFiles.filter((_, index) => index !== indexToRemove));
    setImagePreviews(imagePreviews.filter((_, index) => index !== indexToRemove));
  };

  const isAudioItem = (item: File | string, index?: number) => {
    if (index !== undefined && imageFiles[index]) {
      return imageFiles[index].type.startsWith('audio/') || /\.(webm|mp3|wav|m4a|ogg|aac|flac)$/i.test(imageFiles[index].name);
    }
    if (typeof item === 'string') {
      return item.startsWith('data:audio') || /\.(webm|mp3|wav|m4a|ogg|aac|flac)(\?.*)?$/i.test(item);
    }
    return item.type.startsWith('audio/') || /\.(webm|mp3|wav|m4a|ogg|aac|flac)$/i.test(item.name);
  };

  const getAudioFileName = (item: File | string, index: number) => {
    if (imageFiles[index]?.name) return imageFiles[index].name;
    return `Audio Note ${index + 1}`;
  };

  const handlePaste = async (event: ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const items = event.clipboardData.items;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) {
          pastedFiles.push(file);
        }
      }
    }
    if (pastedFiles.length > 0) {
      await processIncomingFiles(pastedFiles);
    }
  };

  const fileToDataUri = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleQuestionStreamChunk = (payload: { thinking?: string; text?: string; step?: string; model?: string; promptSent?: string }) => {
    if (payload.promptSent) setStreamInputPrompt(payload.promptSent);
    if (payload.thinking) setStreamThinking(payload.thinking);
    if (payload.model) setStreamModelName(formatModelDisplayName(payload.model));
    if (payload.step) setStreamStep(payload.step);
    if (payload.text) {
      setStreamText(payload.text);
      const now = Date.now();
      // Throttle heavy regex and state updates to at most once per 120ms to keep UI silky smooth
      if (now - lastQuestionUpdateRef.current > 120) {
        lastQuestionUpdateRef.current = now;
        const progressiveAnswer = extractProgressiveClinicalAnswer(payload.text);
        if (progressiveAnswer.answer) {
          setResult((prev: any) => ({
            ...prev,
            answer: progressiveAnswer.answer,
            reasoning: progressiveAnswer.reasoning || prev?.reasoning,
            topic: progressiveAnswer.topic || prev?.topic || 'Clinical Analysis',
            keyTakeaways: progressiveAnswer.keyTakeaways.length > 0 ? progressiveAnswer.keyTakeaways : (prev?.keyTakeaways || []),
          }));
        }
        if (progressiveAnswer.proactiveQuestions.length > 0) {
          setProactiveQuestions(progressiveAnswer.proactiveQuestions);
        }
      }
    }
  };

  const handleOutlineStreamChunk = (payload: { thinking?: string; text?: string; step?: string; model?: string; promptSent?: string }) => {
    if (payload.promptSent) setStreamInputPrompt(payload.promptSent);
    if (payload.thinking) setStreamThinking(payload.thinking);
    if (payload.model) setStreamModelName(formatModelDisplayName(payload.model));
    if (payload.step) setStreamStep(payload.step);
    if (payload.text) setStreamText(payload.text);
  };

  const handleSlideStreamChunk = (payload: { thinking?: string; text?: string; step?: string; model?: string; promptSent?: string }) => {
    if (payload.promptSent) setStreamInputPrompt(payload.promptSent);
    if (payload.thinking) setStreamThinking(payload.thinking);
    if (payload.model) setStreamModelName(formatModelDisplayName(payload.model));
    if (payload.step) setStreamStep(payload.step);
    if (payload.text) {
      setStreamText(payload.text);
      const now = Date.now();
      // Throttle slide parser to at most once per 150ms to prevent main thread blocking
      if (now - lastSlideUpdateRef.current > 150) {
        lastSlideUpdateRef.current = now;
        const progressiveSlides = extractProgressiveSlides(payload.text);
        if (progressiveSlides.length > 0) {
          setSlides((prev: Slide[] | null) => {
            if (!prev || prev.length === 0) return progressiveSlides;
            const next = [...prev];
            for (let i = 0; i < progressiveSlides.length; i++) {
              if (i < next.length) {
                next[i] = progressiveSlides[i];
              } else {
                next.push(progressiveSlides[i]);
              }
            }
            return next;
          });
        }
      }
    }
  };

  const handleQuestionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    if (!isConfigured) {
      const missingKeyMsg = 'Google Gemini API Key is missing. Please add your key in Settings or set GEMINI_API_KEY in your environment variables.';
      setErrorMessage(missingKeyMsg);
      toast({
        title: 'API Key Missing',
        description: 'Please set your Gemini API Key in Settings.',
        variant: 'destructive',
      });
      return;
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    setErrorMessage(null);
    setStreamThinking('');
    setStreamText('');
    setStreamStep('Analyzing clinical inquiry & attached documents...');
    setActiveStepIndex(0);

    try {
      // 1. Save original full-resolution files to local storage/history
      const imageUrls = await Promise.all(
        imageFiles.map((file) => LocalDataService.saveFile(file, user.id))
      );
      const rawImages = await Promise.all(imageFiles.map(fileToDataUri));

      // 2. Prepare images for AI API: compress down or merge into single panel based on settings
      const { processedImages: imagesForAi, summaryText: prepSummary } = await prepareImagesForAiPrompt(rawImages, {
        compressEnabled: isCompressionEnabled,
        targetKb: targetImageKb || 50,
        mergeIntoSingle: mergeImagesIntoSingle,
        mergeTargetKb: mergeTargetKb || 150,
      });

      // 3. Single efficient multimodal call (no redundant duplicate summary call)
      const response = await ClientSideAiService.answerClinicalQuestion(aiConfig, question.trim() || undefined, imagesForAi, {
        language,
        audienceMode,
        signal: controller.signal,
        onStreamChunk: handleQuestionStreamChunk,
      });

      setResult(response);
      setProactiveQuestions(response.proactiveQuestions || []);
      const summaryTitle = response.topic || (question.trim() ? question.trim().slice(0, 80) : 'Clinical Inquiry Analysis');
      // Store original full-resolution files in the structured case history
      const newStructuredQuestion = { summary: summaryTitle, images: imageUrls };
      setStructuredQuestion(newStructuredQuestion);

      const existingCase = currentCaseId ? await LocalDataService.getCase(currentCaseId) : null;
      const caseData: Partial<LocalCase> = {
        id: currentCaseId || undefined,
        userId: user.id,
        type: 'content-generator',
        title: summaryTitle,
        inputData: {
          mode: 'question',
          question: question.trim() || null,
          images: imageUrls,
          structuredQuestion: newStructuredQuestion,
        },
        outputData: {
          ...(existingCase?.outputData || {}),
          result: response,
          structuredQuestion: newStructuredQuestion,
          proactiveQuestions: response.proactiveQuestions || [],
          followUpThreads: [],
          thinkingProcess: response.thinkingProcess || streamThinking || undefined,
          streamText: streamText || undefined,
        },
      };

      const savedId = await LocalDataService.saveCase(caseData);
      if (!currentCaseId) setCurrentCaseId(savedId);
      toast({
        title: 'Answer Generated',
        description: `Clinical question analyzed successfully (${prepSummary}).`,
      });
    } catch (error: any) {
      if (isAbortError(error)) {
        setStreamStep('');
        toast({ title: 'Cancelled', description: 'Clinical answer generation was stopped by user.' });
        return;
      }
      console.error('Question submission failed:', error);
      const msg = error?.message || (typeof error === 'string' ? error : 'Failed to answer question.');
      setErrorMessage(msg);
      toast({ title: 'AI Generation Error', description: msg, variant: 'destructive', duration: 9000 });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleTopicSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    if (!isConfigured) {
      const missingKeyMsg = 'Google Gemini API Key is missing. Please add your key in Settings.';
      setErrorMessage(missingKeyMsg);
      toast({
        title: 'API Key Missing',
        description: 'Please set your Gemini API Key in Settings.',
        variant: 'destructive',
      });
      return;
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    setErrorMessage(null);
    setStreamThinking('');
    setStreamText('');
    setStreamStep('Generating postgraduate presentation outline...');
    setActiveStepIndex(0);

    try {
      const data = await ClientSideAiService.generatePresentationOutline(aiConfig, {
        topic: topic.trim(),
        language,
        audienceMode,
        signal: controller.signal,
        onStreamChunk: handleOutlineStreamChunk,
      });
      setPresentationOutline(data.outline);
      setSelectedTopics(data.outline);
      setSuggestedTopics(data.outline);
      setResult({
        answer: `Comprehensive outline generated for: **${topic}**. Review topic selections and click "Generate Presentation" below.`,
        topic: topic,
      });

      const existingCase = currentCaseId ? await LocalDataService.getCase(currentCaseId) : null;
      const caseData: Partial<LocalCase> = {
        id: currentCaseId || undefined,
        userId: user.id,
        type: 'content-generator',
        title: topic,
        inputData: {
          mode: 'topic',
          topic: topic.trim(),
        },
        outputData: {
          ...(existingCase?.outputData || {}),
          outline: data.outline,
          selectedTopics: data.outline,
          suggestedTopics: data.outline,
          result: {
            answer: `Comprehensive outline generated for: **${topic}**.`,
            topic: topic.trim(),
          },
          thinkingProcess: streamThinking || undefined,
          streamText: streamText || undefined,
        },
      };

      const savedId = await LocalDataService.saveCase(caseData);
      if (!currentCaseId) setCurrentCaseId(savedId);
    } catch (error: any) {
      if (isAbortError(error)) {
        setStreamStep('');
        toast({ title: 'Cancelled', description: 'Outline generation was stopped by user.' });
        return;
      }
      console.error('Topic submission failed:', error);
      const msg = error?.message || (typeof error === 'string' ? error : 'Failed to generate outline.');
      setErrorMessage(msg);
      toast({ title: 'AI Generation Error', description: msg, variant: 'destructive', duration: 9000 });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleGenerateOutline = async () => {
    if (!user || !isConfigured) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    setErrorMessage(null);
    setStreamThinking('');
    setStreamText('');
    setStreamStep('Building presentation outline from clinical analysis...');
    setActiveStepIndex(1);

    try {
      const data = await ClientSideAiService.generatePresentationOutline(aiConfig, {
        question: question,
        answer: result?.answer,
        reasoning: result?.reasoning,
        topic: result?.topic || topic,
        language,
        audienceMode,
        signal: controller.signal,
        onStreamChunk: handleOutlineStreamChunk,
      });
      setPresentationOutline(data.outline);
      setSelectedTopics(data.outline);
      setSuggestedTopics(data.outline);

      if (currentCaseId) {
        const caseData = await LocalDataService.getCase(currentCaseId);
        if (caseData) {
          caseData.outputData = {
            ...caseData.outputData,
            outline: data.outline,
            selectedTopics: data.outline,
            suggestedTopics: data.outline,
            structuredQuestion: structuredQuestion,
          };
          await LocalDataService.saveCase(caseData);
        }
      }
    } catch (error: any) {
      if (isAbortError(error)) {
        setStreamStep('');
        toast({ title: 'Cancelled', description: 'Outline generation was stopped by user.' });
        return;
      }
      console.error('Outline generation failed:', error);
      const msg = error?.message || (typeof error === 'string' ? error : 'Failed to generate outline.');
      setErrorMessage(msg);
      toast({ title: 'AI Generation Error', description: msg, variant: 'destructive', duration: 9000 });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleGeneratePresentation = async () => {
    if (!user || !isConfigured || selectedTopics.length === 0) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    setErrorMessage(null);
    setStreamThinking('');
    setStreamText('');
    setStreamStep('Synthesizing structured multi-slide presentation with clinical pearls & tables...');
    setActiveStepIndex(2);

    try {
      const placeholders = selectedTopics.map((t) => ({ title: t, content: [] }));
      setSlides(placeholders);

      const generatedSlides = await ClientSideAiService.generateSlideContent(aiConfig, {
        topic: result?.topic || topic,
        selectedTopics,
        fullQuestion: question,
        fullAnswer: result?.answer,
        caseSummaryForPresentation: question,
        language,
        audienceMode,
        signal: controller.signal,
        onStreamChunk: handleSlideStreamChunk,
      });

      let finalSlides = generatedSlides;
      setSlides((prev) => {
        const isGenRich = generatedSlides && generatedSlides.length > 0 && generatedSlides.some((s) => s.content && s.content.length > 0 && !s.content.some((c) => c.type === 'paragraph' && c.text.startsWith('Key details and insights for')));
        if (isGenRich) {
          finalSlides = generatedSlides;
          return generatedSlides;
        }
        const isPrevRich = prev && prev.length > 0 && prev.some((s) => s.content && s.content.length > 0 && !s.content.some((c) => c.type === 'paragraph' && c.text.startsWith('Key details and insights for')));
        if (isPrevRich) {
          finalSlides = prev;
          return prev;
        }
        finalSlides = generatedSlides;
        return generatedSlides;
      });
      setUsedTopics(selectedTopics);

      if (currentCaseId) {
        const caseData = await LocalDataService.getCase(currentCaseId);
        if (caseData) {
          caseData.outputData = {
            ...caseData.outputData,
            slides: finalSlides,
            outline: presentationOutline,
            selectedTopics: selectedTopics,
            usedTopics: selectedTopics,
            suggestedTopics: suggestedTopics.length > 0 ? suggestedTopics : presentationOutline,
            structuredQuestion: structuredQuestion,
            thinkingProcess: streamThinking || undefined,
            streamText: streamText || undefined,
          };
          await LocalDataService.saveCase(caseData);
        }
      }
      toast({ title: 'Presentation Generated', description: 'Your slide deck has been saved locally.' });
    } catch (error: any) {
      if (isAbortError(error)) {
        setStreamStep('');
        toast({ title: 'Cancelled', description: 'Presentation generation was stopped by user.' });
        return;
      }
      console.error('Presentation generation failed:', error);
      const msg = error?.message || (typeof error === 'string' ? error : 'Failed to generate slides.');
      setErrorMessage(msg);
      toast({ title: 'AI Generation Error', description: msg, variant: 'destructive', duration: 9000 });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleAskFollowUp = async (q: string, images?: string[]) => {
    if (!isConfigured || isAskingFollowUp || !user) return;
    const controller = new AbortController();
    followUpAbortControllerRef.current = controller;
    setIsAskingFollowUp(true);
    setFollowUpStreamInputPrompt('');
    setFollowUpStreamText('');
    setFollowUpStreamThought('');
    try {
      const conversationHistory = followUpThreads.map((t) => ({
        question: t.question,
        answer: t.answer,
      }));

      const followUpRes = await ClientSideAiService.answerClinicalFollowUp(aiConfig, {
        originalQuestion: question || topic,
        originalAnswer: result?.answer,
        diagnosesSummary: result?.topic,
        userFollowUp: q,
        images,
        conversationHistory,
        language,
        audienceMode,
        signal: controller.signal,
        onStreamChunk: (payload) => {
          if (payload.promptSent) setFollowUpStreamInputPrompt(payload.promptSent);
          if (payload.text) setFollowUpStreamText(payload.text);
          if (payload.thinking) setFollowUpStreamThought(payload.thinking);
        },
      });

      const newThread: FollowUpThread = {
        id: Date.now().toString(),
        question: q,
        answer: followUpRes.answer,
        reasoning: followUpRes.reasoning,
        thinkingProcess: followUpRes.thinkingProcess || followUpStreamThought || undefined,
        timestamp: Date.now(),
        source: 'diagnosis',
      };

      const updatedThreads = [...followUpThreads, newThread];
      setFollowUpThreads(updatedThreads);

      if (followUpRes.suggestedFollowUps && followUpRes.suggestedFollowUps.length > 0) {
        setProactiveQuestions(followUpRes.suggestedFollowUps);
      }

      if (currentCaseId) {
        const caseData = await LocalDataService.getCase(currentCaseId);
        if (caseData) {
          caseData.outputData = {
            ...caseData.outputData,
            followUpThreads: updatedThreads,
            proactiveQuestions: followUpRes.suggestedFollowUps || proactiveQuestions,
          };
          await LocalDataService.saveCase(caseData);
        }
      }
    } catch (e: any) {
      if (isAbortError(e)) {
        toast({ title: 'Cancelled', description: 'Follow-up inquiry was stopped by user.' });
        return;
      }
      console.error('Follow-up error:', e);
      toast({ title: 'Error', description: 'Failed to answer follow-up.', variant: 'destructive' });
    } finally {
      setIsAskingFollowUp(false);
      followUpAbortControllerRef.current = null;
      setFollowUpStreamText('');
      setFollowUpStreamThought('');
    }
  };

  const handleNewCase = () => {
    processedFromCaseRef.current = null;
    loadedCaseIdRef.current = null;
    setMode('question');
    setQuestion('');
    setImageFiles([]);
    setImagePreviews([]);
    setTopic('');
    setResult(null);
    setSlides(null);
    setCurrentCaseId(null);
    setStructuredQuestion(null);
    setPresentationOutline(null);
    setSelectedTopics([]);
    setUsedTopics([]);
    setSuggestedTopics([]);
    setFollowUpThreads([]);
    router.push('/content-generator');
  };

  const formatText = (text: string) => {
    if (!text) return '';
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br />');
  };

  if (authLoading || (!user && !searchParams.get('caseId'))) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-3 sm:px-4 py-6 sm:py-8 space-y-6">
      {errorMessage && (
        <Card className="border-destructive/60 bg-destructive/10 text-destructive shadow-xs animate-in fade-in slide-in-from-top-2">
          <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-semibold text-sm text-destructive">
                  Clinical AI Generation Issue
                </h4>
                <p className="text-xs text-destructive/90 break-words leading-relaxed">
                  {errorMessage}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setErrorMessage(null)}
                className="h-8 text-xs border-destructive/30 hover:bg-destructive/15 text-destructive"
              >
                Dismiss
              </Button>
              <Button
                asChild
                size="sm"
                className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <Link href="/settings">Check Settings</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isConfigured && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Settings className="h-6 w-6 text-yellow-600 shrink-0" />
                <div>
                  <h3 className="font-bold text-yellow-800 dark:text-yellow-200 text-sm sm:text-base">
                    Gemini API Key Required
                  </h3>
                  <p className="text-xs sm:text-sm text-yellow-700 dark:text-yellow-300">
                    To generate postgraduate slide decks and clinical outlines, configure your Gemini API key.
                  </p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="border-yellow-600 text-yellow-800 hover:bg-yellow-100 dark:text-yellow-200">
                <Link href="/settings">Settings</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Input Mode Tabs Card */}
      {!result && !isLoading && (
        <Card className="border shadow-sm">
          <CardHeader className="p-4 sm:p-6 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  Medical Content & Slide Generator
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Generate clinical presentations, viva outlines, or deep answers for medical topics.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-2 space-y-4">
            <ModeLanguageSelector />
            <Tabs value={mode} onValueChange={(v) => setMode(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="question" className="text-xs sm:text-sm">
                  Clinical Question & Case
                </TabsTrigger>
                <TabsTrigger value="topic" className="text-xs sm:text-sm">
                  Medical Topic & Outline
                </TabsTrigger>
              </TabsList>

              <TabsContent value="question" className="space-y-4">
                <form onSubmit={handleQuestionSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="clinical-question" className="text-xs font-semibold">
                        Clinical Question or Case Details
                      </Label>
                      <div className="flex items-center gap-1.5">
                        <VoiceInputButton
                          onTranscript={(text) => {
                            const clean = text.trim();
                            if (!clean) return;
                            setQuestion((prev) => {
                              const cur = (prev || '').trim();
                              if (!cur) return clean;
                              if (cur.endsWith(clean)) return cur;
                              return `${cur} ${clean}`;
                            });
                          }}
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7"
                        />
                      </div>
                    </div>
                    <div
                      className="relative rounded-md transition-all"
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingOver(true);
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingOver(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                        setIsDraggingOver(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingOver(false);
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                          processIncomingFiles(Array.from(e.dataTransfer.files));
                        }
                      }}
                    >
                      <Textarea
                        id="clinical-question"
                        placeholder="Enter a clinical inquiry, ECG interpretation question, or case vignette..."
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        onPaste={handlePaste}
                        className={`min-h-[120px] text-xs sm:text-sm resize-none transition-all ${
                          isDraggingOver
                            ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                            : ''
                        }`}
                      />

                      {isDraggingOver && (
                        <div className="absolute inset-0 z-20 rounded-md bg-primary/10 border-2 border-dashed border-primary flex flex-col items-center justify-center p-4 backdrop-blur-2xs animate-in fade-in zoom-in-95 duration-150 pointer-events-none">
                          <div className="p-2.5 rounded-full bg-primary text-primary-foreground shadow-xs mb-1.5 animate-bounce">
                            <Upload className="h-5 w-5" />
                          </div>
                          <p className="text-xs font-bold text-primary">
                            Drop PDF, Images, or Audio to Attach
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            PDFs will be unpacked page-by-page automatically into slides
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Tip: Drag &amp; drop PDFs or images directly into the text box above to attach.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label className="text-xs font-semibold">Attached Images, Audio Memos & Reports</Label>
                      <AudioRecorder
                        onAudioRecorded={handleAudioRecorded}
                        onTranscribe={(text) =>
                          setQuestion((prev) => (prev ? `${prev}\n\n[Dictation]: ${text}` : text))
                        }
                      />
                    </div>

                    {/* Audio Attachments List */}
                    {imagePreviews.some((preview, i) => isAudioItem(preview, i)) && (
                      <div className="space-y-2 pt-1 w-full max-w-full overflow-hidden">
                        {imagePreviews.map((preview, index) => {
                          if (!isAudioItem(preview, index)) return null;
                          return (
                            <AudioPlayerCard
                              key={index}
                              src={preview}
                              fileName={getAudioFileName(preview, index)}
                              duration={audioDurations[index]}
                              transcript={audioTranscripts[index]}
                              isTranscribing={transcribingAudioIndices.has(index)}
                              onTranscriptGenerated={(t) => {
                                setAudioTranscripts((prev) => ({ ...prev, [index]: t }));
                              }}
                              onInsertTranscript={(t) =>
                                setQuestion((prev) => (prev ? `${prev}\n\n[Dictation]: ${t}` : t))
                              }
                              onRemove={() => handleRemoveImage(index)}
                            />
                          );
                        })}
                      </div>
                    )}

                    {/* Images and Documents */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {imagePreviews.map((preview, index) => {
                        if (isAudioItem(preview, index)) return null;
                        return (
                          <div key={index} className="relative h-16 w-16 overflow-hidden rounded-lg border shadow-xs">
                            <img src={preview} alt={`Preview ${index}`} className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(index)}
                              className="absolute right-1 top-1 rounded-full bg-red-600 hover:bg-red-700 p-0.5 text-white shadow-xs transition-colors z-10"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                      <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed hover:bg-muted/60 transition-colors">
                        <span className="text-[10px] text-muted-foreground font-medium">+ Add File</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*,application/pdf,audio/*"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Image compression and multi-image stitching toggle for AI token optimization */}
                    {imageFiles.length > 0 && (
                      <div className="pt-1.5">
                        <ImageCompressionOption
                          enabled={isCompressionEnabled}
                          onToggle={setCompressImagesForAi}
                          targetKb={targetImageKb || 50}
                          onTargetKbChange={setTargetImageKb}
                          mergeIntoSingle={mergeImagesIntoSingle}
                          onMergeToggle={setMergeImagesIntoSingle}
                          mergeTargetKb={mergeTargetKb || 150}
                          onMergeTargetKbChange={setMergeTargetKb}
                          attachedImages={imageFiles.filter((f) => !f.type.startsWith('audio/'))}
                          attachedCount={imageFiles.filter((f) => !f.type.startsWith('audio/')).length}
                        />
                      </div>
                    )}
                  </div>

                  {/* Reasoning / Response Speed Quick Toggle Bar */}
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/40 border border-border/70 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Zap className={`h-3.5 w-3.5 shrink-0 ${!enableReasoning ? 'text-amber-500 fill-amber-500/20' : 'text-indigo-500'}`} />
                      <span className="font-semibold text-foreground text-[11px] truncate">
                        {!enableReasoning ? 'Fast Response Mode' : 'Clinical Reasoning Mode'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEnableReasoning(!enableReasoning)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border shrink-0 flex items-center gap-1.5 ${
                        !enableReasoning
                          ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40 shadow-2xs'
                          : 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border-indigo-500/40'
                      }`}
                      title={!enableReasoning ? 'Reasoning is turned OFF: click to enable deep clinical reasoning' : 'Reasoning is turned ON: click to turn off reasoning for ultra-fast instant answers'}
                    >
                      {!enableReasoning ? (
                        <>
                          <Zap className="h-3 w-3 fill-amber-500 text-amber-500" />
                          <span>Reasoning: OFF (Fast)</span>
                        </>
                      ) : (
                        <>
                          <BrainCircuit className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                          <span>Reasoning: ON (Deep)</span>
                        </>
                      )}
                    </button>
                  </div>

                  {isLoading ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleStopCurrentRequest}
                      className="w-full h-10 text-xs sm:text-sm font-semibold shadow-xs gap-2"
                      title="Stop request"
                    >
                      <Square className="h-4 w-4 fill-current" />
                      <span>Stop Analysis</span>
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      className="w-full h-10 text-xs sm:text-sm font-semibold shadow-xs"
                      disabled={!question.trim() && imageFiles.length === 0}
                    >
                      <BrainCircuit className="mr-2 h-4 w-4" />
                      Analyze & Generate Clinical Answer
                    </Button>
                  )}
                </form>
              </TabsContent>

              <TabsContent value="topic" className="space-y-4">
                <form onSubmit={handleTopicSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="medical-topic" className="text-xs font-semibold">
                        Medical Presentation Topic
                      </Label>
                      <VoiceInputButton
                        onTranscript={(text) => {
                          const clean = text.trim();
                          if (!clean) return;
                          setTopic((prev) => {
                            const cur = (prev || '').trim();
                            if (!cur) return clean;
                            if (cur.endsWith(clean)) return cur;
                            return `${cur} ${clean}`;
                          });
                        }}
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7"
                      />
                    </div>
                    <Input
                      id="medical-topic"
                      placeholder="e.g. Acute Aortic Syndromes, ARDS Berlin Criteria & Mechanical Ventilation, Diabetic Nephropathy"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      className="h-10 text-xs sm:text-sm"
                    />
                  </div>

                  {/* Reasoning / Response Speed Quick Toggle Bar */}
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/40 border border-border/70 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Zap className={`h-3.5 w-3.5 shrink-0 ${!enableReasoning ? 'text-amber-500 fill-amber-500/20' : 'text-indigo-500'}`} />
                      <span className="font-semibold text-foreground text-[11px] truncate">
                        {!enableReasoning ? 'Fast Response Mode' : 'Clinical Reasoning Mode'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEnableReasoning(!enableReasoning)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border shrink-0 flex items-center gap-1.5 ${
                        !enableReasoning
                          ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40 shadow-2xs'
                          : 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border-indigo-500/40'
                      }`}
                      title={!enableReasoning ? 'Reasoning is turned OFF: click to enable deep clinical reasoning' : 'Reasoning is turned ON: click to turn off reasoning for ultra-fast instant answers'}
                    >
                      {!enableReasoning ? (
                        <>
                          <Zap className="h-3 w-3 fill-amber-500 text-amber-500" />
                          <span>Reasoning: OFF (Fast)</span>
                        </>
                      ) : (
                        <>
                          <BrainCircuit className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                          <span>Reasoning: ON (Deep)</span>
                        </>
                      )}
                    </button>
                  </div>

                  {isLoading ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleStopCurrentRequest}
                      className="w-full h-10 text-xs sm:text-sm font-semibold shadow-xs gap-2"
                      title="Stop request"
                    >
                      <Square className="h-4 w-4 fill-current" />
                      <span>Stop Generating Outline</span>
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      className="w-full h-10 text-xs sm:text-sm font-semibold shadow-xs"
                      disabled={!topic.trim()}
                    >
                      <Wand2 className="mr-2 h-4 w-4" />
                      Generate Presentation Outline
                    </Button>
                  )}
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Case Loading State */}
      {isLoadingCase && (
        <Card className="border border-primary/20 bg-card p-6 shadow-xs flex flex-col items-center justify-center text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-foreground">Case is being loaded...</p>
            <p className="text-xs text-muted-foreground">Retrieving clinical answer, presentation outline, and slide records</p>
          </div>
        </Card>
      )}

      {/* Loading State with Real-Time Thinking & Streaming Process */}
      {isLoading && !isLoadingCase && !result && !slides && (
        <div className="space-y-4 py-2">
          <Card className="border border-primary/20 bg-card p-6 shadow-xs flex flex-col items-center justify-center text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">Content is getting generated...</p>
              <p className="text-xs text-muted-foreground">
                {streamStep || 'Consultant AI analyzing clinical guidelines & synthesizing content...'}
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleStopCurrentRequest}
              className="h-8 text-xs font-semibold gap-1.5 shadow-xs"
              title="Stop current generation"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>Stop Request</span>
            </Button>
          </Card>
          {(isLoading || streamThinking || streamText || streamInputPrompt) && (
            <ClinicalThinkingBox
              isLoading={isLoading}
              inputPrompt={streamInputPrompt}
              thinkingText={streamThinking}
              streamText={streamText}
              currentStep={streamStep || 'Consultant AI analyzing clinical guidelines & generating content...'}
              activeStepIndex={activeStepIndex}
              modelName={streamModelName}
              title="Clinical AI Live Reasoning & Evidence Synthesis"
              permanent={true}
              onStop={handleStopCurrentRequest}
            />
          )}
        </div>
      )}

      {/* Result Display & Outline / Presentation Flow */}
      {result && (
        <div className="space-y-6">
          <Card className="border shadow-sm">
            <CardHeader className="p-4 sm:p-6 pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
                    <BrainCircuit className="h-5 w-5 text-primary" />
                    {result.topic || 'Clinical Topic'}
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Medical content analysis and presentation builder.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleNewCase} className="text-xs shrink-0">
                  <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> New Case
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-6">
              {structuredQuestion && (
                <QuestionDisplay
                  summary={structuredQuestion.summary}
                  images={structuredQuestion.images}
                />
              )}

              <ClinicalMarkdownRenderer content={result.answer} />

              {/* Generate Outline Button (if not yet generated) */}
              {!slides && !presentationOutline && !isLoading && (
                <Button onClick={handleGenerateOutline} className="h-10 text-xs sm:text-sm gap-2 font-semibold shadow-xs">
                  <Layers className="h-4 w-4" />
                  Generate Multi-Slide Presentation Outline
                </Button>
              )}

              {/* Live Streaming & Thinking for Outline or Slide Generation */}
              {(isLoading || streamThinking || streamText || streamInputPrompt) && (
                <div className="pt-2">
                  <ClinicalThinkingBox
                    isLoading={isLoading}
                    inputPrompt={streamInputPrompt}
                    thinkingText={streamThinking}
                    streamText={streamText}
                    currentStep={streamStep || 'Synthesizing postgraduate slides & structured evidence...'}
                    activeStepIndex={activeStepIndex}
                    modelName={streamModelName}
                    title="Live Clinical Reasoning & Evidence Synthesis"
                    permanent={true}
                    onStop={handleStopCurrentRequest}
                    defaultExpanded={isLoading}
                    defaultThinkingExpanded={true}
                    defaultRawExpanded={false}
                  />
                </div>
              )}

              {/* Topic Selection Checklist */}
              {presentationOutline && (!slides || slides.length === 0) && (
                <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm sm:text-base flex items-center gap-2 text-foreground">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Select Topics to Build Presentation Deck
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Select which high-yield modules you wish to render as full presentation slides.
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (selectedTopics.length === presentationOutline.length) {
                          setSelectedTopics([]);
                        } else {
                          setSelectedTopics(presentationOutline);
                        }
                      }}
                      className="text-xs"
                    >
                      {selectedTopics.length === presentationOutline.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                    {presentationOutline.map((t, i) => {
                      const isUsed = usedTopics.includes(t);
                      const isChecked = selectedTopics.includes(t);
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs sm:text-sm transition-all ${
                            isUsed ? 'bg-muted/50 opacity-60' : 'bg-background hover:bg-accent/40'
                          }`}
                        >
                          <input
                            type="checkbox"
                            id={`outline-topic-${i}`}
                            checked={isUsed || isChecked}
                            disabled={isUsed}
                            onChange={() =>
                              setSelectedTopics((prev) =>
                                prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                              )
                            }
                            className="rounded h-4 w-4 text-primary focus:ring-primary"
                          />
                          <label
                            htmlFor={`outline-topic-${i}`}
                            className={`cursor-pointer flex-1 font-medium ${
                              isUsed ? 'line-through text-muted-foreground' : 'text-foreground'
                            }`}
                          >
                            {t} {isUsed && <span className="text-[10px] text-muted-foreground font-normal">(Generated)</span>}
                          </label>
                        </div>
                      );
                    })}
                  </div>

                  {isLoading ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleStopCurrentRequest}
                      className="w-full sm:w-auto h-10 text-xs sm:text-sm font-semibold gap-2 shadow-xs"
                      title="Stop slide generation"
                    >
                      <Square className="h-4 w-4 fill-current" />
                      <span>Stop Generating Slides</span>
                    </Button>
                  ) : (
                    <Button
                      onClick={handleGeneratePresentation}
                      disabled={selectedTopics.length === 0}
                      className="w-full sm:w-auto h-10 text-xs sm:text-sm font-semibold gap-2 shadow-xs"
                    >
                      <ArrowRight className="h-4 w-4" />
                      Generate Presentation ({selectedTopics.length} Slides)
                    </Button>
                  )}
                </div>
              )}

              {/* Render Full Interactive Slide Presentation Deck */}
              {slides && slides.length > 0 && (
                <SlideEditor
                  initialSlides={slides}
                  topic={result.topic || topic}
                  caseId={currentCaseId}
                  questionContext={question}
                  outline={presentationOutline || []}
                  initialSuggestedTopics={suggestedTopics}
                  initialUsedTopics={usedTopics}
                  onRefresh={() => handleGeneratePresentation()}
                  onNewCase={handleNewCase}
                  onUpdate={async (data) => {
                    if (!currentCaseId) return;
                    const caseData = await LocalDataService.getCase(currentCaseId);
                    if (!caseData) return;

                    const updatedOutputData = { ...caseData.outputData };

                    if (data.slides) {
                      setSlides(data.slides);
                      updatedOutputData.slides = data.slides;
                    }
                    if (data.suggestedTopics) {
                      setSuggestedTopics(data.suggestedTopics);
                      updatedOutputData.suggestedTopics = data.suggestedTopics;
                    }
                    if (data.usedTopics) {
                      setUsedTopics(data.usedTopics);
                      updatedOutputData.usedTopics = data.usedTopics;
                    }

                    caseData.outputData = updatedOutputData;
                    await LocalDataService.saveCase(caseData);
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* Interactive Follow-Up Engine */}
          <FollowUpChat
            proactiveQuestions={proactiveQuestions}
            threads={followUpThreads}
            onAskFollowUp={handleAskFollowUp}
            onStop={handleStopFollowUp}
            isLoading={isAskingFollowUp}
            inputPrompt={followUpStreamInputPrompt}
            streamingText={followUpStreamText}
            streamingThought={followUpStreamThought}
            title="Clinical Inquiries & Q&A"
            description="Explore guidelines, pathophysiology mechanisms, or ask custom questions regarding this topic."
            sourceContext="slide"
          />
        </div>
      )}
    </div>
  );
}

export default function ContentGeneratorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <ContentGeneratorContent />
    </Suspense>
  );
}
