'use client';

import { useState, type ChangeEvent, type ClipboardEvent, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { DiagnosisCard } from '@/components/DiagnosisCard';
import { ReportParameterAnalysis } from '@/components/ReportParameterAnalysis';
import { ClinicalMarkdownRenderer } from '@/components/ClinicalMarkdownRenderer';
import { ClinicalThinkingBox } from '@/components/ClinicalThinkingBox';
import { AiStreamingRawLogBox } from '@/components/AiStreamingRawLogBox';
import {
  FileText,
  Loader2,
  Upload,
  PlusCircle,
  BrainCircuit,
  Lightbulb,
  Copy,
  X,
  Settings,
  Presentation,
  CheckCircle2,
  Sparkles,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  ClipboardList,
  FlaskConical,
  Activity,
  Layers,
  Square,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/context/SettingsContext';
import { ModeLanguageSelector } from '@/components/ModeLanguageSelector';
import { LocalDataService, type LocalCase } from '@/lib/LocalDataService';
import { ClientSideAiService, extractProgressiveDiagnosis, isAbortError } from '@/lib/ClientSideAiService';
import { convertPdfToImages, isPdfFile } from '@/lib/pdf-to-images';
import { compressImagesForAi, prepareImagesForAiPrompt } from '@/lib/image-compressor';
import { ImageCompressionOption } from '@/components/ImageCompressionOption';
import type {
  StructuredQuestion,
  DiagnosisItem,
  ClinicalAnswerData,
  FollowUpThread,
  ReportKnowledgeData,
} from '@/types';
import { QuestionDisplay } from '@/components/QuestionDisplay';
import { SpeechSynthesisButton } from '@/components/SpeechSynthesisButton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { AudioRecorder } from '@/components/AudioRecorder';
import { AudioPlayerCard } from '@/components/AudioPlayerCard';
import { FollowUpChat } from '@/components/FollowUpChat';
import type { RecordedAudio } from '@/hooks/useAudioRecorder';
import Link from 'next/link';

const PROGRESS_MESSAGES = [
  '📋 Reading clinical notes & patient history...',
  '🔬 Analyzing lab values & imaging parameters...',
  '🧠 Generating differential diagnoses & likelihoods...',
  '📊 Ranking pre-test probabilities & blind spots...',
  '✅ Synthesizing guideline-directed management...',
];

function AiDiagnosisContent() {
  const [patientData, setPatientData] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCase, setIsLoadingCase] = useState(false);
  const [isAnalyzingReport, setIsAnalyzingReport] = useState(false);
  const [isConvertingPdf, setIsConvertingPdf] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isAskingFollowUp, setIsAskingFollowUp] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [results, setResults] = useState<DiagnosisItem[] | null>(null);
  const [clinicalAnswer, setClinicalAnswer] = useState<ClinicalAnswerData | null>(null);
  const [reportKnowledge, setReportKnowledge] = useState<ReportKnowledgeData | null>(null);
  const [activeOutputTab, setActiveOutputTab] = useState<'diagnosis' | 'report'>('diagnosis');
  const [proactiveQuestions, setProactiveQuestions] = useState<string[]>([]);
  const [audioDurations, setAudioDurations] = useState<Record<number, number>>({});
  const [audioTranscripts, setAudioTranscripts] = useState<Record<number, string>>({});
  const [transcribingAudioIndices, setTranscribingAudioIndices] = useState<Set<number>>(new Set());
  const [caseSummaryForPresentation, setCaseSummaryForPresentation] = useState<string>('');
  const [followUpThreads, setFollowUpThreads] = useState<FollowUpThread[]>([]);
  const [structuredQuestion, setStructuredQuestion] = useState<StructuredQuestion | null>(null);
  const [currentCaseId, setCurrentCaseId] = useState<string | null>(null);
  const [progressStep, setProgressStep] = useState(0);
  const [streamingThought, setStreamingThought] = useState<string>('');
  const [streamingText, setStreamingText] = useState<string>('');
  const [streamingStatus, setStreamingStatus] = useState<string>('');
  const [followUpStreamText, setFollowUpStreamText] = useState<string>('');
  const [followUpStreamThought, setFollowUpStreamThought] = useState<string>('');
  const [thinkingProcess, setThinkingProcess] = useState<string | undefined>(undefined);
  const loadedCaseIdRef = useRef<string | null>(null);
  const lastDiagStreamUpdateRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const followUpAbortControllerRef = useRef<AbortController | null>(null);

  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const {
    aiConfig,
    isConfigured,
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
    enableStreamingOutput,
    enableLiveThinking,
    enableReasoning,
    setEnableReasoning,
  } = useSettings();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const caseId = searchParams.get('caseId');
    if (caseId && user && loadedCaseIdRef.current !== caseId) {
      loadedCaseIdRef.current = caseId;
      const loadCase = async () => {
        setIsLoadingCase(true);
        setIsLoading(true);
        try {
          const caseData = await LocalDataService.getCase(caseId);
          if (caseData && caseData.userId === user.id) {
            setPatientData(caseData.inputData?.patientData || '');
            if (caseData.inputData?.structuredQuestion) {
              setStructuredQuestion({
                ...caseData.inputData.structuredQuestion,
                images: caseData.inputData.supportingDocuments || [],
              });
            } else {
              setStructuredQuestion(null);
            }
            setFilePreviews(caseData.inputData?.supportingDocuments || []);
            setResults(caseData.outputData?.diagnoses || null);
            setClinicalAnswer(caseData.outputData?.clinicalAnswer || null);
            setReportKnowledge(caseData.outputData?.reportKnowledge || null);
            setProactiveQuestions(caseData.outputData?.proactiveQuestions || []);
            setCaseSummaryForPresentation(caseData.outputData?.caseSummaryForPresentation || '');
            setFollowUpThreads(caseData.outputData?.followUpThreads || []);
            setThinkingProcess(caseData.outputData?.thinkingProcess || undefined);
            if (caseData.outputData?.streamText) {
              setStreamingText(caseData.outputData.streamText);
            }
            if (caseData.outputData?.thinkingProcess) {
              setStreamingThought(caseData.outputData.thinkingProcess);
            }
            setCurrentCaseId(caseId);

            if (caseData.outputData?.reportKnowledge && (!caseData.outputData?.diagnoses || caseData.outputData.diagnoses.length === 0)) {
              setActiveOutputTab('report');
            } else {
              setActiveOutputTab('diagnosis');
            }

            toast({ title: 'Case Loaded', description: `Loaded: ${caseData.title}` });
          } else {
            toast({ title: 'Error', description: 'Could not find case.', variant: 'destructive' });
            router.push('/ai-diagnosis');
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
    }
  }, [searchParams, user, router, toast]);

  useEffect(() => {
    if (!isLoading && !isAnalyzingReport) {
      setProgressStep(0);
      return;
    }
    const interval = setInterval(() => {
      setProgressStep((prev) => (prev < PROGRESS_MESSAGES.length - 1 ? prev + 1 : prev));
    }, 4500);
    return () => clearInterval(interval);
  }, [isLoading, isAnalyzingReport]);

  const processIncomingFiles = async (incomingFiles: File[]) => {
    if (!incomingFiles || incomingFiles.length === 0) return;
    const processedFiles: File[] = [];
    const processedPreviews: string[] = [];

    for (const file of incomingFiles) {
      if (isPdfFile(file)) {
        setIsConvertingPdf(true);
        toast({
          title: 'Unpacking PDF Document',
          description: `Rendering pages of "${file.name}" as separate images for visual AI analysis...`,
        });
        try {
          const pageImages = await convertPdfToImages(file);
          for (const page of pageImages) {
            processedFiles.push(page.file);
            processedPreviews.push(page.dataUrl);
          }
          toast({
            title: 'PDF Unpacked',
            description: `Converted "${file.name}" into ${pageImages.length} separate page image${pageImages.length > 1 ? 's' : ''}.`,
          });
        } catch (err) {
          console.error('PDF conversion failed:', err);
          toast({
            title: 'PDF Processing Notice',
            description: `Could not unpack PDF pages: ${err instanceof Error ? err.message : 'Unknown error'}. Attached original file.`,
            variant: 'destructive',
          });
          processedFiles.push(file);
          processedPreviews.push(URL.createObjectURL(file));
        } finally {
          setIsConvertingPdf(false);
        }
      } else {
        processedFiles.push(file);
        processedPreviews.push(URL.createObjectURL(file));
      }
    }

    setFiles((prev) => [...prev, ...processedFiles]);
    setFilePreviews((prev) => [...prev, ...processedPreviews]);
    toast({
      title: 'Files Attached',
      description: `Attached ${processedFiles.length} item${processedFiles.length > 1 ? 's' : ''} to clinical workup.`,
    });
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    const incomingFiles = Array.from(event.target.files);
    await processIncomingFiles(incomingFiles);
    event.target.value = '';
  };

  const handleAudioRecorded = async (audio: RecordedAudio) => {
    const newIndex = files.length;
    setFiles((prev) => [...prev, audio.file]);
    const audioSrc = audio.dataUri || audio.url;
    setFilePreviews((prev) => [...prev, audioSrc]);
    if (audio.duration && audio.duration > 0) {
      setAudioDurations((prev) => ({ ...prev, [newIndex]: Math.round(audio.duration) }));
    }

    toast({
      title: 'Voice Memo Attached',
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
          setPatientData((prev) =>
            prev.trim()
              ? `${prev.trim()}\n\n[Voice Dictation]:\n"${transcript}"`
              : `[Voice Dictation]:\n"${transcript}"`
          );
          toast({
            title: 'Voice Memo Transcribed',
            description: 'Transcribed speech text added directly to clinical notes!',
          });
        }
      } catch (err) {
        console.warn('Audio auto-transcription failed:', err);
      } finally {
        setTranscribingAudioIndices((prev) => {
          const next = new Set(prev);
          next.delete(newIndex);
          return next;
        });
      }
    }
  };

  const handleRemoveFile = (indexToRemove: number) => {
    setFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
    setFilePreviews((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const isAudioItem = (item: File | string, index?: number) => {
    if (index !== undefined && files[index]) {
      return files[index].type.startsWith('audio/') || /\.(webm|mp3|wav|m4a|ogg|aac|flac)$/i.test(files[index].name);
    }
    if (typeof item === 'string') {
      return item.startsWith('data:audio') || /\.(webm|mp3|wav|m4a|ogg|aac|flac)(\?.*)?$/i.test(item);
    }
    return item.type.startsWith('audio/') || /\.(webm|mp3|wav|m4a|ogg|aac|flac)$/i.test(item.name);
  };

  const getFileName = (item: File | string, index: number) => {
    if (files[index]?.name) return files[index].name;
    return `Audio Note ${index + 1}`;
  };

  const handlePaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
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

  /**
   * Action 1: Dedicated Report Knowledge & Parameter Breakdown
   */
  const handleAnalyzeReportOnly = async () => {
    if (!user) return;
    if (!isConfigured) {
      const missingKeyMsg = 'Google Gemini API Key is missing. Please add your key in Settings.';
      setErrorMessage(missingKeyMsg);
      toast({ title: 'API Key Missing', description: 'Please set your Gemini API Key in Settings.', variant: 'destructive' });
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsAnalyzingReport(true);
    setErrorMessage(null);
    setStreamingThought('');
    setStreamingText('');
    setStreamingStatus('Extracting lab parameters, biomarkers, and reference ranges...');
    try {
      // 1. Save original full-resolution files to local storage/history
      const imageUrls = await Promise.all(
        files.map((file) => LocalDataService.saveFile(file, user.id))
      );
      const rawImages = await Promise.all(files.map(fileToDataUri));

      // 2. Prepare images for AI API: compress down or merge into single panel based on settings
      const { processedImages: imagesForAi, summaryText: prepSummary } = await prepareImagesForAiPrompt(rawImages, {
        compressEnabled: isCompressionEnabled,
        targetKb: targetImageKb || 50,
        mergeIntoSingle: mergeImagesIntoSingle,
        mergeTargetKb: mergeTargetKb || 150,
      });

      const reportData = await ClientSideAiService.generateReportKnowledge(
        aiConfig,
        patientData.trim() || undefined,
        imagesForAi,
        {
          language,
          audienceMode,
          signal: controller.signal,
          onStreamChunk: (payload) => {
            if (payload.thinking) setStreamingThought(payload.thinking);
            if (payload.text) setStreamingText(payload.text);
            if (payload.step) setStreamingStatus(payload.step);
          },
        }
      );

      setReportKnowledge(reportData);
      setActiveOutputTab('report');

      const summaryTitle = reportData.reportType || 'Medical Report Parameter Breakdown';
      // Store original full-resolution files in the structured case history
      const newStructuredQuestion = { summary: summaryTitle, images: imageUrls };
      setStructuredQuestion(newStructuredQuestion);
      setFilePreviews(imageUrls);

      const caseData: Partial<LocalCase> = {
        id: currentCaseId || undefined,
        userId: user.id,
        type: 'diagnosis',
        title: summaryTitle,
        inputData: {
          patientData: patientData.trim() || null,
          supportingDocuments: imageUrls,
          structuredQuestion: newStructuredQuestion,
        },
        outputData: {
          diagnoses: results || [],
          clinicalAnswer: clinicalAnswer || null,
          reportKnowledge: reportData,
          proactiveQuestions,
          caseSummaryForPresentation,
          followUpThreads,
        },
      };

      const savedId = await LocalDataService.saveCase(caseData);
      if (!currentCaseId) setCurrentCaseId(savedId);

      toast({
        title: 'Report Analyzed',
        description: `Extracted ${reportData.totalParametersCount || 0} parameters with What-If explanations (${prepSummary}).`,
      });
    } catch (error: any) {
      if (isAbortError(error)) {
        toast({ title: 'Cancelled', description: 'Report parameter analysis was stopped by user.' });
        return;
      }
      console.error('Report analysis failed:', error);
      const msg = error?.message || 'Failed to analyze medical report parameters.';
      setErrorMessage(msg);
      toast({ title: 'Report Analysis Error', description: msg, variant: 'destructive', duration: 9000 });
    } finally {
      setIsAnalyzingReport(false);
      abortControllerRef.current = null;
    }
  };

  /**
   * Action 2: Full Clinical Diagnosis (Includes Differentials + Guideline Management + Report Parameters)
   */
  const handleSubmit = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
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
    setStreamingThought('');
    setStreamingText('');
    setStreamingStatus('Initiating clinical analysis...');
    try {
      // 1. Save original full-resolution files to local storage/history
      const imageUrls = await Promise.all(
        files.map((file) => LocalDataService.saveFile(file, user.id))
      );
      const rawImages = await Promise.all(files.map(fileToDataUri));

      // 2. Prepare images for AI API: compress down or merge into single panel based on settings
      const { processedImages: imagesForAi, summaryText: prepSummary } = await prepareImagesForAiPrompt(rawImages, {
        compressEnabled: isCompressionEnabled,
        targetKb: targetImageKb || 50,
        mergeIntoSingle: mergeImagesIntoSingle,
        mergeTargetKb: mergeTargetKb || 150,
      });

      // Single comprehensive clinical call with progressive live streaming & robust parsing
      const analysis = await ClientSideAiService.generateComprehensiveDiagnosis(
        aiConfig,
        patientData.trim() || undefined,
        imagesForAi,
        {
          language,
          audienceMode,
          signal: controller.signal,
          callbacks: {
            onThoughtChunk: (_chunk, fullThought) => setStreamingThought(fullThought),
            onTextChunk: (_chunk, fullText) => {
              setStreamingText(fullText);
              const now = Date.now();
              // Throttle complex regex and JSON parsing to at most once per 150ms during streaming
              if (now - lastDiagStreamUpdateRef.current > 150) {
                lastDiagStreamUpdateRef.current = now;
                const progressive = extractProgressiveDiagnosis(fullText);
                if (progressive.diagnoses && progressive.diagnoses.length > 0) {
                  setResults(progressive.diagnoses);
                }
                if (progressive.clinicalAnswer && progressive.clinicalAnswer.answer) {
                  setClinicalAnswer(progressive.clinicalAnswer as ClinicalAnswerData);
                }
                if (progressive.proactiveQuestions && progressive.proactiveQuestions.length > 0) {
                  setProactiveQuestions(progressive.proactiveQuestions);
                }
                if (progressive.reportKnowledge) {
                  setReportKnowledge(progressive.reportKnowledge);
                }
                if (progressive.caseSummaryForPresentation) {
                  setCaseSummaryForPresentation(progressive.caseSummaryForPresentation);
                }
              }
            },
            onStatus: (msg) => setStreamingStatus(msg),
          },
        }
      );

      const finalThinking = analysis.thinkingProcess || streamingThought || undefined;
      setResults(analysis.diagnoses);
      setClinicalAnswer(analysis.clinicalAnswer);
      setProactiveQuestions(analysis.proactiveQuestions);
      setCaseSummaryForPresentation(analysis.caseSummaryForPresentation);
      setThinkingProcess(finalThinking);
      if (analysis.reportKnowledge) {
        setReportKnowledge(analysis.reportKnowledge);
      }
      setActiveOutputTab('diagnosis');

      // Store original full-resolution files in the structured case history
      const newStructuredQuestion = { summary: analysis.summary, images: imageUrls };
      setStructuredQuestion(newStructuredQuestion);
      setFilePreviews(imageUrls);

      const caseData: Partial<LocalCase> = {
        id: currentCaseId || undefined,
        userId: user.id,
        type: 'diagnosis',
        title: analysis.summary || 'Clinical Diagnosis Case',
        inputData: {
          patientData: patientData.trim() || null,
          supportingDocuments: imageUrls,
          structuredQuestion: newStructuredQuestion,
        },
        outputData: {
          diagnoses: analysis.diagnoses,
          clinicalAnswer: analysis.clinicalAnswer,
          reportKnowledge: analysis.reportKnowledge || reportKnowledge || null,
          proactiveQuestions: analysis.proactiveQuestions,
          caseSummaryForPresentation: analysis.caseSummaryForPresentation,
          followUpThreads: followUpThreads || [],
          thinkingProcess: finalThinking,
          streamText: streamingText || undefined,
        },
      };

      const savedId = await LocalDataService.saveCase(caseData);
      if (!currentCaseId) setCurrentCaseId(savedId);
      toast({
        title: 'Diagnosis Generated',
        description: `Clinical case analysis complete (${prepSummary}).`,
      });
    } catch (error: any) {
      if (isAbortError(error)) {
        setStreamingStatus('');
        toast({ title: 'Cancelled', description: 'Clinical diagnosis generation was stopped by user.' });
        return;
      }
      console.error('Diagnosis failed:', error);
      const msg = error?.message || (typeof error === 'string' ? error : 'Failed to generate diagnosis.');
      setErrorMessage(msg);
      toast({ title: 'AI Diagnosis Error', description: msg, variant: 'destructive', duration: 9000 });
    } finally {
      setIsLoading(false);
      setStreamingStatus('');
      abortControllerRef.current = null;
    }
  };

  const handleAskFollowUp = async (question: string, images?: string[]) => {
    if (!isConfigured || isAskingFollowUp || !user) return;
    const controller = new AbortController();
    followUpAbortControllerRef.current = controller;
    setIsAskingFollowUp(true);
    setFollowUpStreamText('');
    setFollowUpStreamThought('');
    try {
      const conversationHistory = followUpThreads.map((t) => ({
        question: t.question,
        answer: t.answer,
      }));

      const diagnosesSummary = results ? results.map((r) => `${r.diagnosis} (${Math.round(r.confidenceLevel * 100)}%)`).join(', ') : '';

      const followUpRes = await ClientSideAiService.answerClinicalFollowUp(
        aiConfig,
        {
          originalQuestion: patientData || structuredQuestion?.summary,
          caseSummary: caseSummaryForPresentation,
          originalAnswer: clinicalAnswer?.answer,
          diagnosesSummary,
          userFollowUp: question,
          conversationHistory,
          language,
          audienceMode,
          images,
          signal: controller.signal,
          onStreamChunk: (payload) => {
            if (payload.text) setFollowUpStreamText(payload.text);
            if (payload.thinking) setFollowUpStreamThought(payload.thinking);
          },
        }
      );

      const newThread: FollowUpThread = {
        id: Date.now().toString(),
        question,
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

      // Persist in DB
      if (currentCaseId) {
        const existingCase = await LocalDataService.getCase(currentCaseId);
        if (existingCase) {
          await LocalDataService.saveCase({
            ...existingCase,
            outputData: {
              ...existingCase.outputData,
              followUpThreads: updatedThreads,
              proactiveQuestions: followUpRes.suggestedFollowUps || proactiveQuestions,
            },
          });
        }
      }

      toast({ title: 'Answer Received', description: 'Clinical consultant updated response.' });
    } catch (e: any) {
      if (isAbortError(e)) {
        toast({ title: 'Cancelled', description: 'Clinical follow-up inquiry was stopped by user.' });
        return;
      }
      console.error('Follow-up failed:', e);
      toast({ title: 'Error', description: 'Failed to get follow-up answer.', variant: 'destructive' });
    } finally {
      setIsAskingFollowUp(false);
      followUpAbortControllerRef.current = null;
      setFollowUpStreamText('');
      setFollowUpStreamThought('');
    }
  };

  const handleStopAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setIsAnalyzingReport(false);
    setStreamingStatus('');
  };
  const handleStopCurrentRequest = handleStopAnalysis;

  const handleStopFollowUp = () => {
    if (followUpAbortControllerRef.current) {
      followUpAbortControllerRef.current.abort();
      followUpAbortControllerRef.current = null;
    }
    setIsAskingFollowUp(false);
    setFollowUpStreamText('');
    setFollowUpStreamThought('');
  };

  const handleCreatePresentationBridge = () => {
    if (!currentCaseId && !caseSummaryForPresentation && !patientData) return;
    if (currentCaseId) {
      router.push(`/content-generator?fromCaseId=${currentCaseId}`);
    } else {
      router.push(`/content-generator?topic=${encodeURIComponent(structuredQuestion?.summary || 'Clinical Case Study')}`);
    }
  };

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description: `${type} copied to clipboard.` });
  };

  const formatText = (text: string) => {
    if (!text) return '';
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br />');
  };

  const handleNewCase = () => {
    loadedCaseIdRef.current = null;
    setPatientData('');
    setFiles([]);
    setFilePreviews([]);
    setAudioDurations({});
    setResults(null);
    setClinicalAnswer(null);
    setReportKnowledge(null);
    setActiveOutputTab('diagnosis');
    setProactiveQuestions([]);
    setCaseSummaryForPresentation('');
    setFollowUpThreads([]);
    setStructuredQuestion(null);
    setCurrentCaseId(null);
    setStreamingThought('');
    setStreamingText('');
    setStreamingStatus('');
    setThinkingProcess(undefined);
    router.push('/ai-diagnosis');
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isBusy = isLoading || isAnalyzingReport || isConvertingPdf;
  const hasOutputs = results || clinicalAnswer || reportKnowledge;

  return (
    <div className="container mx-auto max-w-5xl px-3 sm:px-4 py-6 sm:py-8 space-y-6 w-full max-w-full overflow-x-hidden">
      {errorMessage && (
        <Card className="border-destructive/60 bg-destructive/10 text-destructive shadow-xs animate-in fade-in slide-in-from-top-2">
          <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-semibold text-sm text-destructive">
                  Clinical AI Processing Issue
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
                    To activate postgraduate medical analysis, report parameter extraction, and slide generation, configure your Gemini API key.
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

      {/* Main Input & Action Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full max-w-full">
        <div className="lg:col-span-5 space-y-6 w-full max-w-full min-w-0">
          <Card className="border shadow-sm w-full max-w-full overflow-hidden">
            <CardHeader className="p-4 sm:p-6 pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="stamp-badge text-[9px] stamp-inquiry">
                      CASE SHEET #VIG-01
                    </span>
                  </div>
                  <CardTitle className="text-lg sm:text-xl font-bold flex items-center gap-2 text-foreground">
                    <BrainCircuit className="h-5 w-5 text-primary" />
                    Clinical Diagnosis &amp; Report Lab
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-muted-foreground">
                    Enter clinical vignette, lab findings, or upload PDFs &amp; imaging reports.
                  </CardDescription>
                </div>
                <Button variant="ghost" size="icon" onClick={handleNewCase} title="New Case" className="h-8 w-8 rounded-lg hover:bg-muted">
                  <PlusCircle className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-2 space-y-4">
              <ModeLanguageSelector />
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="patientData" className="text-xs font-semibold">
                      Patient Notes / Clinical Presentation
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <VoiceInputButton
                        onTranscript={(text) => {
                          const clean = text.trim();
                          if (!clean) return;
                          setPatientData((prev) => {
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
                      // Only cancel if leaving the outer container
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
                      id="patientData"
                      placeholder="e.g. 54yo male with acute retrosternal chest pain radiating to back, BP 180/100, asymmetric pulses, elevated D-dimer and troponin..."
                      value={patientData}
                      onChange={(e) => setPatientData(e.target.value)}
                      onPaste={handlePaste}
                      className={`min-h-[140px] resize-none text-xs sm:text-sm transition-all ${
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
                          PDFs will be unpacked page-by-page automatically
                        </p>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Tip: Drag &amp; drop PDFs or images directly into the text field above to attach.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-xs font-semibold">
                      Reports, PDFs &amp; Audio Dictation (ECG, X-Ray, Lab PDFs, Labs)
                    </Label>
                    <AudioRecorder
                      onAudioRecorded={handleAudioRecorded}
                      onTranscribe={(text) =>
                        setPatientData((prev) => (prev ? `${prev}\n\n[Dictation]: ${text}` : text))
                      }
                    />
                  </div>

                  {/* Audio Attachments List */}
                  {filePreviews.some((preview, i) => isAudioItem(preview, i)) && (
                    <div className="space-y-2 pt-1 w-full max-w-full overflow-hidden">
                      {filePreviews.map((preview, index) => {
                        if (!isAudioItem(preview, index)) return null;
                        return (
                          <AudioPlayerCard
                            key={index}
                            src={preview}
                            fileName={getFileName(preview, index)}
                            duration={audioDurations[index]}
                            transcript={audioTranscripts[index]}
                            isTranscribing={transcribingAudioIndices.has(index)}
                            onTranscriptGenerated={(t) => {
                              setAudioTranscripts((prev) => ({ ...prev, [index]: t }));
                            }}
                            onInsertTranscript={(t) =>
                              setPatientData((prev) => (prev ? `${prev}\n\n[Dictation]: ${t}` : t))
                            }
                            onRemove={() => handleRemoveFile(index)}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Image and Document Previews (PDF pages rendered as distinct image cards) */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {filePreviews.map((preview, index) => {
                      if (isAudioItem(preview, index)) return null;
                      const fileName = files[index]?.name || `Page ${index + 1}`;
                      return (
                        <div key={index} className="relative h-16 w-16 overflow-hidden rounded-lg border shadow-xs group bg-muted/30">
                          <img src={preview} alt={`Report ${index}`} className="h-full w-full object-cover" />
                          <div className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5 text-[8px] text-white font-mono truncate">
                            {fileName}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(index)}
                            className="absolute right-1 top-1 rounded-full bg-red-600 hover:bg-red-700 p-0.5 text-white shadow-xs transition-colors z-10"
                            aria-label="Remove image"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                    <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed hover:bg-muted/60 transition-colors">
                      {isConvertingPdf ? (
                        <Loader2 className="h-5 w-5 text-primary animate-spin" />
                      ) : (
                        <Upload className="h-5 w-5 text-muted-foreground" />
                      )}
                      <span className="text-[9px] text-muted-foreground mt-0.5 text-center font-mono">
                        {isConvertingPdf ? 'PDF...' : 'PDF / Img'}
                      </span>
                      <input
                        type="file"
                        multiple
                        accept="image/*,application/pdf,audio/*"
                        onChange={handleFileChange}
                        disabled={isConvertingPdf}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Image compression and multi-image stitching toggle for AI token optimization */}
                  {files.length > 0 && (
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
                        attachedImages={files.filter((f) => !f.type.startsWith('audio/'))}
                        attachedCount={files.filter((f) => !f.type.startsWith('audio/')).length}
                      />
                    </div>
                  )}
                </div>

                {/* Unified Action Section: Single Prominent Workup CTA + Optional Parameter Quick-Extract */}
                <div className="space-y-2.5 pt-2 border-t border-border">
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
                      title={!enableReasoning ? 'Reasoning is turned OFF: click to enable deep clinical chain of thought' : 'Reasoning is turned ON: click to turn off reasoning for ultra-fast instant answers'}
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

                  {isLoading || isAnalyzingReport ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleStopCurrentRequest}
                      className="w-full h-11 text-xs sm:text-sm font-semibold gap-2 shadow-xs"
                      title="Stop clinical synthesis"
                    >
                      <Square className="h-4 w-4 fill-current" />
                      <span>Stop Clinical Analysis</span>
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Button
                        type="submit"
                        className="w-full h-11 text-xs sm:text-sm font-bold gap-2 shadow-sm bg-primary hover:bg-primary/90 text-primary-foreground transition-all group"
                        disabled={!patientData.trim() && files.length === 0}
                      >
                        <BrainCircuit className="h-4 w-4 text-primary-foreground group-hover:scale-110 transition-transform" />
                        <span>Synthesize Clinical Workup</span>
                      </Button>

                      {/* Secondary Quick Action for pure lab extraction */}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleAnalyzeReportOnly}
                        className="w-full h-8 text-[11px] font-medium text-muted-foreground hover:text-foreground gap-1.5 hover:bg-muted/60"
                        disabled={!patientData.trim() && files.length === 0}
                      >
                        <FlaskConical className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Extract Lab &amp; Biomarker Parameters Only</span>
                      </Button>
                    </div>
                  )}

                  {/* Multi-Step Animated Progress Bar with Quick Stop Action */}
                  {(isLoading || isAnalyzingReport) && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-primary">
                        <span className="flex items-center gap-1.5 truncate">
                          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                          <span className="truncate">{PROGRESS_MESSAGES[progressStep]}</span>
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[10px]">
                            {Math.round(((progressStep + 1) / PROGRESS_MESSAGES.length) * 100)}%
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={handleStopCurrentRequest}
                            className="h-5 px-1.5 text-[10px] gap-1 shrink-0 font-medium"
                            title="Stop request"
                          >
                            <Square className="h-2.5 w-2.5 fill-current" />
                            <span>Stop</span>
                          </Button>
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
                          style={{ width: `${((progressStep + 1) / PROGRESS_MESSAGES.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Token-Efficient Bridge to Slide Presentation */}
          {(results || caseSummaryForPresentation) && (
            <Card className="border border-primary/30 bg-primary/5 shadow-xs overflow-hidden w-full max-w-full">
              <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase">
                    <Presentation className="h-4 w-4 shrink-0" />
                    <span>Presentation Deck Bridge</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Convert this case&apos;s clinical synthesis into a multi-slide deck without re-uploading images.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleCreatePresentationBridge}
                  className="h-9 px-3 text-xs gap-1.5 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs"
                >
                  <span>Build Slides</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          )}

          {structuredQuestion && (
            <QuestionDisplay
              summary={structuredQuestion.summary}
              images={structuredQuestion.images}
            />
          )}
        </div>

        {/* Right Output Column: Tabbed View for Report Analysis vs Differentials */}
        <div className="lg:col-span-7 space-y-6 w-full max-w-full min-w-0">
          {/* Output Switcher Tabs if both results and report knowledge exist */}
          {hasOutputs && (
            <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl bg-muted/60 border border-border">
              <div className="flex items-center gap-1.5 flex-1">
                {results && results.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveOutputTab('diagnosis')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                      activeOutputTab === 'diagnosis'
                        ? 'bg-card text-foreground shadow-xs border border-border font-bold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <BrainCircuit className="h-3.5 w-3.5 text-primary" />
                    <span>Differential Diagnoses ({results.length})</span>
                  </button>
                )}
                {reportKnowledge && (
                  <button
                    type="button"
                    onClick={() => setActiveOutputTab('report')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                      activeOutputTab === 'report'
                        ? 'bg-card text-foreground shadow-xs border border-border font-bold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <FlaskConical className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      Report Parameters ({reportKnowledge.totalParametersCount || reportKnowledge.categories?.reduce((acc, c) => acc + c.parameters.length, 0) || 0})
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* VIEW A: Report Knowledge Parameter Breakdown */}
          {reportKnowledge && (activeOutputTab === 'report' || (!results && !clinicalAnswer)) && (
            <ReportParameterAnalysis
              data={reportKnowledge}
              onProceedToDiagnosis={() => handleSubmit()}
              isProceedingToDiagnosis={isLoading}
              hasExistingDiagnosis={Boolean(results && results.length > 0)}
            />
          )}

          {/* VIEW B: Differential Diagnoses & Clinical Synthesis */}
          {(activeOutputTab === 'diagnosis' || !reportKnowledge) && (
            <div className="space-y-6 w-full max-w-full">
              {/* Case Loading Banner */}
              {isLoadingCase && (
                <Card className="border border-primary/20 bg-card p-6 shadow-xs flex flex-col items-center justify-center text-center space-y-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-foreground">Case is being loaded...</p>
                    <p className="text-xs text-muted-foreground">Retrieving differential diagnoses, lab parameters, and case data</p>
                  </div>
                </Card>
              )}

              {/* =========================================================================
                  REPRESENTATIONS 1 & 2: COLLAPSIBLE AI THINKING & RAW STREAM CONSOLE
                  ========================================================================= */}
              {(isLoading || isAnalyzingReport || streamingText || streamingThought || thinkingProcess) && !isLoadingCase && (
                <div className="space-y-4">
                  {/* Status Banner when diagnosing and no results have parsed yet */}
                  {(isLoading || isAnalyzingReport) && (!results || results.length === 0) && (
                    <Card className="border border-primary/20 bg-card p-6 shadow-xs flex flex-col items-center justify-center text-center space-y-3">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-foreground">
                          {isAnalyzingReport ? 'Extracting report parameters...' : 'Diagnosing in process...'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {streamingStatus || PROGRESS_MESSAGES[progressStep] || 'Synthesizing clinical differential considerations and evidence...'}
                        </p>
                      </div>
                    </Card>
                  )}

                  {/* Diagnosing In Process Banner when cards are already streaming */}
                  {isLoading && results && results.length > 0 && (
                    <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                        <span>Diagnosing in process...</span>
                      </div>
                      <span className="text-[11px] font-mono text-primary/80">
                        {results.length} differential{results.length > 1 ? 's' : ''} parsed
                      </span>
                    </div>
                  )}

                  {/* The Live Clinical Reasoning & Stream Console */}
                  <AiStreamingRawLogBox
                    isLoading={isLoading || isAnalyzingReport}
                    streamText={streamingText}
                    thinkingText={streamingThought || thinkingProcess || ''}
                    currentStep={streamingStatus || PROGRESS_MESSAGES[progressStep] || 'Synthesizing clinical evidence...'}
                    steps={['Clinical History & Multi-Modal Processing', 'Differential Hypothesis & Likelihood Ranking', 'Guideline Synthesis & Parameter Breakdown']}
                    activeStepIndex={progressStep}
                    onStop={handleStopAnalysis}
                    title="Live Clinical Reasoning & Evidence Synthesis"
                    defaultExpanded={isLoading || isAnalyzingReport}
                    defaultThinkingExpanded={true}
                    defaultRawExpanded={false}
                  />
                </div>
              )}

              {/* =========================================================================
                  REPRESENTATION 3: ACTUAL FORMATTED OUTPUT
                  ========================================================================= */}

              {results && results.length > 0 && (
                <div className="space-y-4 w-full max-w-full">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-primary" />
                      <span>Ranked Differential Diagnoses &amp; Pre-Test Likelihood</span>
                    </h3>
                    <span className="text-xs text-muted-foreground shrink-0 font-mono">
                      {results.length} Conditions Analyzed
                    </span>
                  </div>
                  <div className="space-y-3 w-full max-w-full">
                    {results.map((diag, index) => (
                      <DiagnosisCard
                        key={index}
                        diagnosis={diag}
                        onExploreTopic={(topic) =>
                          router.push(`/content-generator?topic=${encodeURIComponent(topic)}`)
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {clinicalAnswer && (
                <Card className="border shadow-sm overflow-hidden w-full max-w-full">
                  <CardHeader className="bg-primary/5 border-b p-4 sm:p-6 pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary shrink-0" />
                        <span>Guideline-Directed Management &amp; Synthesis</span>
                      </CardTitle>
                      <div className="flex items-center gap-1">
                        <SpeechSynthesisButton
                          text={`${clinicalAnswer?.answer || ''}. Key clinical takeaways: ${(clinicalAnswer?.keyTakeaways || []).join('. ')}`}
                          label="Listen"
                          showLabel={true}
                          size="sm"
                          className="h-7 px-2 text-[11px] border-primary/30"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const emrNote = [
                              '=== CLINICAL CASE SUMMARY ===',
                              '',
                              `Case: ${structuredQuestion?.summary || 'Clinical Analysis'}`,
                              '',
                              '--- DIFFERENTIAL DIAGNOSES ---',
                              ...(results || [])
                                .slice(0, 5)
                                .map(
                                  (d, i) =>
                                    `${i + 1}. ${d.diagnosis} (Confidence: ${Math.round(
                                      d.confidenceLevel * 100
                                    )}%, ${d.lifeThreatCategory || 'Secondary'})`
                                ),
                              '',
                              '--- CLINICAL SYNTHESIS ---',
                              clinicalAnswer?.answer || '',
                              '',
                              '--- KEY TAKEAWAYS ---',
                              ...(clinicalAnswer?.keyTakeaways || []).map((t, i) => `${i + 1}. ${t}`),
                              '',
                              '--- RECOMMENDED INVESTIGATIONS ---',
                              ...(results || [])
                                .flatMap((d) => d.missingInformation?.tests || [])
                                .filter((v, i, a) => a.indexOf(v) === i)
                                .slice(0, 8)
                                .map((t) => `• ${t}`),
                              '',
                              `Generated: ${new Date().toLocaleString()}`,
                            ].join('\n');
                            navigator.clipboard.writeText(emrNote);
                            toast({
                              title: 'EMR Note Copied',
                              description: 'Full clinical summary copied to clipboard.',
                            });
                          }}
                          className="h-7 px-2 text-[11px] gap-1 text-primary hover:text-primary/80"
                        >
                          <ClipboardList className="h-3 w-3" />
                          <span className="hidden sm:inline">Copy EMR Note</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopy(clinicalAnswer.answer, 'Synthesis')}
                          className="h-7 w-7 shrink-0"
                          aria-label="Copy synthesis"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 space-y-4 w-full max-w-full overflow-hidden">
                    <ClinicalMarkdownRenderer
                      content={clinicalAnswer.answer}
                      className="text-xs sm:text-sm leading-relaxed"
                    />

                    {clinicalAnswer.reasoning && (
                      <Accordion type="single" collapsible className="mt-4 pt-2 border-t w-full">
                        <AccordionItem value="reasoning" className="border-none">
                          <AccordionTrigger className="py-1 text-xs font-semibold text-muted-foreground hover:text-primary">
                            <div className="flex items-center gap-2 min-w-0 text-left">
                              <Lightbulb className="h-4 w-4 shrink-0" />
                              <span>Detailed Diagnostic &amp; Pathophysiology Breakdown</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="mt-2 rounded-xl border border-border bg-muted/40 p-3 sm:p-4">
                              <ClinicalMarkdownRenderer
                                content={clinicalAnswer.reasoning}
                                className="text-xs sm:text-sm text-muted-foreground leading-relaxed"
                              />
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Interactive Follow-up Q&A and Proactive Question Engine */}
              {(results || clinicalAnswer) && (
                <FollowUpChat
                  proactiveQuestions={proactiveQuestions}
                  threads={followUpThreads}
                  onAskFollowUp={handleAskFollowUp}
                  onStop={handleStopFollowUp}
                  isLoading={isAskingFollowUp}
                  streamingText={followUpStreamText}
                  streamingThought={followUpStreamThought}
                  title="Clinical Blind Spots & Interactive Q&A"
                  description="Proactive questions generated for this case. Click any chip to ask, or type a custom question."
                  sourceContext="diagnosis"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AiDiagnosisPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <AiDiagnosisContent />
    </Suspense>
  );
}
