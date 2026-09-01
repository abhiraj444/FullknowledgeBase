# MediGen Clinical & Academic Intelligence Suite — Complete Workflow & Architecture Guide

Welcome to the **MediGen** comprehensive workflow documentation. This guide details every core feature, user navigation pathway, AI orchestration context, prompt design, and data-flow pipeline across the three flagship modules:

1. **AI Clinical Diagnosis & Differential Engine (`/ai-diagnosis`)**
2. **Slide Studio & Clinical Content Generator (`/content-generator`)**
3. **Knowledge Map & First-Principles Studio (`/knowledge-map`)**
4. **Shared Platform Capabilities (Case Archives, Audio Transcriptions, PDF/DOCX Exports, Settings)**

---

## 1. AI Clinical Diagnosis Engine (`/ai-diagnosis`)

### Overview & Purpose
The AI Diagnosis module is an end-to-end medical reasoning engine designed for physicians, medical residents, researchers, and students. It accepts multi-modal patient inputs (clinical vignettes, laboratory panels, imaging reports, ECGs, DICOMs, PDFs, and real-time voice dictation) and generates a structured, multi-tiered differential diagnosis with rigorous clinical reasoning, telemetry inspection, interactive follow-up consultation, and parameter analysis.

---

### Features & How to Navigate

#### 1. Input Ingestion & Multimodal Capture
* **Navigation**: Go to **AI Diagnosis** in the top navigation header (`/ai-diagnosis`).
* **Text Input**: Type or paste clinical notes, history of present illness (HPI), vitals, and physical exam findings into the main clinical scratchpad.
* **Preloaded Clinical Sample Vignettes**: Click on the quick sample buttons below the input (e.g., *Chest Pain & Dyspnea*, *Acute Abdomen*, *Neurological Deficit*, *Pediatric Rash*) to instantly populate realistic clinical scenarios.
* **File & Image Upload**: Drag-and-drop or click the paperclip icon to upload lab reports, discharge summaries, ECG strips, CT/X-Ray image files, or PDF documents. Automatic page-by-page OCR and high-resolution image compression are performed client-side.
* **Voice Dictation**: Click the microphone icon to record patient history or bedside dictation. The audio is transcribed via lightning-fast Whisper models with medical terminology preservation.

#### 2. Model & Generation Configuration
* **Audience Mode**: Choose between **Attending / Specialist**, **Medical Resident / Student**, or **Patient Friendly** to calibrate the terminology and depth.
* **Reasoning Intensity**: Adjust the reasoning level (Standard vs. Deep Deliberation) to trigger extended chain-of-thought clinical hypothesis verification.
* **Target Output Language**: Switch output language among English, Spanish, French, German, Hindi, Japanese, and others.

#### 3. Structured Clinical Output & Analysis
Upon clicking **Generate Differential Diagnosis**, the engine streams and renders:
* **Interactive 3-Box Streaming Telemetry Console**:
  1. *Request Payload & System Context*: Full prompt with medical guidelines and injected patient data.
  2. *Live Chain of Thought / Deliberation*: Real-time differential hypothesis evaluation, rule-outs, and Bayesian probability weighing.
  3. *Raw Output Stream*: Token-by-token markdown stream.
* **Primary Working Diagnosis Card**:
  * ICD-10 Code & Diagnostic Confidence percentage badge.
  * *Pathophysiological Mechanism*: Step-by-step biological breakdown.
  * *Supporting vs. Refuting Evidence*: Paired lists highlighting patient-specific findings.
  * *Next Best Step & Confirmatory Workup*: Urgent lab, imaging, and bedside interventions.
* **Differential Diagnoses (Ranked 2 through 5)**:
  * Key differentiating factors and discriminating tests.
* **Report Parameter Analysis & Pearls**:
  * Extracted abnormal laboratory markers mapped against normal physiological reference ranges.
  * Key Diagnostic Pearls sticky notes.
* **Interactive Follow-up Consultation & "What If?" Scenarios**:
  * Chat panel under the diagnosis with pre-calculated high-yield clinical questions.
  * Allows querying: *"What if the D-dimer comes back normal?"*, *"Adjust treatment for renal impairment (eGFR 25)"*, or *"Differentiate from atypical presentation"*.

---

### AI Calling Mechanism & Context Structure

* **Service Entry Point**: `ClientSideAiService.analyzeClinicalCase(input)`
* **Injected Context & Prompt Hierarchy**:
  1. **System Prompt**: Enforces rigorous clinical accuracy, Bayesian disease probabilities, First-Principles pathophysiology, avoidance of generic clichés, and structured JSON output schema matching the `DiagnosisResult` interface.
  2. **Multimodal Attachments**: Uploaded images (X-rays, lab scans) and unpacked PDF pages are compressed and sent as base64 inline image parts alongside text.
  3. **Streaming Parser**: `extractProgressiveClinicalAnswer` and JSON bracket scanners parse streaming tokens into rich reactive cards in real time.

---

## 2. Slide Studio & Clinical Content Generator (`/content-generator`)

### Overview & Purpose
Slide Studio transforms complex medical literature, clinical guidelines, research papers, lecture recordings, or custom topics into publication-grade, interactive educational slide decks and clinical study briefs.

---

### Features & How to Navigate

#### 1. Ingestion & Topic Builder
* **Navigation**: Click **Slide Studio** in the top navigation bar (`/content-generator`).
* **Prompt & Outline Ingestion**: Enter any medical topic (e.g., *"Acute Coronary Syndromes Management 2026"*), paste research text, or drag & drop PDFs/DOCX lecture handouts.
* **Customization Settings**:
  * *Slide Count*: Configure target number of slides (from 3 to 20+ slides).
  * *Deck Archetype*: Select Clinical Grand Rounds, Resident Morning Report, First-Principles Deep Dive, or Board Exam High-Yield.
  * *Color & Aesthetic Theme*: Choose between Warm Journal, Emerald Clinical, Modern Slate, Cobalt Academic, or Dark Mode.

#### 2. Real-Time Generation & Interactive Slide Editor
* **Live Progressive Rendering**: Slides render cards, bullet trees, note callouts, and comparison tables token-by-token during generation.
* **Interactive Slide Canvas**:
  * Reorder slides using drag handles or toolbar controls.
  * Add, delete, duplicate, or regenerate individual slides.
  * Edit markdown text, bullet points, headers, callouts, and clinical pearl notes in real time.
* **Speech & Narration**: Play audio narration of slide notes generated through high-fidelity speech synthesis.

#### 3. Multi-Format Exporting Suite
* **Export PDF**: Generates clean, vector-rendered PDFs with custom typography, clean math symbols, formatted comparison tables, and page-budgeting calculations.
* **Export PPTX**: Generates native Microsoft PowerPoint presentation decks with editable text boxes, themes, and formatted shapes.
* **Export DOCX**: Generates formatted Word document study summaries with text runs, headers, and bullet structures.

---

### AI Calling Mechanism & Context Structure

* **Service Entry Point**: `ClientSideAiService.generateClinicalSlides(input)`
* **Injected Context & Prompt Hierarchy**:
  1. **System Architecture**: Instructs the model to output a valid JSON slide collection matching the `SlideData` schema (titles, paragraphs, bullet groups, tables, clinical notes, and high-yield pearls).
  2. **Streaming Parser**: `extractProgressiveSlides` incrementally reconstructs in-flight JSON arrays into interactive slide cards without waiting for completion.

---

## 3. Knowledge Map & First-Principles Studio (`/knowledge-map`)

### Overview & Purpose
The Knowledge Map deconstructs vast medical subjects or ingested syllabi into an interactive, multi-tiered First-Principles tree. It breaks complex medical topics into core pillars, subtopics, and foundational mechanisms.

---

### Features & How to Navigate

#### 1. Map Synthesis & Ingestion
* **Navigation**: Select **Knowledge Map** in the top navigation bar (`/knowledge-map`).
* **Generating a Map**: Enter a topic or paste reference material in the input modal. The AI generates a structured hierarchical tree (Root Concept → Major Pillars → Sub-Principles → Granular Mechanisms).
* **High-Yield Document Synthesis**: View a concise thematic overview summarizing the core pillars of the entire subject at the top of the canvas.

#### 2. Navigating & Exploring the Tree
* **Interactive Hierarchy Tree**: Expand and collapse tree branches, inspect node depth badges, and observe explore-status tags (e.g., *⚡ 50-100w*, *📖 Explored*, *🔬 1st Principles*, *📝 Notes*).
* **Two-Stage Explanation Workflow**:
  * **Stage 1 — Concise 50–100 Word High-Yield Overview**: Clicking the **Explain** button on any topic or subtopic generates a focused 50–100 word summary highlighting:
    1. *Core Concept & Definition*
    2. *Essential Mechanism / Action*
    3. *High-Yield Clinical Takeaway*
  * **Stage 2 — On-Demand Full Academic Workup**: Inside the study stage, click **Generate Full Explanation** to expand the node into an exhaustive workup with multi-section breakdowns, molecular mechanisms, step-by-step pathways, comparison tables, and exam golden pearls.
* **Alternative Study Lenses**:
  * *1st Principles Tab*: Derives the topic from absolute fundamental physical, biochemical, and physiological truths.
  * *Analogy / Simplify Tab*: Generates an intuitive plain-language real-world analogy.
  * *Personal Notes Tab*: Add, edit, and persist local study notes for that specific node.
* **Granular AI Dissection ("Dissect Further")**:
  * Click **Dissect Further** on any leaf node to recursively break it down into 3–5 more granular sub-principles.

#### 3. Single Unified Streaming Console
* The raw request prompt, live clinical reasoning deliberation (Chain of Thought), and streaming output are displayed in a clean, non-duplicated telemetry inspector.

#### 4. Knowledge Sheet & Study Guide Export
* **Export PDF / Study Sheet**: Open the modal to customize and download a study guide containing the synthesized tree, high-yield summaries, 50–100w or full explanations, first-principles derivations, and user notes.

---

### AI Calling Mechanism & Context Structure

* **Node Explanation Entry Point**: `ClientSideAiService.explainKnowledgeNode(input)`
* **Surgical Token-Efficient Context**:
  * Injects *only* the top-level Document Synthesis + Ancestral Lineage Path (Root → Parent → Current Node) + Sibling Node Titles.
  * This guarantees high-speed responses and avoids token bloat.
* **Tree Dissection Entry Point**: `ClientSideAiService.dissectKnowledgeNode(input)`
  * Generates granular child nodes formatted as JSON and inserts them into the existing tree hierarchy.

---

## 4. Shared Platform Modules & Infrastructure

### 1. Case Archives (`/case-archives`)
* Stores all saved clinical diagnoses, generated slide decks, and knowledge maps locally and securely.
* Allows searching, filtering, and re-opening previous cases with full state restoration.

### 2. Audio & Speech Services
* **Whisper Audio Transcription**: Integrated in the Diagnosis and Slide scratchpads for real-time dictation.
* **Text-to-Speech (TTS)**: High-clarity audio reading of explanations, clinical pearls, and slide notes.

### 3. Theme & Aesthetics
* Seamless switching between **Warm Light Mode** (designed like a physical clinical notebook with high-contrast legibility) and **Dark Mode** (eye-safe contrast for night shifts).

---

## Quick Reference Navigation Map

| Destination | URL Path | Key User Actions |
| :--- | :--- | :--- |
| **AI Diagnosis** | `/ai-diagnosis` | Paste notes, upload ECG/lab images, record audio, run differential diagnosis, ask follow-up questions. |
| **Slide Studio** | `/content-generator` | Ingest syllabus/topic, customize slide count & theme, edit cards, export PDF/PPTX/DOCX. |
| **Knowledge Map** | `/knowledge-map` | Deconstruct topics into trees, generate 50–100w summaries, expand full workups, dissect sub-nodes, export study guides. |
| **Case Archives** | `/case-archives` | Search, review, and resume previously saved diagnostic cases, decks, and trees. |
| **Settings** | `/settings` | Configure API keys, model preferences, temperature, and audio voice presets. |
