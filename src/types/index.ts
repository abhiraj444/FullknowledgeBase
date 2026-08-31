'use client';

// For structured slide content
export interface ParagraphContent {
    type: 'paragraph';
    text: string;
    bold?: string[];
}

export interface ListItemContent {
    text: string;
    bold?: string[];
}

export interface BulletListContent {
    type: 'bullet_list';
    items: ListItemContent[];
}

export interface NumberedListContent {
    type: 'numbered_list';
    items: ListItemContent[];
}

export interface NoteContent {
    type: 'note';
    text: string;
}

export interface TableRowContent {
    cells: string[];
}

export interface TableContent {
    type: 'table';
    headers: string[];
    rows: TableRowContent[];
}

export type ContentItem = ParagraphContent | BulletListContent | NumberedListContent | NoteContent | TableContent;

export interface Slide {
    title: string;
    content: ContentItem[];
    summary?: string; // High-yield executive summary of the slide
    clinicalPearls?: string[]; // High-yield medical pearls / viva facts
    proactiveQuestions?: string[]; // Proactive board / deep-dive questions for this slide
}

export interface StructuredQuestion {
    summary: string;
    images: string[];
}

export interface FollowUpThread {
    id: string;
    question: string;
    answer: string;
    reasoning?: string;
    thinkingProcess?: string;
    timestamp: number;
    source?: 'diagnosis' | 'slide';
    slideTitle?: string;
}

export interface DiagnosisItem {
    diagnosis: string;
    confidenceLevel: number;
    reasoning: string;
    missingInformation?: {
        information?: string[];
        tests?: string[];
    };
    lifeThreatCategory?: 'Emergent' | 'Urgent' | 'Secondary';
}

export type ParameterStatus = 'normal' | 'high' | 'low' | 'critical_high' | 'critical_low' | 'abnormal' | 'borderline';

export interface ReportParameter {
    name: string;
    category: string;
    value: string;
    unit?: string;
    referenceRange?: string;
    status: ParameterStatus;
    interpretation: string;
    whatIfIncreased: string;
    whatIfDecreased: string;
}

export interface ReportCategoryGroup {
    categoryName: string;
    parameters: ReportParameter[];
}

export interface ReportKnowledgeData {
    reportType?: string;
    patientOverview?: string;
    sampleDateOrInfo?: string;
    totalParametersCount: number;
    abnormalParametersCount: number;
    categories: ReportCategoryGroup[];
    keyClinicalHighlights: string[];
    criticalAlerts?: string[];
}

export interface ClinicalAnswerData {
    answer: string;
    reasoning?: string;
    thinkingProcess?: string;
    topic?: string;
    keyTakeaways?: string[];
    proactiveQuestions?: string[];
    caseSummaryForPresentation?: string;
}

interface BaseCase {
    id: string;
    userId: string;
    title: string;
    createdAt: number;
}

export interface DiagnosisCase extends BaseCase {
    type: 'diagnosis';
    inputData: {
        patientData?: string;
        supportingDocuments?: string[];
        structuredQuestion?: StructuredQuestion;
    };
    outputData: {
        diagnoses: DiagnosisItem[];
        clinicalAnswer: ClinicalAnswerData | null;
        reportKnowledge?: ReportKnowledgeData | null;
        proactiveQuestions?: string[];
        caseSummaryForPresentation?: string;
        followUpThreads?: FollowUpThread[];
        thinkingProcess?: string;
    };
}

export interface ContentCase extends BaseCase {
    type: 'content-generator';
    inputData: {
        mode: 'question' | 'topic';
        question?: string;
        images?: string[];
        topic?: string;
        structuredQuestion?: StructuredQuestion;
        fromDiagnosisCaseId?: string;
    };
    outputData: {
        result: any;
        slides: Slide[] | null;
        outline?: string[];
        selectedTopics?: string[];
        usedTopics?: string[];
        suggestedTopics?: string[];
        followUpThreads?: FollowUpThread[];
        structuredQuestion?: StructuredQuestion;
    };
}

export interface KnowledgeNodeExplanation {
    standard?: string;
    firstPrinciples?: string;
    simplified?: string;
    userNotes?: string;
    lastUpdated?: number;
}

export interface KnowledgeTreeNode {
    id: string;
    title: string;
    description: string;
    depth: number;
    pyqTag?: string;
    keyTakeaway?: string;
    firstPrincipleAnchor?: string;
    children?: KnowledgeTreeNode[];
    explanation?: KnowledgeNodeExplanation;
    isExpanded?: boolean;
    isCustomAdded?: boolean;
    isNewlyDissected?: boolean;
    isNew?: boolean;
    dissectedAt?: number;
}

export interface KnowledgeMapData {
    id: string;
    title: string;
    documentSummary: string;
    originalInputText?: string;
    sourceFileCount?: number;
    createdAt: number;
    updatedAt: number;
    tree: KnowledgeTreeNode[];
}

export interface KnowledgeMapCase extends BaseCase {
    type: 'knowledge-map';
    inputData: {
        topicOrQuestion?: string;
        images?: string[];
        sourceType?: 'pdf' | 'pyq' | 'text' | 'image';
    };
    outputData: {
        knowledgeMap: KnowledgeMapData;
        totalNodesCount?: number;
        exploredCount?: number;
    };
}

export type Case = DiagnosisCase | ContentCase | KnowledgeMapCase;

export type AiProvider = 'gemini' | 'custom';

export type SttProvider = 'groq' | 'openai' | 'gemini' | 'custom';

export interface SttConfig {
    provider: SttProvider;
    apiKey?: string;
    endpoint?: string;
    model?: string;
}

export interface AiConfig {
    provider: AiProvider;
    apiKey?: string;
    geminiApiKey?: string;
    geminiModel?: string;
    customEndpoint?: string;
    customApiKey?: string;
    customModel?: string;
    thinkingBudget?: number;
    enableReasoning?: boolean;
    sttConfig?: SttConfig;
}

