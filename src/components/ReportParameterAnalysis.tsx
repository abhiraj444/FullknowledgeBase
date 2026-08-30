'use client';

import { useState, useMemo } from 'react';
import type { ReportKnowledgeData, ReportParameter, ParameterStatus } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FileText,
  Search,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Sparkles,
  ArrowRight,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  BrainCircuit,
  Filter,
  Stethoscope,
  FileDown,
  Printer,
  Loader2,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { registerNotoSansRegular } from '@/lib/pdf-fonts/NotoSansRegular';
import { registerNotoSansBold } from '@/lib/pdf-fonts/NotoSansBold';
import { registerNotoSansItalic } from '@/lib/pdf-fonts/NotoSansItalic';
import { SpeechSynthesisButton } from '@/components/SpeechSynthesisButton';

interface ReportParameterAnalysisProps {
  data: ReportKnowledgeData;
  onProceedToDiagnosis?: () => void;
  isProceedingToDiagnosis?: boolean;
  hasExistingDiagnosis?: boolean;
}

export function ReportParameterAnalysis({
  data,
  onProceedToDiagnosis,
  isProceedingToDiagnosis = false,
  hasExistingDiagnosis = false,
}: ReportParameterAnalysisProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copied, setCopied] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const { toast } = useToast();

  const categories = useMemo(() => {
    if (!data.categories) return [];
    return data.categories.map((c) => c.categoryName);
  }, [data.categories]);

  const allParameters = useMemo(() => {
    if (!data.categories) return [];
    const list: ReportParameter[] = [];
    data.categories.forEach((cat) => {
      cat.parameters.forEach((param) => {
        list.push({ ...param, category: param.category || cat.categoryName });
      });
    });
    return list;
  }, [data.categories]);

  const filteredParameters = useMemo(() => {
    return allParameters.filter((param) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        param.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        param.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        param.interpretation.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        selectedCategory === 'all' || param.category.toLowerCase() === selectedCategory.toLowerCase();

      return matchesSearch && matchesCategory;
    });
  }, [allParameters, searchQuery, selectedCategory]);

  const getStatusBadge = (status: ParameterStatus) => {
    switch (status) {
      case 'critical_high':
        return (
          <span className="stamp-badge stamp-emergent text-[10px] animate-pulse">
            <ShieldAlert className="h-3 w-3" /> CRITICAL HIGH ▲
          </span>
        );
      case 'critical_low':
        return (
          <span className="stamp-badge stamp-emergent text-[10px] animate-pulse">
            <ShieldAlert className="h-3 w-3" /> CRITICAL LOW ▼
          </span>
        );
      case 'high':
        return (
          <span className="stamp-badge stamp-urgent text-[10px]">
            <TrendingUp className="h-3 w-3" /> HIGH ▲
          </span>
        );
      case 'low':
        return (
          <span className="stamp-badge stamp-urgent text-[10px]">
            <TrendingDown className="h-3 w-3" /> LOW ▼
          </span>
        );
      case 'abnormal':
        return (
          <span className="stamp-badge stamp-urgent text-[10px]">
            <AlertTriangle className="h-3 w-3" /> ABNORMAL
          </span>
        );
      case 'borderline':
        return (
          <span className="stamp-badge stamp-inquiry text-[10px]">
            BORDERLINE
          </span>
        );
      case 'normal':
      default:
        return (
          <span className="stamp-badge stamp-confirmed text-[9px]">
            <CheckCircle2 className="h-3 w-3" /> NORMAL
          </span>
        );
    }
  };

  const getStatusBorderClass = (status: ParameterStatus) => {
    switch (status) {
      case 'critical_high':
      case 'critical_low':
        return 'border-red-500/50 bg-red-500/5 dark:bg-red-950/20';
      case 'high':
      case 'low':
      case 'abnormal':
        return 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-950/20';
      case 'borderline':
        return 'border-blue-500/40 bg-blue-500/5 dark:bg-blue-950/20';
      case 'normal':
      default:
        return 'border-border bg-card';
    }
  };

  const getValueColorClass = (status: ParameterStatus) => {
    switch (status) {
      case 'critical_high':
      case 'critical_low':
        return 'text-red-600 dark:text-red-400 font-extrabold';
      case 'high':
      case 'low':
      case 'abnormal':
        return 'text-amber-600 dark:text-amber-400 font-bold';
      case 'normal':
      default:
        return 'text-foreground font-bold';
    }
  };

  const handleCopySummary = () => {
    const summaryLines = [
      `=== MEDICAL REPORT PARAMETER BREAKDOWN ===`,
      `Report Type: ${data.reportType || 'Clinical Diagnostic Report'}`,
      data.patientOverview ? `Overview: ${data.patientOverview}` : '',
      `Total Parameters: ${allParameters.length} | Abnormal/Critical: ${data.abnormalParametersCount || 0}`,
      '',
      '--- PARAMETERS ---',
      ...allParameters.map(
        (p) =>
          `• ${p.name} [${p.category}]: ${p.value} ${p.unit || ''} (Ref: ${p.referenceRange || 'N/A'}) - Status: ${p.status.toUpperCase()}\n  Interpretation: ${p.interpretation}\n  What if Increased: ${p.whatIfIncreased}\n  What if Decreased: ${p.whatIfDecreased}`
      ),
      '',
      '--- KEY CLINICAL HIGHLIGHTS ---',
      ...(data.keyClinicalHighlights || []).map((h, i) => `${i + 1}. ${h}`),
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(summaryLines);
    setCopied(true);
    toast({ title: 'Report Copied', description: 'Structured parameter analysis copied to clipboard.' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPdf = () => {
    if (allParameters.length === 0) {
      toast({ title: 'No Parameters', description: 'No report parameters to export.', variant: 'destructive' });
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      registerNotoSansRegular(doc);
      registerNotoSansBold(doc);
      registerNotoSansItalic(doc);
      doc.setFont('NotoSans');

      const margin = 14;
      let currentY = margin;
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const contentWidth = pageWidth - 2 * margin;

      // Header Banner
      doc.setFillColor(30, 58, 138); // Navy Blue #1E3A8A
      doc.rect(margin, currentY, contentWidth, 18, 'F');

      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text('MEDIGEN CLINICAL REPORT & PARAMETER ANALYSIS', margin + 5, currentY + 7);

      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(200, 220, 255);
      doc.text(
        `Generated: ${new Date().toLocaleString()} | ${data.reportType || 'Clinical Diagnostic Report'}`,
        margin + 5,
        currentY + 13
      );

      currentY += 23;

      // Report Overview Box with dynamic height
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(8);
      let overviewLines: string[] = [];
      if (data.patientOverview) {
        overviewLines = doc.splitTextToSize(`Overview: ${data.patientOverview}`, contentWidth - 10);
      }
      const overviewHeight = Math.max(overviewLines.length * 4.2 + (data.patientOverview ? 16 : 14), 16);

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, currentY, contentWidth, overviewHeight, 2, 2, 'FD');

      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(data.reportType || 'Clinical Diagnostic Report', margin + 4, currentY + 5.5);

      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Total Parameters: ${allParameters.length}    |    Out of Range / Abnormal: ${data.abnormalParametersCount || 0}`,
        margin + 4,
        currentY + 10.5
      );

      if (overviewLines.length > 0) {
        doc.setFont('NotoSans', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        doc.text(overviewLines, margin + 4, currentY + 15.5);
      }

      currentY += overviewHeight + 4;

      // Critical Alerts if any
      if (data.criticalAlerts && data.criticalAlerts.length > 0) {
        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(8);
        const alertText = data.criticalAlerts.join(' • ');
        const alertLines = doc.splitTextToSize(`CRITICAL ALERTS: ${alertText}`, contentWidth - 12);
        const alertHeight = alertLines.length * 4.4 + 7;

        if (currentY + alertHeight > pageHeight - margin - 15) {
          doc.addPage();
          currentY = margin;
        }

        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(252, 165, 165);
        doc.roundedRect(margin, currentY, contentWidth, alertHeight, 1.5, 1.5, 'FD');

        doc.setTextColor(185, 28, 28);
        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(8);
        doc.text(alertLines, margin + 5, currentY + 4.8);

        currentY += alertHeight + 4;
      }

      // Key Clinical Highlights
      if (data.keyClinicalHighlights && data.keyClinicalHighlights.length > 0) {
        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(30, 58, 138);
        doc.text('Key Clinical Highlights & Takeaways', margin, currentY);
        currentY += 4.5;

        doc.setFont('NotoSans', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        data.keyClinicalHighlights.forEach((highlight) => {
          const lines = doc.splitTextToSize(`• ${highlight}`, contentWidth - 8);
          doc.text(lines, margin + 2, currentY);
          currentY += lines.length * 3.8 + 1.2;
        });
        currentY += 3;
      }

      // Parameter Summary Table
      const tableRows = allParameters.map((p, idx) => [
        `${idx + 1}. ${p.name}`,
        p.category || 'General',
        `${p.value} ${p.unit || ''}`.trim(),
        p.referenceRange || 'N/A',
        p.status.toUpperCase().replace('_', ' '),
        p.interpretation || 'Evaluated',
      ]);

      (doc as any).autoTable({
        startY: currentY,
        head: [['Parameter', 'Category', 'Observed Value', 'Ref. Range', 'Status', 'Clinical Interpretation']],
        body: tableRows,
        margin: { left: margin, right: margin },
        theme: 'grid',
        styles: {
          font: 'NotoSans',
          fontSize: 7.5,
          cellPadding: 2.2,
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [30, 58, 138],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8,
        },
        columnStyles: {
          0: { cellWidth: 32, fontStyle: 'bold' },
          1: { cellWidth: 26 },
          2: { cellWidth: 24, fontStyle: 'bold' },
          3: { cellWidth: 24 },
          4: { cellWidth: 22, fontStyle: 'bold' },
          5: { cellWidth: 'auto' },
        },
        didParseCell: (hookData: any) => {
          if (hookData.section === 'body') {
            const rowData = allParameters[hookData.row.index];
            if (rowData) {
              if (hookData.column.index === 4) {
                if (rowData.status === 'critical_high' || rowData.status === 'critical_low') {
                  hookData.cell.styles.textColor = [185, 28, 28];
                } else if (rowData.status === 'high' || rowData.status === 'low') {
                  hookData.cell.styles.textColor = [217, 119, 6];
                } else if (rowData.status === 'normal') {
                  hookData.cell.styles.textColor = [16, 185, 129];
                }
              }
            }
          }
        },
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;

      // Detailed "What If" Clinical Analysis Section
      if (currentY > pageHeight - 40) {
        doc.addPage();
        currentY = margin;
      }

      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 58, 138);
      doc.text('Detailed Parameter "What-If?" Pathophysiology Breakdown', margin, currentY);
      currentY += 6;

      allParameters.forEach((param, index) => {
        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(8.5);
        const headerText = `${index + 1}. ${param.name} (${param.category}) — Observed: ${param.value} ${param.unit || ''} [${param.status.toUpperCase().replace('_', ' ')}]`;
        const headerLines = doc.splitTextToSize(headerText, contentWidth - 8);
        const headerBoxHeight = headerLines.length * 4.4 + 4;

        if (currentY + headerBoxHeight + 20 > pageHeight - margin - 10) {
          doc.addPage();
          currentY = margin;
        }

        // Parameter Header Box with auto-wrapping
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(margin, currentY, contentWidth, headerBoxHeight, 1, 1, 'F');
        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(headerLines, margin + 4, currentY + 4.2);
        currentY += headerBoxHeight + 2;

        // What if Increased
        if (param.whatIfIncreased) {
          doc.setFont('NotoSans', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(185, 28, 28);
          doc.text('▲ What if Increased / Elevated:', margin + 4, currentY);
          currentY += 3.8;

          doc.setFont('NotoSans', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(51, 65, 85);
          const incLines = doc.splitTextToSize(param.whatIfIncreased, contentWidth - 10);
          if (currentY + incLines.length * 3.5 > pageHeight - margin - 5) {
            doc.addPage();
            currentY = margin;
          }
          doc.text(incLines, margin + 5, currentY);
          currentY += incLines.length * 3.5 + 2.5;
        }

        // What if Decreased
        if (param.whatIfDecreased) {
          if (currentY + 15 > pageHeight - margin - 5) {
            doc.addPage();
            currentY = margin;
          }
          doc.setFont('NotoSans', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(37, 99, 235);
          doc.text('▼ What if Decreased / Low:', margin + 4, currentY);
          currentY += 3.8;

          doc.setFont('NotoSans', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(51, 65, 85);
          const decLines = doc.splitTextToSize(param.whatIfDecreased, contentWidth - 10);
          if (currentY + decLines.length * 3.5 > pageHeight - margin - 5) {
            doc.addPage();
            currentY = margin;
          }
          doc.text(decLines, margin + 5, currentY);
          currentY += decLines.length * 3.5 + 4;
        }
      });

      // Add Page Numbers & Footer to all pages
      const totalPages = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('NotoSans', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);

        // Bottom line
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, pageHeight - 8, pageWidth - margin, pageHeight - 8);

        doc.text('MediGen Clinical Intelligence • Diagnostic Support & Education', margin, pageHeight - 4.5);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 18, pageHeight - 4.5);
      }

      const cleanFileName = (data.reportType || 'Medical_Report_Parameters')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 30);
      doc.save(`${cleanFileName}_Parameters.pdf`);
      toast({ title: 'PDF Downloaded', description: 'Structured laboratory report saved as PDF.' });
    } catch (err: any) {
      console.error('PDF generation error:', err);
      toast({ title: 'PDF Generation Failed', description: err?.message || 'Could not export PDF.', variant: 'destructive' });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 w-full max-w-full">
      {/* Top Header Card */}
      <Card className="border border-border bg-card shadow-xs overflow-hidden print:border-none print:shadow-none">
        {/* Top Oxford Blue & Emerald Ruler Strip */}
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-primary to-emerald-500 print:hidden" />

        <CardHeader className="p-4 sm:p-6 pb-3 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="stamp-badge text-[10px] stamp-inquiry">
                  LAB &amp; REPORT KNOWLEDGE
                </span>
                {data.abnormalParametersCount > 0 && (
                  <span className="stamp-badge text-[10px] stamp-urgent">
                    {data.abnormalParametersCount} OUT OF RANGE
                  </span>
                )}
              </div>
              <CardTitle className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {data.reportType || 'Diagnostic Report & Parameter Breakdown'}
              </CardTitle>
              {data.patientOverview && (
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {data.patientOverview}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 print:hidden">
              <SpeechSynthesisButton
                text={`${data.reportType || 'Medical Report'}. ${data.patientOverview || ''}. ${
                  data.criticalAlerts && data.criticalAlerts.length > 0 ? `Critical alerts: ${data.criticalAlerts.join('. ')}. ` : ''
                }${data.keyClinicalHighlights && data.keyClinicalHighlights.length > 0 ? `Key highlights: ${data.keyClinicalHighlights.join('. ')}` : ''}`}
                label="Listen"
                showLabel={true}
                size="sm"
                className="h-8 text-xs font-semibold gap-1.5"
              />

              <Button
                variant="default"
                size="sm"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className="h-8 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs"
                title="Download formatted PDF report"
              >
                {isGeneratingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                <span>{isGeneratingPdf ? 'Generating PDF...' : 'Download PDF'}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="h-8 text-xs font-semibold gap-1.5 shadow-2xs"
                title="Print report"
              >
                <Printer className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">Print</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleCopySummary}
                className="h-8 text-xs gap-1.5 shadow-2xs"
                title="Copy lab sheet text"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy Lab Sheet'}</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Critical Alerts Banner (if present) */}
        {data.criticalAlerts && data.criticalAlerts.length > 0 && (
          <div className="mx-4 sm:mx-6 mb-4 p-3.5 rounded-xl border border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-xs">
              <ShieldAlert className="h-4 w-4 text-red-600 animate-pulse" />
              <span>CRITICAL LABORATORY / IMAGING ALERTS</span>
            </div>
            <ul className="list-disc list-inside text-xs space-y-1 pl-1">
              {data.criticalAlerts.map((alert, idx) => (
                <li key={idx} className="leading-snug">{alert}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Key Highlights / Pearls Sticky Note */}
        {data.keyClinicalHighlights && data.keyClinicalHighlights.length > 0 && (
          <div className="mx-4 sm:mx-6 mb-4 p-3.5 rounded-xl sticky-note-green border space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              <Sparkles className="h-4 w-4" />
              <span>Key Diagnostic Highlights &amp; Pearls</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs leading-relaxed text-emerald-950 dark:text-emerald-100">
              {data.keyClinicalHighlights.map((highlight, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">•</span>
                  <span>{highlight}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search & Filter Toolbar */}
        <div className="p-4 sm:p-6 pt-0 space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-border">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search parameter by name, category, or interpretation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs sm:text-sm"
              />
            </div>
            <span className="text-xs text-muted-foreground shrink-0 font-mono">
              Showing {filteredParameters.length} of {allParameters.length} parameters
            </span>
          </div>

          {/* Category Filter Chips */}
          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  selectedCategory === 'all'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                All Categories ({allParameters.length})
              </button>
              {categories.map((cat, i) => {
                const count = allParameters.filter(
                  (p) => p.category.toLowerCase() === cat.toLowerCase()
                ).length;
                const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      isSelected
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Parameter Cards Grid */}
      {filteredParameters.length === 0 ? (
        <div className="p-8 text-center border border-dashed rounded-xl space-y-2 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <p className="text-sm font-semibold">No parameters match your filter.</p>
          <p className="text-xs">Try clearing your search query or selecting &quot;All Categories&quot;.</p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredParameters.map((param, index) => (
            <Card
              key={index}
              className={`relative overflow-hidden rounded-xl border transition-all duration-200 ${getStatusBorderClass(
                param.status
              )}`}
            >
              <CardContent className="p-4 sm:p-5 space-y-3">
                {/* Parameter Title & Value Row */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-base font-bold text-foreground">
                        {param.name}
                      </h4>
                      {getStatusBadge(param.status)}
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                      {param.category}
                    </span>
                  </div>

                  {/* Measured Value & Reference Box */}
                  <div className="flex items-baseline sm:flex-col sm:items-end gap-2 sm:gap-0.5 shrink-0 bg-background/80 px-3 py-1.5 rounded-lg border border-border">
                    <div className="flex items-baseline gap-1">
                      <span className={`text-base sm:text-lg font-mono ${getValueColorClass(param.status)}`}>
                        {param.value}
                      </span>
                      {param.unit && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {param.unit}
                        </span>
                      )}
                    </div>
                    {param.referenceRange && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        Ref: {param.referenceRange}
                      </span>
                    )}
                  </div>
                </div>

                {/* Patient Clinical Interpretation */}
                <div className="text-xs sm:text-sm text-foreground/90 leading-relaxed pt-1">
                  <strong className="text-primary font-semibold">Interpretation: </strong>
                  {param.interpretation}
                </div>

                {/* Collapsible What-If Physiology Accordion */}
                <Accordion type="single" collapsible className="w-full pt-1 border-t border-border/60">
                  <AccordionItem value="what-if" className="border-none">
                    <AccordionTrigger className="py-1.5 text-xs font-semibold text-muted-foreground hover:text-primary">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                        <span>Clinical What-If Analysis (Increased vs. Decreased Significance)</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 pt-1">
                        {/* What if Increased Box */}
                        <div className="p-3.5 rounded-xl sticky-note-yellow border space-y-1.5">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-amber-800 dark:text-amber-300">
                            <TrendingUp className="h-4 w-4" />
                            <span>What If Value Increases / Is High?</span>
                          </div>
                          <p className="text-xs leading-relaxed text-amber-950 dark:text-amber-100">
                            {param.whatIfIncreased || 'Indicates physiological or pathological hyper-elevation.'}
                          </p>
                        </div>

                        {/* What if Decreased Box */}
                        <div className="p-3.5 rounded-xl sticky-note-purple border space-y-1.5">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-purple-800 dark:text-purple-300">
                            <TrendingDown className="h-4 w-4" />
                            <span>What If Value Decreases / Is Low?</span>
                          </div>
                          <p className="text-xs leading-relaxed text-purple-950 dark:text-purple-100">
                            {param.whatIfDecreased || 'Indicates depletion, clearance failure, or hypo-functioning state.'}
                          </p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bridge / Next Step CTA Banner */}
      {onProceedToDiagnosis && !hasExistingDiagnosis && (
        <Card className="border border-primary/40 bg-primary/5 shadow-xs overflow-hidden">
          <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-primary shrink-0" />
                <h4 className="text-sm sm:text-base font-bold text-foreground">
                  Ready for Comprehensive Differential Diagnoses?
                </h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
                Synthesize these extracted parameters and clinical findings into ranked differential diagnoses, pre-test probabilities, and guideline-directed treatment protocols.
              </p>
            </div>
            <Button
              onClick={onProceedToDiagnosis}
              disabled={isProceedingToDiagnosis}
              className="w-full sm:w-auto h-9 text-xs sm:text-sm font-semibold gap-1.5 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
            >
              <span>{isProceedingToDiagnosis ? 'Analyzing Diagnoses...' : 'Generate Full Diagnosis'}</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
