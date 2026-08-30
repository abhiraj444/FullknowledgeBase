'use client';

import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, TouchSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React, { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow as DocxTableRow,
  TableCell,
  BorderStyle,
} from 'docx';
import { saveAs } from 'file-saver';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import {
  Trash2,
  Plus,
  RefreshCw,
  FileDown,
  Loader2,
  Scaling,
  ClipboardCopy,
  PlusCircle,
  File,
  GripVertical,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  X,
  Square,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from './ui/label';
import { cn } from '@/lib/utils';
import type { Slide } from '@/types';
import { registerNotoSansRegular } from '@/lib/pdf-fonts/NotoSansRegular';
import EnhancedSlideRenderer from './EnhancedSlideRenderer';
import { registerNotoSansBold } from '@/lib/pdf-fonts/NotoSansBold';
import { registerNotoSansItalic } from '@/lib/pdf-fonts/NotoSansItalic';
import { useSettings } from '@/context/SettingsContext';
import { ClientSideAiService, isAbortError, formatModelDisplayName } from '@/lib/ClientSideAiService';
import { generatePptx } from '@/lib/ppt-generator';
import PptxGenJS from 'pptxgenjs';
import { AiStreamingRawLogBox } from './AiStreamingRawLogBox';

export type { Slide };

// SortableItem component cleanly passing attributes without leaking invalid props
const SortableSlideItem = ({
  id,
  children,
}: {
  id: string;
  children:
    | React.ReactNode
    | ((dragProps: {
        attributes: Record<string, any>;
        listeners: Record<string, any> | undefined;
      }) => React.ReactNode);
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style} className="w-full">
      {typeof children === 'function' ? children({ attributes, listeners }) : children}
    </div>
  );
};

export function SlideEditor({
  initialSlides,
  topic: initialTopic,
  caseId,
  onRefresh,
  initialUsedTopics,
  onUpdate,
  questionContext,
  outline,
  initialSuggestedTopics,
  onNewCase,
}: {
  initialSlides: Slide[];
  topic: string;
  caseId: string | null;
  onRefresh?: () => void;
  initialUsedTopics?: string[];
  onUpdate: (data: { slides?: Slide[]; suggestedTopics?: string[]; usedTopics?: string[] }) => void;
  questionContext?: string;
  outline?: string[];
  initialSuggestedTopics?: string[];
  onNewCase?: () => void;
}) {
  const [slides, setSlides] = useState<Slide[]>(initialSlides);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [topic, setTopic] = useState(initialTopic);
  const [isModifying, setIsModifying] = useState(false);
  const [loadingSlides, setLoadingSlides] = useState<Set<number>>(new Set());
  const [isAddSectionModalOpen, setIsAddSectionModalOpen] = useState(false);
  const [newTopicSuggestions, setNewTopicSuggestions] = useState<string[]>(initialSuggestedTopics || []);
  const [usedTopics, setUsedTopics] = useState<string[]>(initialUsedTopics || []);
  const [customTopic, setCustomTopic] = useState('');
  const [selectedNewTopics, setSelectedNewTopics] = useState<string[]>([]);
  const [isSuggestingTopics, setIsSuggestingTopics] = useState(false);
  const [isPresenting, setIsPresenting] = useState(false);
  const [presentingIndex, setPresentingIndex] = useState(0);
  const [streamText, setStreamText] = useState('');
  const [streamThinking, setStreamThinking] = useState('');
  const [streamStep, setStreamStep] = useState('');
  const [streamModelName, setStreamModelName] = useState<string | undefined>();
  const slideModifyAbortRef = React.useRef<AbortController | null>(null);
  const { toast } = useToast();
  const { apiKey, aiConfig, isConfigured, language, audienceMode, activeModel } = useSettings();

  const handleStopSlideModify = () => {
    if (slideModifyAbortRef.current) {
      slideModifyAbortRef.current.abort();
      slideModifyAbortRef.current = null;
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    setSlides(initialSlides);
    setSelectedIndices([]);

    if (initialSlides.length > 0) {
      const existingTitles = initialSlides.map(s => s.title);
      const combined = Array.from(new Set([...(initialUsedTopics || []), ...existingTitles]));
      setUsedTopics(combined);
    }
  }, [initialSlides, initialUsedTopics]);

  const handleSelectionChange = (index: number, checked: boolean) => {
    if (checked) {
      setSelectedIndices((prev) => [...prev, index]);
    } else {
      setSelectedIndices((prev) => prev.filter((i) => i !== index));
    }
  };

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      setSelectedIndices(slides.map((_, i) => i));
    } else {
      setSelectedIndices([]);
    }
  };

  const removeSlide = (indexToRemove: number) => {
    const slideToRemove = slides[indexToRemove];
    const newSlides = slides.filter((_, index) => index !== indexToRemove);
    setSlides(newSlides);
    setSelectedIndices((prev) => prev.filter((i) => i !== indexToRemove).map((i) => (i > indexToRemove ? i - 1 : i)));
    
    // Notify parent
    onUpdate({ slides: newSlides });
    toast({ title: 'Slide Removed', description: `Removed slide: ${slideToRemove.title}` });
  };

  const handleUpdateSlide = (slideIndex: number, updatedSlide: Slide) => {
    const newSlides = [...slides];
    newSlides[slideIndex] = updatedSlide;
    setSlides(newSlides);
    onUpdate({ slides: newSlides });
  };

  const handleModifySlides = async (action: 'replace_content' | 'expand_selected') => {
    if (!isConfigured || selectedIndices.length === 0) return;
    const controller = new AbortController();
    slideModifyAbortRef.current = controller;
    setIsModifying(true);
    setStreamText('');
    setStreamThinking('');
    const slideNums = selectedIndices.map((i) => `#${i + 1}`).join(', ');
    setStreamStep(
      action === 'expand_selected'
        ? `Expanding depth for slide(s) ${slideNums} with clinical comparison tables, pathophysiological mechanisms, and board pearls...`
        : `Refreshing content for slide(s) ${slideNums} with structured clinical items and updated pearls...`
    );
    const indicesSet = new Set(selectedIndices);
    setLoadingSlides(indicesSet);

    try {
      const updatedSlides = await ClientSideAiService.modifySlides(aiConfig, {
        slides,
        selectedIndices,
        action,
        language,
        audienceMode,
        signal: controller.signal,
        onStreamChunk: (payload) => {
          if (payload.text !== undefined) setStreamText(payload.text);
          if (payload.thinking !== undefined) setStreamThinking(payload.thinking);
          if (payload.model) setStreamModelName(payload.model);
        },
      });

      setSlides(updatedSlides);
      onUpdate({ slides: updatedSlides });
      toast({
        title: action === 'expand_selected' ? 'Depth Expanded' : 'Slides Refreshed',
        description: `Successfully modified ${selectedIndices.length} slide${selectedIndices.length > 1 ? 's' : ''}.`,
      });
    } catch (error: any) {
      if (isAbortError(error)) {
        toast({ title: 'Cancelled', description: 'Slide modification stopped by user.' });
        return;
      }
      console.error('Failed to modify slides:', error);
      toast({
        title: 'Failed to Modify Slides',
        description: error?.message || 'An error occurred while updating slides.',
        variant: 'destructive',
      });
    } finally {
      setIsModifying(false);
      setLoadingSlides(new Set());
      slideModifyAbortRef.current = null;
    }
  };

  const handleModifySingleSlide = async (slideIndex: number, action: 'replace_content' | 'expand_selected') => {
    if (!isConfigured) return;
    const controller = new AbortController();
    slideModifyAbortRef.current = controller;
    setIsModifying(true);
    setStreamText('');
    setStreamThinking('');
    const slideTitle = slides[slideIndex]?.title || `#${slideIndex + 1}`;
    setStreamStep(
      action === 'expand_selected'
        ? `Expanding clinical depth for slide #${slideIndex + 1} (${slideTitle})...`
        : `Refreshing structured content for slide #${slideIndex + 1} (${slideTitle})...`
    );
    setLoadingSlides(new Set([slideIndex]));

    try {
      const updatedSlides = await ClientSideAiService.modifySlides(aiConfig, {
        slides,
        selectedIndices: [slideIndex],
        action,
        language,
        audienceMode,
        signal: controller.signal,
        onStreamChunk: (payload) => {
          if (payload.text !== undefined) setStreamText(payload.text);
          if (payload.thinking !== undefined) setStreamThinking(payload.thinking);
          if (payload.model) setStreamModelName(payload.model);
        },
      });

      setSlides(updatedSlides);
      onUpdate({ slides: updatedSlides });
      toast({
        title: action === 'replace_content' ? 'Slide Refreshed' : 'Slide Expanded',
        description: `Successfully updated slide: ${slides[slideIndex]?.title || `#${slideIndex + 1}`}`,
      });
    } catch (error: any) {
      if (isAbortError(error)) {
        toast({ title: 'Cancelled', description: 'Slide modification stopped by user.' });
        return;
      }
      console.error('Failed to modify slide:', error);
      toast({
        title: 'Failed to Modify Slide',
        description: error?.message || 'An error occurred while modifying this slide.',
        variant: 'destructive',
      });
    } finally {
      setIsModifying(false);
      setLoadingSlides(new Set());
      slideModifyAbortRef.current = null;
    }
  };

  const handleAddSectionClick = async () => {
    setIsAddSectionModalOpen(true);
    setSelectedNewTopics([]);
    setCustomTopic('');

    if (newTopicSuggestions.length === 0) {
      await fetchNewTopicSuggestions();
    }
  };

  const fetchNewTopicSuggestions = async () => {
    if (!isConfigured) return;
    setIsSuggestingTopics(true);
    try {
      const existingTitles = slides.map(s => s.title);
      const res = await ClientSideAiService.suggestTopics(aiConfig, {
        topic,
        question: questionContext,
        existingTopics: [...existingTitles, ...usedTopics],
        language,
        audienceMode,
      });

      setNewTopicSuggestions(res.topics || []);
      onUpdate({ suggestedTopics: res.topics || [] });
    } catch (e: any) {
      console.error('Failed to suggest topics:', e);
      toast({
        title: 'Failed to Suggest Topics',
        description: e?.message || 'Unable to retrieve new topic suggestions.',
        variant: 'destructive',
      });
    } finally {
      setIsSuggestingTopics(false);
    }
  };

  const handleAddSelectedSlides = async () => {
    if (!isConfigured) return;
    const topicsToAdd = [...selectedNewTopics];
    if (customTopic.trim() && !topicsToAdd.includes(customTopic.trim())) {
      topicsToAdd.push(customTopic.trim());
    }

    if (topicsToAdd.length === 0) return;

    setIsModifying(true);
    try {
      const newSlidePromises = topicsToAdd.map(t =>
        ClientSideAiService.generateSingleSlide(aiConfig, t, { language, audienceMode })
      );
      const generatedNewSlides = await Promise.all(newSlidePromises);

      const allSlides = [...slides, ...generatedNewSlides];
      const updatedUsedTopics = Array.from(new Set([...usedTopics, ...topicsToAdd]));

      setSlides(allSlides);
      setUsedTopics(updatedUsedTopics);
      setIsAddSectionModalOpen(false);

      onUpdate({
        slides: allSlides,
        usedTopics: updatedUsedTopics,
        suggestedTopics: newTopicSuggestions,
      });

      toast({
        title: 'Sections Added',
        description: `Added ${generatedNewSlides.length} new slides to the presentation.`,
      });
    } catch (error: any) {
      console.error('Failed to add slides:', error);
      toast({
        title: 'Failed to Generate Slides',
        description: error?.message || 'Error generating new slide sections.',
        variant: 'destructive',
      });
    } finally {
      setIsModifying(false);
    }
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      setSlides((items) => {
        const oldIndex = items.findIndex((item) => item.title === active.id);
        const newIndex = items.findIndex((item) => item.title === over.id);
        const newSlides = arrayMove(items, oldIndex, newIndex);
        onUpdate({ slides: newSlides });
        return newSlides;
      });
    }
  };

  const handleCopyRawContent = () => {
    const rawContent = JSON.stringify({ slides }, null, 2);
    navigator.clipboard.writeText(rawContent).then(
      () => toast({ title: 'Content Copied', description: 'Raw JSON slide deck copied.' }),
      () => toast({ title: 'Error', description: 'Failed to copy content.', variant: 'destructive' })
    );
  };

  // PDF Export with crisp single-pass rendering, header badges, card containers, pearls & viva questions
  const handleExportToPdf = () => {
    setIsModifying(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      registerNotoSansRegular(doc);
      registerNotoSansBold(doc);
      registerNotoSansItalic(doc);
      doc.setFont('NotoSans');

      const margin = 16;
      let currentY = margin;
      const pageHeight = doc.internal.pageSize.height;
      const pageWidth = doc.internal.pageSize.width;
      const contentWidth = pageWidth - 2 * margin;

      const addNewPage = () => {
        doc.addPage();
        currentY = margin;
      };

      slides.forEach((slide, sIndex) => {
        if (sIndex > 0) addNewPage();

        // 1. Top Accent Rule
        doc.setFillColor(30, 58, 138); // Navy Blue
        doc.rect(margin, currentY, contentWidth, 1.2, 'F');
        currentY += 4.5;

        // Slide Badge Pill (SLIDE #X)
        doc.setFillColor(240, 253, 244); // Light Emerald
        doc.setDrawColor(187, 247, 208);
        doc.roundedRect(margin, currentY - 3, 22, 5.5, 1, 1, 'FD');

        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(21, 128, 61); // Emerald 700
        doc.text(`SLIDE #${sIndex + 1}`, margin + 2.5, currentY + 0.8);

        // Header Deck Tag
        doc.setFont('NotoSans', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184); // Slate 400
        doc.text('Clinical Teaching Deck', pageWidth - margin - 32, currentY + 0.8);

        currentY += 6.5;

        // 2. Slide Title
        doc.setFontSize(14.5);
        doc.setTextColor(30, 58, 138); // Navy
        doc.setFont('NotoSans', 'bold');
        const titleLines = doc.splitTextToSize(slide.title, contentWidth);
        doc.text(titleLines, margin, currentY);
        currentY += titleLines.length * 6 + 3.5;

        // 3. Optional Slide Context Summary Subtitle
        if (slide.summary) {
          const summaryLines = doc.splitTextToSize(slide.summary, contentWidth - 8);
          const summaryHeight = summaryLines.length * 4.5 + 4;

          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(203, 213, 225);
          doc.rect(margin, currentY - 1, 1.5, summaryHeight - 2, 'F'); // Left accent bar

          doc.setFont('NotoSans', 'italic');
          doc.setFontSize(8.5);
          doc.setTextColor(100, 116, 139);
          doc.text(summaryLines, margin + 4.5, currentY + 2.5);
          currentY += summaryHeight + 2;
        }

        // 4. Content Items
        slide.content.forEach((item) => {
          if (currentY > pageHeight - 35) addNewPage();

          if (item.type === 'paragraph') {
            doc.setFont('NotoSans', 'normal');
            doc.setFontSize(10);
            const pLines = doc.splitTextToSize(item.text, contentWidth - 10);
            const boxHeight = pLines.length * 5.2 + 8;

            if (currentY + boxHeight > pageHeight - margin - 10) addNewPage();

            // Card Container
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(margin, currentY, contentWidth, boxHeight, 1.5, 1.5, 'S');

            // Paragraph Text
            doc.setTextColor(30, 41, 59);
            doc.text(pLines, margin + 5, currentY + 5.5);

            currentY += boxHeight + 4;
          } else if (item.type === 'bullet_list' || item.type === 'numbered_list') {
            doc.setFontSize(9.8);
            const items = item.items || [];
            if (items.length > 0) {
              doc.setFont('NotoSans', 'normal');
              const parsedItems = items.map((listItem) => ({
                text: listItem.text,
                lines: doc.splitTextToSize(listItem.text, contentWidth - 14),
              }));

              const totalLineCount = parsedItems.reduce((acc, it) => acc + it.lines.length, 0);
              const boxHeight = totalLineCount * 5.2 + parsedItems.length * 2.5 + 6;

              if (currentY + boxHeight > pageHeight - margin - 10) addNewPage();

              // Card Container
              doc.setFillColor(255, 255, 255);
              doc.setDrawColor(226, 232, 240);
              doc.roundedRect(margin, currentY, contentWidth, boxHeight, 1.5, 1.5, 'S');

              // Draw List Items
              let itemY = currentY + 5.5;
              parsedItems.forEach((it, lIndex) => {
                if (item.type === 'bullet_list') {
                  doc.setFont('NotoSans', 'bold');
                  doc.setFontSize(11);
                  doc.setTextColor(30, 58, 138); // Primary blue bullet
                  doc.text('•', margin + 4.5, itemY);
                } else {
                  doc.setFont('NotoSans', 'bold');
                  doc.setFontSize(9);
                  doc.setTextColor(30, 58, 138);
                  doc.text(`${lIndex + 1}.`, margin + 4, itemY);
                }

                doc.setFont('NotoSans', 'normal');
                doc.setFontSize(9.8);
                doc.setTextColor(30, 41, 59);
                doc.text(it.lines, margin + 9.5, itemY);

                itemY += it.lines.length * 5.2 + 2.5;
              });

              currentY += boxHeight + 4;
            }
          } else if (item.type === 'table') {
            if (currentY > pageHeight - 45) addNewPage();
            (doc as any).autoTable({
              startY: currentY,
              head: [item.headers],
              body: (item.rows || []).map((r) => r.cells),
              margin: { left: margin, right: margin },
              theme: 'grid',
              styles: {
                font: 'NotoSans',
                fontSize: 8.5,
                cellPadding: 2.8,
                overflow: 'linebreak',
                textColor: [30, 41, 59],
              },
              headStyles: {
                fillColor: [30, 58, 138],
                textColor: 255,
                fontStyle: 'bold',
                fontSize: 9,
              },
              alternateRowStyles: {
                fillColor: [248, 250, 252],
              },
            });
            currentY = (doc as any).lastAutoTable?.finalY
              ? (doc as any).lastAutoTable.finalY + 6
              : currentY + 15;
          } else if (item.type === 'note') {
            const cleanNote = item.text.replace(/^Note:\s*/i, '');
            doc.setFontSize(8.5);
            const noteLines = doc.splitTextToSize(cleanNote, contentWidth - 8);
            const noteHeight = noteLines.length * 4.5 + 9;

            if (currentY + noteHeight > pageHeight - margin - 10) addNewPage();

            doc.setFillColor(254, 252, 232); // Light yellow
            doc.setDrawColor(253, 224, 71);
            doc.roundedRect(margin, currentY, contentWidth, noteHeight, 1.5, 1.5, 'FD');

            doc.setFont('NotoSans', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(180, 83, 9); // Amber 700
            doc.text('📌 Clinical Annotation:', margin + 4, currentY + 4.5);

            doc.setFont('NotoSans', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(120, 53, 15); // Amber 900
            doc.text(noteLines, margin + 4, currentY + 9);

            currentY += noteHeight + 4;
          }
        });

        // 5. Clinical Pearls Box (if present on slide)
        if (slide.clinicalPearls && slide.clinicalPearls.length > 0) {
          doc.setFontSize(8);
          const pearlLinesArr = slide.clinicalPearls.map((p) =>
            doc.splitTextToSize(`• ${p}`, contentWidth - 10)
          );
          const totalLines = pearlLinesArr.reduce((acc, lines) => acc + lines.length, 0);
          const boxHeight = totalLines * 4.2 + 9;

          if (currentY + boxHeight > pageHeight - margin - 10) addNewPage();

          doc.setFillColor(240, 253, 244); // Emerald 50
          doc.setDrawColor(187, 247, 208); // Emerald 200
          doc.roundedRect(margin, currentY, contentWidth, boxHeight, 1.5, 1.5, 'FD');

          doc.setFont('NotoSans', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(21, 128, 61); // Emerald 700
          doc.text('✨ Clinical Pearls & High-Yield Insights', margin + 4, currentY + 4.8);

          doc.setFont('NotoSans', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(6, 78, 59); // Emerald 900
          let pearlY = currentY + 9;
          pearlLinesArr.forEach((lines) => {
            doc.text(lines, margin + 4, pearlY);
            pearlY += lines.length * 4.2;
          });

          currentY += boxHeight + 4;
        }

        // 6. Proactive Viva / Board Questions (if present on slide)
        if (slide.proactiveQuestions && slide.proactiveQuestions.length > 0) {
          doc.setFontSize(8);
          const qLinesArr = slide.proactiveQuestions.map((q, qIdx) =>
            doc.splitTextToSize(`Q${qIdx + 1}: ${q}`, contentWidth - 10)
          );
          const totalQCount = qLinesArr.reduce((acc, lines) => acc + lines.length, 0);
          const boxHeight = totalQCount * 4.2 + 9;

          if (currentY + boxHeight > pageHeight - margin - 10) addNewPage();

          doc.setFillColor(239, 246, 255); // Blue 50
          doc.setDrawColor(191, 219, 254); // Blue 200
          doc.roundedRect(margin, currentY, contentWidth, boxHeight, 1.5, 1.5, 'FD');

          doc.setFont('NotoSans', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(29, 78, 216); // Blue 700
          doc.text('❓ Viva & Board Exam Focus Questions', margin + 4, currentY + 4.8);

          doc.setFont('NotoSans', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(30, 58, 138); // Blue 900
          let qY = currentY + 9;
          qLinesArr.forEach((lines) => {
            doc.text(lines, margin + 4, qY);
            qY += lines.length * 4.2;
          });

          currentY += boxHeight + 4;
        }
      });

      // 7. Add Footers and Page Numbers to all pages
      const totalPages = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('NotoSans', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);

        // Bottom line
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, pageHeight - 8, pageWidth - margin, pageHeight - 8);

        doc.text(`MediGen Slide Studio • ${topic || 'Medical Presentation'}`, margin, pageHeight - 4.5);
        doc.text(`Slide ${i} of ${totalPages}`, pageWidth - margin - 20, pageHeight - 4.5);
      }

      const fileName = `${topic.replace(/\s+/g, '_') || 'medical_presentation'}.pdf`;
      doc.save(fileName);
      toast({ title: 'PDF Downloaded', description: 'Your formatted PDF presentation has been saved.' });
    } catch (e) {
      console.error('PDF export error:', e);
      toast({ title: 'Error', description: 'Failed to generate PDF.', variant: 'destructive' });
    } finally {
      setIsModifying(false);
    }
  };

  const virtualSlideRef = React.useRef<HTMLDivElement>(null);

  // PowerPoint Export using DOM measurement and intelligent pagination
  const handleExportToPptx = async () => {
    setIsModifying(true);
    try {
      const docName = `${topic.replace(/\s+/g, '_') || 'medical_presentation'}.pptx`;
      await generatePptx(slides, docName, virtualSlideRef.current);
      toast({
        title: 'PowerPoint Downloaded',
        description: 'Your PowerPoint document (.pptx) has been generated with clean pagination.',
      });
    } catch (e) {
      console.error('PPTX export error:', e);
      toast({ title: 'Error', description: 'Failed to generate PowerPoint file.', variant: 'destructive' });
    } finally {
      setIsModifying(false);
    }
  };

  // Word (.docx) Export
  const handleExportToWord = async () => {
    setIsModifying(true);
    try {
      const docChildren: (Paragraph | Table)[] = [];

      slides.forEach((slide) => {
        docChildren.push(
          new Paragraph({
            text: slide.title,
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 150 },
          })
        );

        slide.content.forEach((item) => {
          if (item.type === 'paragraph') {
            docChildren.push(new Paragraph({ text: item.text, spacing: { after: 100 } }));
          } else if (item.type === 'bullet_list') {
            (item.items || []).forEach((li) => {
              docChildren.push(new Paragraph({ text: li.text, bullet: { level: 0 }, spacing: { after: 50 } }));
            });
          } else if (item.type === 'table') {
            const headerRow = new DocxTableRow({
              children: item.headers.map((h) => new TableCell({ children: [new Paragraph({ text: h, alignment: AlignmentType.CENTER })], shading: { fill: 'EBF2FA' } })),
              tableHeader: true,
            });
            const bodyRows = item.rows.map((row) => new DocxTableRow({ children: row.cells.map((c) => new TableCell({ children: [new Paragraph({ text: c })] })) }));
            docChildren.push(new Table({ rows: [headerRow, ...bodyRows], width: { size: 9000, type: 'dxa' }, borders: { top: { style: BorderStyle.SINGLE, size: 1, color: 'D3D3D3' }, bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D3D3D3' }, left: { style: BorderStyle.SINGLE, size: 1, color: 'D3D3D3' }, right: { style: BorderStyle.SINGLE, size: 1, color: 'D3D3D3' }, insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'D3D3D3' }, insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'D3D3D3' } } }));
            docChildren.push(new Paragraph({ text: '', spacing: { after: 150 } }));
          } else if (item.type === 'note') {
            docChildren.push(new Paragraph({ children: [new TextRun({ text: 'Clinical Note: ', bold: true, italics: true }), new TextRun({ text: item.text.replace(/^Note:\s*/i, ''), italics: true })], spacing: { after: 100 } }));
          }
        });
      });

      const doc = new Document({ sections: [{ children: docChildren }] });
      const blob = await Packer.toBlob(doc);
      const docName = `${topic.replace(/\s+/g, '_') || 'medical_document'}.docx`;
      saveAs(blob, docName);
      toast({ title: 'Word Document Downloaded', description: 'Your .docx file has been saved.' });
    } catch (e) {
      console.error('Word export error:', e);
      toast({ title: 'Error', description: 'Failed to generate Word document.', variant: 'destructive' });
    } finally {
      setIsModifying(false);
    }
  };

  const allSelected = selectedIndices.length > 0 && selectedIndices.length === slides.length;
  const someSelected = selectedIndices.length > 0 && selectedIndices.length < slides.length;
  const checkboxState = allSelected ? true : someSelected ? 'indeterminate' : false;

  return (
    <div className="relative w-full max-w-full space-y-6">
      {/* Hidden virtual slide element for pixel-perfect PPT height measurement */}
      <div
        id="virtual-slide"
        ref={virtualSlideRef}
        style={{
          position: 'absolute',
          top: '-9999px',
          left: '-9999px',
          visibility: 'hidden',
          width: '864px', /* 9.0 in * 96 DPI */
          padding: '0',
          fontFamily: 'Inter, system-ui, sans-serif',
          lineHeight: '1.4',
        }}
      />
      <Card className="border shadow-sm w-full">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg sm:text-xl">Interactive Slide Presentation Deck</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Rearrange, enrich, or export your clinical presentation deck.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {onNewCase && (
                <Button variant="outline" size="sm" onClick={onNewCase} disabled={isModifying} className="text-xs">
                  <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> New Case
                </Button>
              )}
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="deck-topic" className="text-xs font-semibold text-muted-foreground">Presentation Topic</Label>
              <Input id="deck-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="h-8 text-xs sm:text-sm" />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={handleAddSectionClick} disabled={isModifying} className="h-8 text-xs gap-1">
                <Plus className="h-3.5 w-3.5" /> Add Section
              </Button>
              <Button variant="outline" size="sm" onClick={handleCopyRawContent} disabled={isModifying || slides.length === 0} className="h-8 text-xs gap-1">
                <ClipboardCopy className="h-3.5 w-3.5" /> Copy JSON
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportToWord} disabled={isModifying || slides.length === 0} className="h-8 text-xs gap-1">
                <File className="h-3.5 w-3.5" /> Word
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportToPdf} disabled={isModifying || slides.length === 0} className="h-8 text-xs gap-1">
                <FileDown className="h-3.5 w-3.5" /> PDF
              </Button>
              <Button size="sm" onClick={handleExportToPptx} disabled={isModifying || slides.length === 0} className="h-8 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white">
                <File className="h-3.5 w-3.5" /> PPTX
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setIsPresenting(true); setPresentingIndex(0); }}
                className="h-8 gap-1.5 text-xs font-semibold"
                disabled={!slides || slides.length === 0}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Present</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all"
                onCheckedChange={handleSelectAll}
                checked={checkboxState}
                className="h-4 w-4 rounded border-2 border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
              />
              <Label htmlFor="select-all" className="text-xs sm:text-sm font-semibold cursor-pointer select-none">
                {selectedIndices.length > 0
                  ? `${selectedIndices.length} of ${slides.length} selected`
                  : 'Select slides to modify'}
              </Label>
            </div>

            {selectedIndices.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {isModifying && (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-primary font-bold animate-pulse px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      <span>Enriching {selectedIndices.length} slide{selectedIndices.length > 1 ? 's' : ''}...</span>
                    </span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={handleStopSlideModify}
                      className="h-7 text-xs font-semibold gap-1.5 shadow-2xs"
                      title="Stop slide enrichment"
                    >
                      <Square className="h-3 w-3 fill-current" />
                      <span>Stop</span>
                    </Button>
                  </div>
                )}
                {!isModifying && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleModifySlides('replace_content')}
                      className="h-7 text-xs font-semibold gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40 shadow-2xs"
                    >
                      <RefreshCw className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                      <span>Regenerate Selected ({selectedIndices.length})</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleModifySlides('expand_selected')}
                      className="h-7 text-xs font-semibold gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 shadow-2xs"
                    >
                      <Scaling className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                      <span>Expand Depth ({selectedIndices.length})</span>
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Collapsible Live AI Streaming & Raw Output Box */}
          <AiStreamingRawLogBox
            isLoading={isModifying || isSuggestingTopics}
            streamText={streamText}
            thinkingText={streamThinking}
            currentStep={streamStep}
            modelName={streamModelName || formatModelDisplayName(activeModel || aiConfig?.customModel || aiConfig?.geminiModel)}
            onStop={handleStopSlideModify}
            title="Slide AI Synthesis & Streaming Output"
            className="mb-4"
          />

          {/* Dnd Sortable Slide List */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={slides.map((s) => s.title)} strategy={verticalListSortingStrategy}>
              <div className="space-y-6">
                {slides.map((slide, index) => (
                  <SortableSlideItem key={slide.title} id={slide.title}>
                    {({ attributes, listeners }) => (
                      <div className="relative w-full">
                        {/* Slide Control Bar: Drag, Select Checkbox, Contextual Refresh/Expand, Delete */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Drag to reorder */}
                            <button
                              type="button"
                              {...attributes}
                              {...listeners}
                              className="cursor-grab active:cursor-grabbing h-7 px-2 rounded-lg bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground text-xs flex items-center gap-1 transition-all border border-border/60"
                              title="Drag to reorder slide"
                              aria-label="Drag to reorder"
                            >
                              <GripVertical className="h-3.5 w-3.5" />
                              <span className="text-[11px] font-medium hidden sm:inline">Move</span>
                            </button>

                            {/* Checkbox with visible high-contrast styling in light and dark modes */}
                            <label
                              htmlFor={`select-${index}`}
                              className={cn(
                                "flex items-center gap-2 h-7 px-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all select-none",
                                selectedIndices.includes(index)
                                  ? "bg-primary/10 border-primary text-primary shadow-2xs"
                                  : "bg-card border-border text-foreground hover:border-primary/60 hover:bg-muted/40"
                              )}
                            >
                              <Checkbox
                                id={`select-${index}`}
                                checked={selectedIndices.includes(index)}
                                onCheckedChange={(checked) => handleSelectionChange(index, !!checked)}
                                className="h-4 w-4 rounded border-2 border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                              />
                              <span className="text-xs font-bold">Select #{index + 1}</span>
                            </label>

                            {/* When checked: Show Refresh and Expand buttons immediately on this slide */}
                            {selectedIndices.includes(index) && (
                              <div className="flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleModifySingleSlide(index, 'replace_content')}
                                  disabled={isModifying}
                                  className="h-7 px-2.5 text-xs font-semibold gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40 shadow-2xs"
                                  title="Regenerate and refresh this slide"
                                >
                                  <RefreshCw
                                    className={cn(
                                      "h-3.5 w-3.5 text-blue-600 dark:text-blue-400",
                                      loadingSlides.has(index) && "animate-spin"
                                    )}
                                  />
                                  <span>Refresh</span>
                                </Button>

                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleModifySingleSlide(index, 'expand_selected')}
                                  disabled={isModifying}
                                  className="h-7 px-2.5 text-xs font-semibold gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 shadow-2xs"
                                  title="Expand depth and clinical detail for this slide"
                                >
                                  <Scaling className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                  <span>Expand</span>
                                </Button>
                              </div>
                            )}
                          </div>

                          {/* Delete slide button */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSlide(index)}
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all gap-1 border border-border/40 hover:border-destructive/20"
                            title="Delete slide"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="text-[11px] hidden sm:inline">Delete</span>
                          </Button>
                        </div>

                        <EnhancedSlideRenderer
                          slide={slide}
                          index={index}
                          presentationTopic={topic}
                          caseContext={questionContext}
                          isSelected={selectedIndices.includes(index)}
                          isLoading={loadingSlides.has(index)}
                          onUpdateSlide={(updated) => handleUpdateSlide(index, updated)}
                        />
                      </div>
                    )}
                  </SortableSlideItem>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>

      {/* Add New Section Modal */}
      <AlertDialog open={isAddSectionModalOpen} onOpenChange={setIsAddSectionModalOpen}>
        <AlertDialogContent className="max-w-md sm:max-w-lg max-h-[85vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>Add New Clinical Section</AlertDialogTitle>
            <AlertDialogDescription>
              Select suggested high-yield topics or enter your own to append to this presentation deck.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {isSuggestingTopics ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs">Consultant AI generating relevant topic suggestions...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {newTopicSuggestions.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">
                      Suggested Medical Topics
                    </Label>
                    <div className="grid grid-cols-1 gap-2">
                      {newTopicSuggestions.map((t, idx) => {
                        const isUsed = usedTopics.includes(t) || slides.some((s) => s.title === t);
                        return (
                          <div
                            key={idx}
                            className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs sm:text-sm transition-all ${
                              isUsed ? 'bg-muted/40 opacity-60' : 'hover:bg-accent/50'
                            }`}
                          >
                            <Checkbox
                              id={`topic-${idx}`}
                              checked={isUsed || selectedNewTopics.includes(t)}
                              disabled={isUsed}
                              onCheckedChange={(checked) => {
                                setSelectedNewTopics((prev) =>
                                  checked ? [...prev, t] : prev.filter((item) => item !== t)
                                );
                              }}
                            />
                            <Label
                              htmlFor={`topic-${idx}`}
                              className={`flex-1 cursor-pointer font-medium ${
                                isUsed ? 'line-through text-muted-foreground' : ''
                              }`}
                            >
                              {t}
                              {isUsed && <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">(Already Added)</span>}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 pt-2">
                  <Label htmlFor="custom-topic" className="text-xs font-semibold">
                    Or Enter Custom Topic
                  </Label>
                  <Input
                    id="custom-topic"
                    placeholder="e.g. Advanced Pharmacokinetics & Drug Interactions"
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    className="text-xs sm:text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          <AlertDialogFooter className="pt-3 border-t flex items-center justify-between sm:justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchNewTopicSuggestions}
              disabled={isSuggestingTopics}
              className="text-xs gap-1"
            >
              <RefreshCw className="h-3 w-3" /> Refresh Suggestions
            </Button>
            <div className="flex items-center gap-2">
              <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
              <Button
                size="sm"
                onClick={handleAddSelectedSlides}
                disabled={isModifying || (selectedNewTopics.length === 0 && !customTopic.trim())}
                className="text-xs gap-1"
              >
                {isModifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add Sections
              </Button>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isPresenting && slides && slides.length > 0 && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsPresenting(false);
            if (e.key === 'ArrowRight' || e.key === ' ') setPresentingIndex((i) => Math.min(i + 1, slides.length - 1));
            if (e.key === 'ArrowLeft') setPresentingIndex((i) => Math.max(i - 1, 0));
          }}
          tabIndex={0}
          ref={(el) => el?.focus()}
        >
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-3 z-10">
            <span className="text-white/70 text-sm font-mono">
              {presentingIndex + 1} / {slides.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPresenting(false)}
              className="text-white/70 hover:text-white hover:bg-white/10 gap-1.5 text-xs"
            >
              <X className="h-4 w-4" />
              <span>Exit (ESC)</span>
            </Button>
          </div>

          {/* Slide content */}
          <div className="w-full max-w-4xl mx-auto px-8 py-4 overflow-y-auto max-h-[85vh]">
            <EnhancedSlideRenderer
              slide={slides[presentingIndex]}
              index={presentingIndex}
              presentationTopic={topic || slides[0]?.title || 'Presentation'}
              caseContext={questionContext}
            />
          </div>

          {/* Navigation arrows */}
          <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPresentingIndex((i) => Math.max(i - 1, 0))}
              disabled={presentingIndex === 0}
              className="h-10 w-10 rounded-full text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <div className="flex gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPresentingIndex(i)}
                  className={`h-2 rounded-full transition-all ${i === presentingIndex ? 'w-6 bg-primary' : 'w-2 bg-white/30 hover:bg-white/50'}`}
                />
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPresentingIndex((i) => Math.min(i + 1, slides.length - 1))}
              disabled={presentingIndex === slides.length - 1}
              className="h-10 w-10 rounded-full text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
