import type { DiagnosisItem, ClinicalAnswerData, Slide, ReportKnowledgeData, ContentItem } from '@/types';

/**
 * Strips model thinking/reasoning tags (<think>, <thought>, <reasoning>, <antThinking>, etc.) from text,
 * separating the internal thinking chain from the user-facing output.
 */
export function stripThinkingTags(raw: string): { cleanText: string; thinking: string } {
  if (!raw || typeof raw !== 'string') return { cleanText: '', thinking: '' };

  let thinking = '';
  let cleanText = raw;

  // 1. Extract and remove closed thinking blocks: <think>...</think>, <thought>...</thought>, <reasoning>...</reasoning>, etc.
  const thinkRegex = /<(?:think|thought|reasoning|antThinking|reflection|internal_thought)>([\s\S]*?)<\/(?:think|thought|reasoning|antThinking|reflection|internal_thought)>/gi;
  let match: RegExpExecArray | null;
  while ((match = thinkRegex.exec(raw)) !== null) {
    if (match[1]) {
      thinking += (thinking ? '\n\n' : '') + match[1].trim();
    }
  }
  cleanText = cleanText.replace(thinkRegex, '').trim();

  // Also handle [THINKING]...[/THINKING] or [REASONING]...[/REASONING]
  const bracketThinkRegex = /\[(?:THINKING|REASONING|THOUGHT)\]([\s\S]*?)\[\/(?:THINKING|REASONING|THOUGHT)\]/gi;
  while ((match = bracketThinkRegex.exec(cleanText)) !== null) {
    if (match[1]) {
      thinking += (thinking ? '\n\n' : '') + match[1].trim();
    }
  }
  cleanText = cleanText.replace(bracketThinkRegex, '').trim();

  // 2. Handle unclosed opening tag anywhere in text (e.g. streaming tail or start)
  const openTagMatch = cleanText.match(/<(?:think|thought|reasoning|antThinking|reflection|internal_thought)>([\s\S]*)$/i);
  if (openTagMatch) {
    const unclosedContent = openTagMatch[1] || '';
    thinking += (thinking ? '\n\n' : '') + unclosedContent.trim();
    cleanText = cleanText.slice(0, openTagMatch.index).trim();
  }

  // 3. Remove any remaining stray tag remnants
  cleanText = cleanText.replace(/<\/?(?:think|thought|reasoning|antThinking|reflection|internal_thought)>/gi, '').trim();
  cleanText = cleanText.replace(/\[\/?(?:THINKING|REASONING|THOUGHT)\]/gi, '').trim();

  return { cleanText, thinking };
}

/**
 * Sanitizes clinical answer markdown text so raw JSON or thinking leftovers never render
 * in the final user-facing clinical synthesis container.
 */
export function sanitizeClinicalAnswerText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  const { cleanText } = stripThinkingTags(text);
  let cleaned = cleanText.trim();

  // If text starts with a JSON object or array, try extracting the answer property
  if (cleaned.startsWith('{') || cleaned.startsWith('```json') || cleaned.startsWith('```\n{')) {
    try {
      const parsed = parseAiJson<any>(cleaned, null);
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.answer === 'string' && parsed.answer.trim()) {
          return parsed.answer.trim();
        }
        if (typeof parsed.clinicalAnswer === 'object' && typeof parsed.clinicalAnswer.answer === 'string') {
          return parsed.clinicalAnswer.answer.trim();
        }
        if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
          return parsed.summary.trim();
        }
      }
    } catch {}
  }

  // Strip markdown code fences if wrapped entirely around the answer
  if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/^```(?:markdown|text|json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }

  return cleaned;
}

/**
 * Unescapes JSON string escape sequences (\n, \t, \", \\) safely
 */
function unescapeJsonStr(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/**
 * Repairs truncated, partial, or malformed JSON strings by closing unclosed quotes,
 * brackets, braces, and trailing commas.
 */
export function repairJsonString(jsonStr: string): string {
  let text = (jsonStr || '').trim();
  if (!text) return '{}';

  // Strip thinking tags first
  const { cleanText } = stripThinkingTags(text);
  text = cleanText;
  if (!text) return '{}';

  // 1. Remove markdown code fences if present
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '');
    const endFence = text.lastIndexOf('```');
    if (endFence !== -1) {
      text = text.substring(0, endFence).trim();
    }
  }

  // 2. Remove non-printable control chars except \n, \r, \t
  text = text.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');

  // 3. Remove trailing commas before closing braces/brackets
  text = text.replace(/,\s*([\]}])/g, '$1');

  // 4. Count unclosed quotes, braces, brackets
  let inString = false;
  let isEscaped = false;
  const stack: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '\\' && inString) {
      isEscaped = !isEscaped;
      continue;
    }

    if (char === '"' && !isEscaped) {
      inString = !inString;
      continue;
    }

    isEscaped = false;

    if (!inString) {
      if (char === '{') stack.push('}');
      else if (char === '[') stack.push(']');
      else if (char === '}' || char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
        }
      }
    }
  }

  // If stream cut off inside a string, close quote
  if (inString) {
    text += '"';
  }

  // Clean trailing keys or colons that might have been left at the end (e.g. `"type":` or `"bold":`)
  text = text.replace(/:\s*$/, ': null');
  text = text.replace(/,\s*$/, '');
  // Clean dangling key without colon at the end e.g. `, "some_key"`
  text = text.replace(/,\s*"[^"]*"\s*$/, '');

  // Close remaining unclosed brackets/braces in reverse
  while (stack.length > 0) {
    const closingChar = stack.pop();
    text += closingChar;
  }

  // If the result looks like multiple comma-separated objects without outer array `[...]`
  // e.g. `{ "title": "A" }, { "title": "B" }`
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.includes('},{') && !trimmed.startsWith('[')) {
    text = `[${trimmed}]`;
  }

  return text;
}

/**
 * Extracts the first balanced JSON block (object {...} or array [...]) from raw text,
 * correctly ignoring nested brackets inside string literals and escaped quotes.
 */
export function extractBalancedJson(text: string): string | null {
  if (!text || typeof text !== 'string') return null;

  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  let startIdx = -1;

  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  if (startIdx === -1) return null;

  let inString = false;
  let isEscaped = false;
  const stack: string[] = [];

  for (let i = startIdx; i < text.length; i++) {
    const char = text[i];

    if (char === '\\' && inString) {
      isEscaped = !isEscaped;
      continue;
    }

    if (char === '"' && !isEscaped) {
      inString = !inString;
      continue;
    }

    isEscaped = false;

    if (!inString) {
      if (char === '{') stack.push('}');
      else if (char === '[') stack.push(']');
      else if (char === '}' || char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
          if (stack.length === 0) {
            return text.substring(startIdx, i + 1);
          }
        }
      }
    }
  }

  // If unclosed, return substring from startIdx so repairJsonString can seal it
  return text.substring(startIdx);
}

/**
 * Universal robust JSON parser that handles codeblocks, bracket extraction,
 * trailing commas, escaped characters, and structural un-nesting.
 */
export function parseAiJson<T>(rawText: string, fallback: T): T {
  if (!rawText || typeof rawText !== 'string') return fallback;

  const { cleanText } = stripThinkingTags(rawText);
  let cleaned = cleanText.trim();

  // Strip markdown code fence if wrapping the entire string
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    const endFence = cleaned.lastIndexOf('```');
    if (endFence !== -1) {
      cleaned = cleaned.substring(0, endFence).trim();
    }
  }

  // 1. Direct parse attempt
  try {
    const parsed = JSON.parse(cleaned);
    return unwrapExpected(parsed, fallback);
  } catch {}

  // 2. Extract from markdown code fence ```json ... ``` inside string
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    const blockContent = codeBlockMatch[1].trim();
    try {
      const parsed = JSON.parse(blockContent);
      return unwrapExpected(parsed, fallback);
    } catch {
      try {
        const repaired = repairJsonString(blockContent);
        const parsed = JSON.parse(repaired);
        return unwrapExpected(parsed, fallback);
      } catch {}
    }
  }

  // 3. Balanced JSON block extraction
  const balancedBlock = extractBalancedJson(cleaned);
  if (balancedBlock) {
    try {
      const parsed = JSON.parse(balancedBlock);
      return unwrapExpected(parsed, fallback);
    } catch {
      try {
        const repaired = repairJsonString(balancedBlock);
        const parsed = JSON.parse(repaired);
        return unwrapExpected(parsed, fallback);
      } catch {}
    }
  }

  // 4. If fallback is an array (e.g. Slide[]), prioritize finding array `[`
  if (Array.isArray(fallback)) {
    const firstBracket = cleaned.indexOf('[');
    if (firstBracket !== -1) {
      const arraySubstring = cleaned.substring(firstBracket);
      try {
        const repaired = repairJsonString(arraySubstring);
        const parsed = JSON.parse(repaired);
        return unwrapExpected(parsed, fallback);
      } catch {}
    }
  }

  // 5. Try repairing the entire raw text as last resort
  try {
    const repaired = repairJsonString(cleaned);
    const parsed = JSON.parse(repaired);
    return unwrapExpected(parsed, fallback);
  } catch {}

  return fallback;
}

/**
 * Unwraps nested top-level keys if the caller expected an array or specific structure
 * (e.g., { slides: [...] } when caller expected [...], or a single slide object when array is expected)
 */
function unwrapExpected<T>(parsed: any, fallback: T): T {
  if (parsed === null || parsed === undefined) return fallback;

  if (Array.isArray(fallback)) {
    if (Array.isArray(parsed)) {
      return parsed as unknown as T;
    }
    if (typeof parsed === 'object') {
      if (Array.isArray(parsed.slides)) return parsed.slides as unknown as T;
      if (Array.isArray(parsed.modifiedSlides)) return parsed.modifiedSlides as unknown as T;
      if (Array.isArray(parsed.targetSlides)) return parsed.targetSlides as unknown as T;
      if (Array.isArray(parsed.diagnoses)) return parsed.diagnoses as unknown as T;
      if (Array.isArray(parsed.outline)) return parsed.outline as unknown as T;
      if (Array.isArray(parsed.topics)) return parsed.topics as unknown as T;
      if (Array.isArray(parsed.items)) return parsed.items as unknown as T;
      if (Array.isArray(parsed.data)) return parsed.data as unknown as T;
      if (Array.isArray(parsed.result)) return parsed.result as unknown as T;
      if (Array.isArray(parsed.response)) return parsed.response as unknown as T;
      if (Array.isArray(parsed.tree)) return parsed.tree as unknown as T;
      if (Array.isArray(parsed.nodes)) return parsed.nodes as unknown as T;
      if (Array.isArray(parsed.subtopics)) return parsed.subtopics as unknown as T;

      // Single slide or diagnosis object returned when array was expected
      if (
        parsed.title !== undefined ||
        parsed.content !== undefined ||
        parsed.summary !== undefined ||
        parsed.diagnosis !== undefined ||
        parsed.originalIndex !== undefined
      ) {
        return [parsed] as unknown as T;
      }
    }
  } else if (typeof fallback === 'object' && !Array.isArray(fallback)) {
    // If caller expects an object but parsed is wrapped inside { data: ... } or { knowledgeMap: ... }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const wrapperKeys = [
        'knowledgeMap',
        'knowledge_map',
        'studyMap',
        'study_map',
        'data',
        'result',
        'response',
        'output',
        'map',
        'mindmap',
        'reportKnowledge',
        'report_knowledge',
      ];
      for (const key of wrapperKeys) {
        if (parsed[key] && typeof parsed[key] === 'object' && !Array.isArray(parsed[key])) {
          return parsed[key] as T;
        }
      }
    }
  }

  return parsed as T;
}

/**
 * Extracts progressive Diagnosis objects from a streaming JSON string as they complete.
 */
export function extractProgressiveDiagnosis(rawText: string): {
  summary?: string;
  diagnoses: DiagnosisItem[];
  clinicalAnswer?: Partial<ClinicalAnswerData>;
  proactiveQuestions: string[];
  reportKnowledge?: ReportKnowledgeData | null;
  caseSummaryForPresentation?: string;
  thinking?: string;
} {
  const result: {
    summary?: string;
    diagnoses: DiagnosisItem[];
    clinicalAnswer?: Partial<ClinicalAnswerData>;
    proactiveQuestions: string[];
    reportKnowledge?: ReportKnowledgeData | null;
    caseSummaryForPresentation?: string;
    thinking?: string;
  } = {
    diagnoses: [],
    proactiveQuestions: [],
  };

  if (!rawText || rawText.trim().length === 0) return result;

  const { cleanText, thinking } = stripThinkingTags(rawText);
  if (thinking) {
    result.thinking = thinking;
  }

  if (!cleanText || cleanText.trim().length === 0) return result;

  // Try parsing partial or full JSON with repair
  try {
    const parsed = parseAiJson<any>(cleanText, null);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
        result.summary = parsed.summary.trim();
      }
      if (typeof parsed.caseSummaryForPresentation === 'string' && parsed.caseSummaryForPresentation.trim()) {
        result.caseSummaryForPresentation = parsed.caseSummaryForPresentation.trim();
      }

      if (Array.isArray(parsed.diagnoses) && parsed.diagnoses.length > 0) {
        result.diagnoses = parsed.diagnoses
          .filter((d: any) => d && typeof d === 'object' && (d.diagnosis || d.condition || d.name))
          .map((d: any, idx: number) => ({
            diagnosis: d.diagnosis || d.condition || d.name || `Differential #${idx + 1}`,
            confidenceLevel: typeof d.confidenceLevel === 'number' ? d.confidenceLevel : 0.8,
            lifeThreatCategory: d.lifeThreatCategory || 'Emergent',
            reasoning: sanitizeClinicalAnswerText(d.reasoning || d.rationale || ''),
            missingInformation: {
              information: Array.isArray(d.missingInformation?.information) ? d.missingInformation.information : [],
              tests: Array.isArray(d.missingInformation?.tests) ? d.missingInformation.tests : [],
            },
          }));
      }

      if (parsed.clinicalAnswer && typeof parsed.clinicalAnswer === 'object') {
        result.clinicalAnswer = {
          answer: sanitizeClinicalAnswerText(parsed.clinicalAnswer.answer || ''),
          reasoning: sanitizeClinicalAnswerText(parsed.clinicalAnswer.reasoning || ''),
          topic: parsed.clinicalAnswer.topic || '',
          keyTakeaways: Array.isArray(parsed.clinicalAnswer.keyTakeaways) ? parsed.clinicalAnswer.keyTakeaways : [],
        };
      }

      if (Array.isArray(parsed.proactiveQuestions) && parsed.proactiveQuestions.length > 0) {
        result.proactiveQuestions = parsed.proactiveQuestions.filter((q: any) => typeof q === 'string' && q.trim().length > 0);
      }

      if (parsed.reportKnowledge && parsed.reportKnowledge.categories && Array.isArray(parsed.reportKnowledge.categories)) {
        result.reportKnowledge = parsed.reportKnowledge;
      }
    }
  } catch (e) {
    // If structured parse fails, attempt regex extraction for partial streaming
  }

  // Regex fallback for progressive partial extraction if JSON parse returned empty or partial
  if (!result.summary) {
    const sumMatch = cleanText.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)/i);
    if (sumMatch && sumMatch[1]) {
      result.summary = unescapeJsonStr(sumMatch[1]).trim();
    }
  }

  if (!result.caseSummaryForPresentation) {
    const caseSumMatch = cleanText.match(/"caseSummaryForPresentation"\s*:\s*"((?:[^"\\]|\\.)*)/i);
    if (caseSumMatch && caseSumMatch[1]) {
      result.caseSummaryForPresentation = unescapeJsonStr(caseSumMatch[1]).trim();
    }
  }

  if (!result.clinicalAnswer || !result.clinicalAnswer.answer) {
    const ansMatch = cleanText.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)/i);
    if (ansMatch && ansMatch[1]) {
      const liveAnswer = unescapeJsonStr(ansMatch[1]);
      if (liveAnswer.trim()) {
        result.clinicalAnswer = {
          ...result.clinicalAnswer,
          answer: sanitizeClinicalAnswerText(liveAnswer),
          topic: result.clinicalAnswer?.topic || 'Clinical Differential Analysis',
          reasoning: result.clinicalAnswer?.reasoning || 'Live guideline-directed clinical evaluation',
          keyTakeaways: result.clinicalAnswer?.keyTakeaways || [],
        };
      }
    }
  }

  if (result.diagnoses.length === 0) {
    // 1. Scan for JSON diagnosis objects inside the string
    const diagRegex = /"diagnosis"\s*:\s*"((?:[^"\\]|\\.)*)"[\s\S]*?(?:"reasoning"\s*:\s*"((?:[^"\\]|\\.)*)"|(?:"reasoning"\s*:\s*"((?:[^"\\]|\\.)*)))?/gi;
    let match: RegExpExecArray | null;
    while ((match = diagRegex.exec(cleanText)) !== null) {
      if (match[1] && match[1].trim().length > 1) {
        const diagName = unescapeJsonStr(match[1]).trim();
        const reason = unescapeJsonStr(match[2] || match[3] || '').trim();
        result.diagnoses.push({
          diagnosis: diagName,
          confidenceLevel: 0.85,
          lifeThreatCategory: 'Emergent',
          reasoning: sanitizeClinicalAnswerText(reason),
          missingInformation: { information: [], tests: [] },
        });
      }
    }
  }

  // 2. Markdown & Plain-Text List Extraction Fallback
  if (result.diagnoses.length === 0) {
    // Match numbered list: "1. **Acute Coronary Syndrome**: Reasoning..." or "1. Acute Coronary Syndrome - Reasoning..."
    const numberedRegex = /(?:^|\n)\s*(?:(?:\d+[\.\)]|\-|\*)\s+)(?:\*\*)?([A-Z0-9\s\-\/\(\)]+?)(?:\*\*)?\s*(?::|-|–|—|\n)\s*([\s\S]*?)(?=(?:\n\s*(?:\d+[\.\)]|\-|\*)\s+(?:\*\*)?[A-Z0-9]|\n\n\n|$))/gi;
    let m: RegExpExecArray | null;
    while ((m = numberedRegex.exec(cleanText)) !== null) {
      const candidateTitle = m[1]?.trim().replace(/^\*\*|\*\*$/g, '');
      const candidateReason = m[2]?.trim().replace(/^[-–—:]\s*/, '');
      if (candidateTitle && candidateTitle.length > 2 && candidateTitle.length < 80 && !candidateTitle.toLowerCase().includes('http')) {
        let category: 'Emergent' | 'Urgent' | 'Routine' = 'Emergent';
        const lower = (candidateTitle + ' ' + candidateReason).toLowerCase();
        if (lower.includes('urgent') && !lower.includes('emergent')) category = 'Urgent';
        else if (lower.includes('routine') || lower.includes('non-urgent')) category = 'Routine';

        let conf = 0.8;
        const confMatch = candidateReason.match(/(\d{1,3})%/);
        if (confMatch && confMatch[1]) {
          const num = parseInt(confMatch[1], 10);
          if (num > 0 && num <= 100) conf = num / 100;
        }

        result.diagnoses.push({
          diagnosis: candidateTitle,
          confidenceLevel: conf,
          lifeThreatCategory: category,
          reasoning: sanitizeClinicalAnswerText(candidateReason || candidateTitle),
          missingInformation: { information: [], tests: [] },
        });
      }
    }
  }

  // 3. If clinicalAnswer answer is still not set, set it from cleanText
  if (!result.clinicalAnswer || !result.clinicalAnswer.answer) {
    const cleanedAnswer = sanitizeClinicalAnswerText(cleanText);
    if (cleanedAnswer && cleanedAnswer.length > 20) {
      result.clinicalAnswer = {
        answer: cleanedAnswer,
        reasoning: 'Clinical reasoning synthesized from evidence-based differential analysis.',
        topic: 'Clinical Differential Diagnosis & Management',
        keyTakeaways: result.clinicalAnswer?.keyTakeaways || [],
      };
    }
  }

  return result;
}

/**
 * Parses markdown table syntax (| col1 | col2 |\n| --- | --- |\n| val1 | val2 |) into TableContent
 */
function parseMarkdownTable(tableBlock: string): TableContent | null {
  const lines = tableBlock.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const parseRow = (line: string) => {
    return line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  };

  const headers = parseRow(lines[0]);
  let rowStartIndex = 1;
  // Check if second line is a delimiter like |---|---|
  if (lines.length > 1 && /^\|?[\s-:]+\|[\s-:|]+$/.test(lines[1])) {
    rowStartIndex = 2;
  }

  const rows: TableRowContent[] = [];
  for (let i = rowStartIndex; i < lines.length; i++) {
    const cells = parseRow(lines[i]);
    if (cells.length > 0) {
      while (cells.length < headers.length) cells.push('');
      rows.push({ cells: cells.slice(0, headers.length) });
    }
  }

  if (headers.length > 0 && rows.length > 0) {
    return {
      type: 'table',
      headers,
      rows,
    };
  }
  return null;
}

/**
 * Extracts bold terms enclosed in **term**
 */
function extractBoldStrings(text: string): string[] {
  const bold: string[] = [];
  const regex = /\*\*(.*?)\*\*/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[1] && match[1].trim()) {
      bold.push(match[1].trim());
    }
  }
  return bold;
}

/**
 * Parses structured Markdown slide text into Slide objects.
 * Supports # Slide: Title, **Summary:**, bullet lists, numbered lists, markdown tables, notes (>), pearls, and questions.
 */
export function parseMarkdownToSlides(markdown: string): Slide[] {
  if (!markdown || !markdown.trim()) return [];

  const { cleanText } = stripThinkingTags(markdown);
  const text = cleanText.trim();

  // Split into slides by '---' divider, or '# Slide', or '## Slide'
  let slideChunks: string[] = [];
  if (text.includes('---')) {
    slideChunks = text.split(/\n\s*---\s*\n/).filter((c) => c.trim().length > 0);
  } else if (/^#+\s*Slide/im.test(text)) {
    slideChunks = text.split(/(?=^#+\s*Slide)/im).filter((c) => c.trim().length > 0);
  } else if (/^#\s+/m.test(text)) {
    slideChunks = text.split(/(?=^#\s+)/m).filter((c) => c.trim().length > 0);
  } else {
    slideChunks = [text];
  }

  const slides: Slide[] = [];

  for (const chunk of slideChunks) {
    const lines = chunk.trim().split('\n');
    if (lines.length === 0) continue;

    let title = '';
    let summary = '';
    const pearls: string[] = [];
    const questions: string[] = [];
    const content: ContentItem[] = [];

    let currentSection: 'header' | 'content' | 'pearls' | 'questions' = 'content';
    let currentBulletItems: { text: string; bold: string[] }[] = [];
    let currentNumberedItems: { text: string; bold: string[] }[] = [];
    let currentTableLines: string[] = [];

    const flushListsAndTables = () => {
      if (currentBulletItems.length > 0) {
        content.push({
          type: 'bullet_list',
          items: [...currentBulletItems],
        });
        currentBulletItems = [];
      }
      if (currentNumberedItems.length > 0) {
        content.push({
          type: 'numbered_list',
          items: [...currentNumberedItems],
        });
        currentNumberedItems = [];
      }
      if (currentTableLines.length > 0) {
        const table = parseMarkdownTable(currentTableLines.join('\n'));
        if (table) content.push(table);
        currentTableLines = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        flushListsAndTables();
        continue;
      }

      // Title detection
      if (!title && /^#+\s*(?:Slide\s*\d*[:\-]?\s*)?(.*)$/i.test(line)) {
        const tMatch = line.match(/^#+\s*(?:Slide\s*\d*[:\-]?\s*)?(.*)$/i);
        if (tMatch && tMatch[1]) {
          title = tMatch[1].replace(/^\*\*|\*\*$/g, '').trim();
          continue;
        }
      }

      // Summary detection
      if (/^\*{0,2}Summary\*{0,2}[:\-]/i.test(line)) {
        summary = line.replace(/^\*{0,2}Summary\*{0,2}[:\-]\s*/i, '').replace(/^\*\*|\*\*$/g, '').trim();
        continue;
      }
      if (/^#+\s*Summary/i.test(line)) {
        if (i + 1 < lines.length && lines[i + 1].trim() && !lines[i + 1].startsWith('#')) {
          summary = lines[i + 1].trim();
          i++;
        }
        continue;
      }

      // Section switches
      if (/^#+\s*(?:Clinical\s*)?Pearls|^\*{0,2}Pearls\*{0,2}[:\-]/i.test(line)) {
        flushListsAndTables();
        currentSection = 'pearls';
        continue;
      }
      if (/^#+\s*(?:Proactive\s*|Viva\s*)?Questions|^\*{0,2}Questions\*{0,2}[:\-]/i.test(line)) {
        flushListsAndTables();
        currentSection = 'questions';
        continue;
      }
      if (/^#+\s*(?:Content|Key\s*Concepts|Mechanisms|Analysis)/i.test(line)) {
        flushListsAndTables();
        currentSection = 'content';
        continue;
      }

      // If in pearls section
      if (currentSection === 'pearls') {
        if (/^[-*]\s+/.test(line) || /^\d+[\.\)]\s+/.test(line)) {
          const itemText = line.replace(/^[-*]\s+/, '').replace(/^\d+[\.\)]\s+/, '').trim();
          if (itemText) pearls.push(itemText);
        } else if (line.startsWith('#')) {
          currentSection = 'content';
        } else {
          pearls.push(line);
        }
        continue;
      }

      // If in questions section
      if (currentSection === 'questions') {
        if (/^[-*]\s+/.test(line) || /^\d+[\.\)]\s+/.test(line) || /^Q\d*[:\-]\s*/i.test(line)) {
          const qText = line.replace(/^[-*]\s+/, '').replace(/^\d+[\.\)]\s+/, '').replace(/^Q\d*[:\-]\s*/i, '').trim();
          if (qText) questions.push(qText);
        } else if (line.startsWith('#')) {
          currentSection = 'content';
        } else {
          questions.push(line);
        }
        continue;
      }

      // Content section parsing: table line
      if (line.startsWith('|')) {
        if (currentBulletItems.length > 0 || currentNumberedItems.length > 0) {
          flushListsAndTables();
        }
        currentTableLines.push(line);
        continue;
      } else if (currentTableLines.length > 0) {
        flushListsAndTables();
      }

      // Bullet list
      if (/^[-*]\s+/.test(line)) {
        if (currentNumberedItems.length > 0) flushListsAndTables();
        const itemText = line.replace(/^[-*]\s+/, '').trim();
        currentBulletItems.push({
          text: itemText,
          bold: extractBoldStrings(itemText),
        });
        continue;
      }

      // Numbered list
      if (/^\d+[\.\)]\s+/.test(line)) {
        if (currentBulletItems.length > 0) flushListsAndTables();
        const itemText = line.replace(/^\d+[\.\)]\s+/, '').trim();
        currentNumberedItems.push({
          text: itemText,
          bold: extractBoldStrings(itemText),
        });
        continue;
      }

      // Note / Blockquote
      if (line.startsWith('>')) {
        flushListsAndTables();
        const noteText = line.replace(/^>\s*/, '').trim();
        content.push({
          type: 'note',
          text: noteText,
        });
        continue;
      }

      // Regular paragraph or heading line
      flushListsAndTables();
      const cleanPara = line.replace(/^#+\s*/, '').trim();
      if (cleanPara) {
        content.push({
          type: 'paragraph',
          text: cleanPara,
          bold: extractBoldStrings(cleanPara),
        });
      }
    }

    flushListsAndTables();

    if (title || content.length > 0) {
      slides.push({
        title: title || `Slide ${slides.length + 1}`,
        content,
        summary,
        clinicalPearls: pearls,
        proactiveQuestions: questions,
      });
    }
  }

  return slides;
}

/**
 * Extracts progressive Slide objects from streaming text (supporting BOTH structured Markdown AND JSON).
 * Uses a multi-tiered extraction strategy:
 * 1. Structured Markdown parser (primary for low-token, high-speed streaming)
 * 2. Array repair & JSON parse
 * 3. Per-slide bracket balancing scanner for streaming JSON
 */
export function extractProgressiveSlides(rawText: string): Slide[] {
  if (!rawText || rawText.trim().length === 0) return [];

  let text = rawText.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json|markdown|md)?\s*/i, '');
    const endFence = text.lastIndexOf('```');
    if (endFence !== -1) {
      text = text.substring(0, endFence).trim();
    }
  }

  // Tier 1: Try Structured Markdown parser first (if text has markdown headers or list markers without being a strict JSON array)
  if (!text.startsWith('[') && (text.includes('# Slide') || text.includes('# ') || text.includes('---') || text.includes('**Summary:**'))) {
    const mdSlides = parseMarkdownToSlides(text);
    if (mdSlides.length > 0 && mdSlides.some((s) => s.content && s.content.length > 0)) {
      return mdSlides;
    }
  }

  const slides: Slide[] = [];
  const seenTitles = new Set<string>();

  // Tier 2: Try parsing full/repaired JSON array
  try {
    const parsed = parseAiJson<Slide[]>(text, []);
    if (Array.isArray(parsed) && parsed.length > 0) {
      for (const s of parsed) {
        if (s && typeof s === 'object' && s.title && typeof s.title === 'string' && s.title.trim()) {
          const title = s.title.trim();
          if (!seenTitles.has(title)) {
            seenTitles.add(title);
            slides.push({
              title,
              content: Array.isArray(s.content) ? sanitizeContentItems(s.content) : [],
              summary: typeof s.summary === 'string' ? s.summary : '',
              clinicalPearls: Array.isArray(s.clinicalPearls) ? s.clinicalPearls : [],
              proactiveQuestions: Array.isArray(s.proactiveQuestions) ? s.proactiveQuestions : [],
            });
          }
        }
      }
      if (slides.length > 0) return slides;
    }
  } catch {}

  // Tier 3: Per-Slide Bracket Balancing Scanner (for in-flight streaming JSON)
  try {
    let searchIdx = 0;
    while (searchIdx < text.length) {
      const titleKeyIdx = text.indexOf('"title"', searchIdx);
      if (titleKeyIdx === -1) break;

      let objStart = -1;
      for (let i = titleKeyIdx; i >= 0; i--) {
        if (text[i] === '{') {
          objStart = i;
          break;
        }
      }

      if (objStart === -1) {
        searchIdx = titleKeyIdx + 7;
        continue;
      }

      let depth = 0;
      let inStr = false;
      let isEsc = false;
      let objEnd = -1;

      for (let i = objStart; i < text.length; i++) {
        const c = text[i];
        if (c === '\\' && inStr) {
          isEsc = !isEsc;
          continue;
        }
        if (c === '"' && !isEsc) {
          inStr = !inStr;
          continue;
        }
        isEsc = false;
        if (!inStr) {
          if (c === '{') depth++;
          else if (c === '}') {
            depth--;
            if (depth === 0) {
              objEnd = i + 1;
              break;
            }
          }
        }
      }

      const rawSlideObj = objEnd !== -1 ? text.substring(objStart, objEnd) : text.substring(objStart);
      const repaired = repairJsonString(rawSlideObj);

      try {
        const parsedSlide = JSON.parse(repaired);
        if (parsedSlide && typeof parsedSlide === 'object' && parsedSlide.title && typeof parsedSlide.title === 'string' && parsedSlide.title.trim()) {
          const title = parsedSlide.title.trim();
          if (!seenTitles.has(title)) {
            seenTitles.add(title);
            slides.push({
              title,
              content: Array.isArray(parsedSlide.content) ? sanitizeContentItems(parsedSlide.content) : [],
              summary: typeof parsedSlide.summary === 'string' ? parsedSlide.summary : '',
              clinicalPearls: Array.isArray(parsedSlide.clinicalPearls) ? parsedSlide.clinicalPearls : [],
              proactiveQuestions: Array.isArray(parsedSlide.proactiveQuestions) ? parsedSlide.proactiveQuestions : [],
            });
          }
        }
      } catch {}

      searchIdx = objEnd !== -1 ? objEnd : text.length;
    }
  } catch {}

  // Tier 4: Fallback to markdown parser if JSON yielded nothing
  if (slides.length === 0) {
    const mdFallback = parseMarkdownToSlides(text);
    if (mdFallback.length > 0) return mdFallback;
  }

  return slides;
}

/**
 * Sanitizes slide content items to ensure valid schema
 */
export function sanitizeContentItems(items: any[]): ContentItem[] {
  if (!Array.isArray(items)) {
    if (typeof items === 'string' && items.trim()) {
      return [{ type: 'paragraph', text: items.trim() }];
    }
    return [];
  }

  const result: ContentItem[] = [];

  for (const item of items) {
    if (!item) continue;

    // Handle raw string items in content array
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        result.push({
          type: 'bullet_list',
          items: [{ text: trimmed.replace(/^[-*]\s+/, '') }],
        });
      } else {
        result.push({
          type: 'paragraph',
          text: trimmed,
        });
      }
      continue;
    }

    if (typeof item !== 'object') continue;

    if (item.type === 'paragraph' && (item.text || item.content)) {
      result.push({
        type: 'paragraph',
        text: item.text || item.content || '',
        bold: Array.isArray(item.bold) ? item.bold : [],
      });
    } else if (item.type === 'bullet_list' && Array.isArray(item.items)) {
      result.push({
        type: 'bullet_list',
        items: item.items
          .filter((i: any) => i && (typeof i === 'string' || (typeof i === 'object' && (i.text || i.content))))
          .map((i: any) => ({
            text: typeof i === 'string' ? i : i.text || i.content || '',
            bold: Array.isArray(i.bold) ? i.bold : [],
          })),
      });
    } else if (item.type === 'numbered_list' && Array.isArray(item.items)) {
      result.push({
        type: 'numbered_list',
        items: item.items
          .filter((i: any) => i && (typeof i === 'string' || (typeof i === 'object' && (i.text || i.content))))
          .map((i: any) => ({
            text: typeof i === 'string' ? i : i.text || i.content || '',
            bold: Array.isArray(i.bold) ? i.bold : [],
          })),
      });
    } else if (item.type === 'table' && Array.isArray(item.headers)) {
      result.push({
        type: 'table',
        headers: item.headers.map((h: any) => String(h || '')),
        rows: Array.isArray(item.rows)
          ? item.rows.map((r: any) => ({
              cells: Array.isArray(r.cells)
                ? r.cells.map((c: any) => String(c || ''))
                : Array.isArray(r)
                ? r.map((c: any) => String(c || ''))
                : [],
            }))
          : [],
      });
    } else if (item.type === 'note' && (item.text || item.content)) {
      result.push({
        type: 'note',
        text: item.text || item.content || '',
      });
    } else if (item.text) {
      // Fallback for objects with text but missing or unknown type
      result.push({
        type: 'paragraph',
        text: item.text,
        bold: Array.isArray(item.bold) ? item.bold : [],
      });
    }
  }

  return result;
}

/**
 * Progressive Clinical Answer Parser for Clinical Questions
 */
export function extractProgressiveClinicalAnswer(rawText: string): {
  answer: string;
  reasoning?: string;
  topic?: string;
  keyTakeaways: string[];
  proactiveQuestions: string[];
} {
  const result = {
    answer: '',
    reasoning: '',
    topic: '',
    keyTakeaways: [] as string[],
    proactiveQuestions: [] as string[],
  };

  if (!rawText || rawText.trim().length === 0) return result;

  try {
    const parsed = parseAiJson<any>(rawText, null);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.answer === 'string') result.answer = parsed.answer;
      if (typeof parsed.reasoning === 'string') result.reasoning = parsed.reasoning;
      if (typeof parsed.topic === 'string') result.topic = parsed.topic;
      if (Array.isArray(parsed.keyTakeaways)) result.keyTakeaways = parsed.keyTakeaways;
      if (Array.isArray(parsed.proactiveQuestions)) result.proactiveQuestions = parsed.proactiveQuestions;

      if (result.answer) return result;
    }
  } catch {}

  // Fallback: If it's pure markdown streaming text without JSON structure
  const trimmed = rawText.trim();
  const isJsonLike =
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    trimmed.startsWith('```json') ||
    trimmed.startsWith('```\n[') ||
    trimmed.startsWith('```\n{') ||
    trimmed.includes('"title":') ||
    trimmed.includes('"content":') ||
    trimmed.includes('"answer":');

  if (!isJsonLike) {
    result.answer = rawText;
  }

  return result;
}
