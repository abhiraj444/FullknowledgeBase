import { GoogleGenerativeAI } from '@google/generative-ai';
import type { DiagnosisItem, ClinicalAnswerData, Slide, FollowUpThread, AiConfig, SttConfig, ReportKnowledgeData, KnowledgeTreeNode, KnowledgeMapData } from '@/types';
import type { TargetLanguage, AudienceMode } from '@/context/SettingsContext';
import { detectProviderIdFromEndpoint } from '@/context/SettingsContext';
import {
    parseAiJson,
    repairJsonString,
    extractBalancedJson,
    extractProgressiveDiagnosis,
    extractProgressiveSlides,
    extractProgressiveClinicalAnswer,
    sanitizeContentItems,
    stripThinkingTags,
    sanitizeClinicalAnswerText,
} from '@/lib/streaming-parser';

export {
    parseAiJson,
    repairJsonString,
    extractBalancedJson,
    extractProgressiveDiagnosis,
    extractProgressiveSlides,
    extractProgressiveClinicalAnswer,
    sanitizeContentItems,
    stripThinkingTags,
    sanitizeClinicalAnswerText,
};

export const DEFAULT_GEMINI_MODEL = 'gemini-3.7-flash';
export const DEFAULT_STT_MODEL = 'whisper-large-v3-turbo';

/**
 * Formats model identifiers into clean, human-readable display names across all providers.
 */
export function formatModelDisplayName(modelName?: string): string {
    if (!modelName) return 'Gemini 3.7 Flash';
    const trimmed = modelName.trim();
    const lower = trimmed.toLowerCase();

    if (lower.includes('3.7-flash')) return 'Gemini 3.7 Flash';
    if (lower.includes('2.5-pro')) return 'Gemini 2.5 Pro';
    if (lower.includes('2.5-flash')) return 'Gemini 2.5 Flash';
    if (lower.includes('gpt-4o-mini')) return 'GPT-4o Mini';
    if (lower.includes('gpt-4o')) return 'GPT-4o';
    if (lower.includes('gpt-oss-120b') || lower.includes('gptoss120b')) return 'GPT-OSS 120B (Text Only)';
    if (lower.includes('claude-3-7') || lower.includes('claude-3.7')) return 'Claude 3.7 Sonnet';
    if (lower.includes('claude-3-5') || lower.includes('claude-3.5')) return 'Claude 3.5 Sonnet';
    if (lower.includes('llama-3.3-70b')) return 'Llama 3.3 70B';
    if (lower.includes('llama-3.2-11b') || lower.includes('llama-3.2-90b')) return 'Llama 3.2 Vision';
    if (lower.includes('deepseek-r1') || lower.includes('deepseek-reasoner')) return 'DeepSeek R1';
    if (lower.includes('deepseek-chat') || lower.includes('deepseek-v3')) return 'DeepSeek V3';
    if (lower.includes('qwen-2.5') || lower.includes('qwen2.5')) return 'Qwen 2.5';

    if (trimmed.includes('/')) {
        const afterSlash = trimmed.split('/')[1] || trimmed;
        return afterSlash.toUpperCase();
    }

    return trimmed;
}

/**
 * Normalizes custom and third-party LLM endpoints to correct URL paths.
 * Prevents 404/bad endpoint issues across Groq, OpenRouter, OpenAI, Anthropic, DeepSeek, Cerebras, Ollama, etc.
 */
export function normalizeCustomEndpoint(endpoint: string): string {
    let ep = (endpoint || '').trim().replace(/\/+$/, '');
    if (!ep) return '';

    const lower = ep.toLowerCase();

    // Groq
    if (lower.includes('api.groq.com')) {
        if (!lower.includes('/openai/v1')) {
            ep = 'https://api.groq.com/openai/v1';
        }
    }
    // OpenRouter
    else if (lower.includes('openrouter.ai')) {
        if (!lower.includes('/api/v1')) {
            ep = 'https://openrouter.ai/api/v1';
        }
    }
    // OpenAI
    else if (lower.includes('api.openai.com')) {
        if (!lower.includes('/v1')) {
            ep = 'https://api.openai.com/v1';
        }
    }
    // Cerebras
    else if (lower.includes('api.cerebras.ai')) {
        if (!lower.includes('/v1')) {
            ep = 'https://api.cerebras.ai/v1';
        }
    }
    // DeepSeek
    else if (lower.includes('api.deepseek.com')) {
        if (!lower.includes('/v1')) {
            ep = 'https://api.deepseek.com/v1';
        }
    }
    // Together AI
    else if (lower.includes('api.together.xyz')) {
        if (!lower.includes('/v1')) {
            ep = 'https://api.together.xyz/v1';
        }
    }
    // Ollama localhost
    else if (lower.includes('localhost:11434') || lower.includes('127.0.0.1:11434')) {
        if (!lower.includes('/v1')) {
            ep = ep.replace(/\/+$/, '') + '/v1';
        }
    }

    // Anthropic direct API (uses /v1/messages instead of /chat/completions)
    if (lower.includes('api.anthropic.com')) {
        if (ep.endsWith('/chat/completions')) {
            ep = ep.replace(/\/chat\/completions$/, '');
        }
        if (!ep.endsWith('/messages')) {
            if (!ep.endsWith('/v1')) ep += '/v1';
            ep += '/messages';
        }
        return ep;
    }

    if (!ep.endsWith('/chat/completions')) {
        ep = ep.replace(/\/+$/, '') + '/chat/completions';
    }
    return ep;
}

/**
 * Resolves full AI configuration strictly from the user's provided AiConfig object,
 * explicit API key string, or persistent localStorage preferences.
 * Environment variables are never used so user-provided keys are strictly respected.
 */
export function resolveAiConfig(configOrKey?: string | AiConfig): AiConfig {
    if (!configOrKey || typeof configOrKey === 'string') {
        const storedProvider = (typeof window !== 'undefined' ? localStorage.getItem('app_ai_provider') : null) as 'gemini' | 'custom' | null;
        const storedGeminiKey = (typeof window !== 'undefined' ? (localStorage.getItem('gemini_api_key') || localStorage.getItem('app_provider_key_gemini')) : '') || '';
        const storedGeminiModel = (typeof window !== 'undefined' ? localStorage.getItem('app_gemini_model') : null) || DEFAULT_GEMINI_MODEL;

        const storedCustomEndpoint = (typeof window !== 'undefined' ? localStorage.getItem('app_custom_endpoint') : '') || '';
        const storedCustomModel = (typeof window !== 'undefined' ? localStorage.getItem('app_custom_model') : '') || 'gpt-4o';

        let storedCustomKey = '';
        if (typeof window !== 'undefined') {
            const detectedPid = detectProviderIdFromEndpoint(storedCustomEndpoint, storedCustomModel);
            let vaultKeys: Record<string, string> = {};
            try {
                const rawVault = localStorage.getItem('app_provider_keys');
                if (rawVault) vaultKeys = JSON.parse(rawVault);
            } catch {}

            storedCustomKey =
                vaultKeys[detectedPid] ||
                localStorage.getItem(`app_provider_key_${detectedPid}`) ||
                localStorage.getItem('app_custom_api_key') ||
                '';
        }

        const storedSttProvider = (typeof window !== 'undefined' ? localStorage.getItem('app_stt_provider') : null) as any;
        const storedSttKey = (typeof window !== 'undefined' ? localStorage.getItem('app_stt_api_key') : '') || '';
        const storedSttEndpoint = (typeof window !== 'undefined' ? localStorage.getItem('app_stt_endpoint') : '') || 'https://api.groq.com/openai/v1';
        const storedSttModel = (typeof window !== 'undefined' ? localStorage.getItem('app_stt_model') : '') || DEFAULT_STT_MODEL;

        const storedReasoningRaw = typeof window !== 'undefined' ? localStorage.getItem('app_enable_reasoning') : null;
        const storedEnableReasoning = storedReasoningRaw !== null ? storedReasoningRaw === 'true' : true;

        const sttConfig: SttConfig = {
            provider: storedSttProvider || 'groq',
            apiKey: storedSttKey,
            endpoint: storedSttEndpoint,
            model: storedSttModel,
        };

        const explicitKey = (typeof configOrKey === 'string' && configOrKey.trim().length > 0 && !configOrKey.includes('\n') && !configOrKey.includes(' '))
            ? configOrKey.trim()
            : '';

        if (storedProvider === 'custom' && storedCustomEndpoint) {
            return {
                provider: 'custom',
                customEndpoint: storedCustomEndpoint,
                customApiKey: explicitKey || storedCustomKey,
                customModel: storedCustomModel || 'gpt-4o',
                geminiApiKey: explicitKey || storedGeminiKey,
                geminiModel: storedGeminiModel,
                apiKey: explicitKey || storedCustomKey || storedGeminiKey,
                enableReasoning: storedEnableReasoning,
                thinkingBudget: storedEnableReasoning ? 2048 : 0,
                sttConfig,
            };
        }

        return {
            provider: 'gemini',
            apiKey: explicitKey || storedGeminiKey,
            geminiApiKey: explicitKey || storedGeminiKey,
            geminiModel: storedGeminiModel || DEFAULT_GEMINI_MODEL,
            enableReasoning: storedEnableReasoning,
            thinkingBudget: storedEnableReasoning ? 2048 : 0,
            sttConfig,
        };
    }

    return configOrKey;
}

/**
 * Safely converts an ArrayBuffer to a Base64 string in binary chunks to avoid call stack limits.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    const chunkSize = 0x8000; // 32KB
    for (let i = 0; i < len; i += chunkSize) {
        binary += String.fromCharCode.apply(
            null,
            Array.from(bytes.subarray(i, Math.min(i + chunkSize, len)))
        );
    }
    return btoa(binary);
}

/**
 * Resizes large image data URIs or base64 to maximum dimensions (1600px) and JPEG quality for fast, reliable LLM vision inference.
 */
async function optimizeImageForAiVision(dataUriOrBase64: string, mimeType: string): Promise<{ data: string; mimeType: string }> {
    if (typeof window === 'undefined' || !mimeType.startsWith('image/')) {
        const cleanData = dataUriOrBase64.includes('base64,') ? dataUriOrBase64.split('base64,')[1] : dataUriOrBase64;
        return { data: cleanData, mimeType };
    }

    try {
        const src = dataUriOrBase64.startsWith('data:') ? dataUriOrBase64 : `data:${mimeType};base64,${dataUriOrBase64}`;
        const img = new Image();
        if (src.startsWith('http://') || src.startsWith('https://')) {
            img.crossOrigin = 'anonymous';
        }

        await new Promise<void>((resolve, reject) => {
            if (img.complete && img.naturalWidth > 0) {
                resolve();
                return;
            }
            img.onload = async () => {
                try {
                    if ('decode' in img) await img.decode().catch(() => {});
                } catch {}
                resolve();
            };
            img.onerror = () => reject(new Error('Image decode error'));
            img.src = src;
        });

        const maxDim = 2000;
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // If image is already reasonably sized (<2000px and not HEIC/huge), keep it clean directly!
        if (width > 0 && width <= maxDim && height <= maxDim && mimeType !== 'image/heic') {
            const cleanData = dataUriOrBase64.includes('base64,') ? dataUriOrBase64.split('base64,')[1] : dataUriOrBase64;
            return { data: cleanData, mimeType: sanitizeMimeType(mimeType) };
        }

        if (width > maxDim || height > maxDim) {
            if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
            } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
            }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            const cleanData = dataUriOrBase64.includes('base64,') ? dataUriOrBase64.split('base64,')[1] : dataUriOrBase64;
            return { data: cleanData, mimeType };
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.90);
        const base64Data = optimizedDataUrl.split('base64,')[1];
        return { data: base64Data, mimeType: 'image/jpeg' };
    } catch (e) {
        console.warn('Image optimization fallback:', e);
        const cleanData = dataUriOrBase64.includes('base64,') ? dataUriOrBase64.split('base64,')[1] : dataUriOrBase64;
        return { data: cleanData, mimeType };
    }
}

/**
 * Normalizes and extracts clean MIME type and pure Base64 data from any media input (audio, image, PDF, blob URLs, objects).
 */
export async function normalizeMediaForGemini(mediaInput: any): Promise<{ data: string; mimeType: string } | null> {
    if (!mediaInput) return null;

    // Handle object inputs directly
    if (typeof mediaInput === 'object') {
        if (typeof mediaInput.data === 'string' && typeof mediaInput.mimeType === 'string') {
            const cleanData = mediaInput.data.includes('base64,') ? mediaInput.data.split('base64,')[1] : mediaInput.data;
            return { data: cleanData, mimeType: sanitizeMimeType(mediaInput.mimeType) };
        }
        if (typeof mediaInput.url === 'string') {
            return normalizeMediaForGemini(mediaInput.url);
        }
        if (typeof mediaInput.src === 'string') {
            return normalizeMediaForGemini(mediaInput.src);
        }
        if (Array.isArray(mediaInput.processedImages) && mediaInput.processedImages.length > 0) {
            return normalizeMediaForGemini(mediaInput.processedImages[0]);
        }
        return null;
    }

    if (typeof mediaInput !== 'string') return null;
    let target = mediaInput.trim();

    // If Blob or HTTP(S) URL, resolve asynchronously
    if (target.startsWith('blob:') || target.startsWith('http://') || target.startsWith('https://')) {
        try {
            const response = await fetch(target);
            const blob = await response.blob();
            const buffer = await blob.arrayBuffer();
            const base64 = arrayBufferToBase64(buffer);
            const rawType = blob.type || 'image/jpeg';
            const sanitizedMime = sanitizeMimeType(rawType);

            if (sanitizedMime.startsWith('image/')) {
                return optimizeImageForAiVision(base64, sanitizedMime);
            }
            return { data: base64, mimeType: sanitizedMime };
        } catch (e) {
            console.warn('Failed to resolve media URL:', e);
            return null;
        }
    }

    // If Data URI: data:[<mediatype>][;codecs=...][;base64],<data>
    if (target.startsWith('data:')) {
        const commaIdx = target.indexOf(',');
        if (commaIdx === -1) return null;

        const header = target.substring(5, commaIdx);
        const base64Data = target.substring(commaIdx + 1).trim();
        const rawMime = header.split(';')[0].trim().toLowerCase();
        const sanitizedMime = sanitizeMimeType(rawMime);

        if (sanitizedMime.startsWith('image/')) {
            return optimizeImageForAiVision(target, sanitizedMime);
        }

        return {
            data: base64Data,
            mimeType: sanitizedMime,
        };
    }

    // Raw Base64 string
    const detectedMime = detectMimeFromBase64(target);
    if (detectedMime.startsWith('image/')) {
        return optimizeImageForAiVision(target, detectedMime);
    }
    return {
        data: target,
        mimeType: detectedMime,
    };
}

function sanitizeMimeType(rawMime: string): string {
    const lower = rawMime.toLowerCase().split(';')[0].trim();

    if (lower === 'audio/webm' || lower.includes('webm')) return 'audio/webm';
    if (lower === 'audio/mp3' || lower === 'audio/mpeg' || lower.includes('mpeg')) return 'audio/mp3';
    if (lower === 'audio/wav' || lower === 'audio/x-wav' || lower === 'audio/wave') return 'audio/wav';
    if (lower === 'audio/ogg' || lower.includes('ogg') || lower === 'audio/opus') return 'audio/ogg';
    if (lower === 'audio/aac' || lower === 'audio/x-aac') return 'audio/aac';
    if (lower === 'audio/flac' || lower === 'audio/x-flac') return 'audio/flac';
    if (lower === 'audio/m4a' || lower === 'audio/x-m4a' || lower === 'audio/mp4' || lower === 'audio/mp4a-latm') return 'audio/mp4';

    if (lower === 'application/pdf' || lower.includes('pdf')) return 'application/pdf';

    if (lower === 'image/jpeg' || lower === 'image/jpg' || lower === 'image/pjpeg') return 'image/jpeg';
    if (lower === 'image/png') return 'image/png';
    if (lower === 'image/webp') return 'image/webp';
    if (lower === 'image/gif') return 'image/gif';
    if (lower === 'image/heic') return 'image/heic';
    if (lower === 'image/heif') return 'image/heif';

    if (lower.startsWith('audio/')) return 'audio/webm';
    if (lower.startsWith('image/')) return 'image/jpeg';

    return 'image/jpeg';
}

function detectMimeFromBase64(base64: string): string {
    if (base64.startsWith('JVBERi0')) return 'application/pdf';
    if (base64.startsWith('/9j/')) return 'image/jpeg';
    if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
    if (base64.startsWith('R0lGOD')) return 'image/gif';
    if (base64.startsWith('GkXf')) return 'audio/webm';
    if (base64.startsWith('T2dnUw')) return 'audio/ogg';
    if (base64.startsWith('SUQz') || base64.startsWith('//+')) return 'audio/mp3';
    if (base64.startsWith('UklGR')) return 'audio/wav';
    if (base64.startsWith('AAAA') || base64.includes('ftyp')) return 'audio/mp4';
    if (base64.startsWith('fLaC') || base64.startsWith('ZkxhQw')) return 'audio/flac';

    return 'image/jpeg';
}

export function isAbortError(err: any): boolean {
    if (!err) return false;
    if (err.name === 'AbortError') return true;
    const msg = (err?.message || String(err || '')).toLowerCase();
    return msg.includes('aborted') || msg.includes('user aborted') || msg.includes('the operation was aborted');
}

/**
 * Universal prompt executor supporting both Google Gemini models (default gemini-3.7-flash, custom Gemini names)
 * and Custom OpenAI-compatible endpoints (OpenAI, OpenRouter, Groq, Ollama, DeepSeek, Mistral, etc.).
 */
export async function executeAiPrompt(
    configOrKey: string | AiConfig | undefined,
    prompt: string,
    images?: string[],
    options?: { signal?: AbortSignal }
): Promise<string> {
    if (options?.signal?.aborted) {
        throw new DOMException('The operation was aborted by the user', 'AbortError');
    }

    const config = resolveAiConfig(configOrKey);

    // Normalize images into mimeType & base64 objects
    const rawImagesList: any[] = [];
    if (Array.isArray(images)) {
        rawImagesList.push(...images);
    } else if (images && typeof images === 'object') {
        if (Array.isArray((images as any).processedImages)) {
            rawImagesList.push(...(images as any).processedImages);
        } else {
            rawImagesList.push(images);
        }
    } else if (typeof images === 'string') {
        rawImagesList.push(images);
    }

    const normalizedImages: Array<{ data: string; mimeType: string }> = [];
    for (const img of rawImagesList) {
        if (options?.signal?.aborted) {
            throw new DOMException('The operation was aborted by the user', 'AbortError');
        }
        const normalized = await normalizeMediaForGemini(img);
        if (normalized && normalized.data) {
            normalizedImages.push(normalized);
        }
    }

    // Attempt 1: Call full-stack Next.js API Route /api/ai/generate
    if (typeof window !== 'undefined') {
        try {
            const apiRes = await fetch('/api/ai/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt,
                    images: normalizedImages,
                    config,
                }),
                signal: options?.signal,
            });

            if (apiRes.ok) {
                const data = await apiRes.json();
                if (data.text !== undefined) {
                    return data.text;
                }
            } else {
                const errorData = await apiRes.json().catch(() => null);
                if (errorData?.error) {
                    throw new Error(errorData.error);
                }
            }
        } catch (fetchErr: any) {
            if (isAbortError(fetchErr) || options?.signal?.aborted) {
                throw new DOMException('The operation was aborted by the user', 'AbortError');
            }
            // If the server explicitly returned an error message (like missing API key, rate limit, etc.), rethrow it
            if (fetchErr?.message && !fetchErr.message.toLowerCase().includes('failed to fetch') && !fetchErr.message.toLowerCase().includes('networkerror')) {
                throw fetchErr;
            }
            console.warn('API Route fetch unavailable, falling back to direct client execution...', fetchErr);
        }
    }

    if (options?.signal?.aborted) {
        throw new DOMException('The operation was aborted by the user', 'AbortError');
    }

    // Direct fallback for custom endpoints
    if (config.provider === 'custom') {
        let endpoint = normalizeCustomEndpoint(config.customEndpoint || '');
        if (!endpoint) {
            throw new Error('Custom LLM endpoint is not configured. Please set your endpoint URL in Settings.');
        }

        const isAnthropic = endpoint.includes('api.anthropic.com');
        const key = config.customApiKey || config.apiKey;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (key) {
            if (isAnthropic) {
                headers['x-api-key'] = key;
                headers['anthropic-version'] = '2023-06-01';
                headers['anthropic-dangerous-direct-browser-access'] = 'true';
            } else {
                headers['Authorization'] = `Bearer ${key}`;
            }
        }

        // Detect Groq endpoint for special audio handling and vision models
        const isGroqEndpoint = endpoint.toLowerCase().includes('groq.com');
        const imageCount = normalizedImages.filter(n => n.mimeType.startsWith('image/')).length;

        let augmentedPrompt = prompt;
        if (imageCount > 0) {
            augmentedPrompt = `[CLINICAL ATTACHMENTS: ${imageCount} medical document/image page(s) attached. Inspect and analyze all visible findings, lab parameters, test results, numbers, waveforms, patient info, and clinical text directly from the attached visual image(s).]\n\n${prompt}`;
        }

        const contentParts: any[] = [{ type: 'text', text: '' }];
        for (const norm of normalizedImages) {
            if (norm.mimeType.startsWith('image/')) {
                contentParts.push({
                    type: 'image_url',
                    image_url: {
                        url: `data:${norm.mimeType};base64,${norm.data}`,
                    },
                });
            } else if (norm.mimeType.startsWith('audio/')) {
                if (isGroqEndpoint && key) {
                    // Groq: transcribe audio via dedicated Whisper endpoint
                    try {
                        let transcriptionUrl = endpoint.replace(/\/chat\/completions$/, '') + '/audio/transcriptions';
                        const binaryStr = atob(norm.data);
                        const bytes = new Uint8Array(binaryStr.length);
                        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
                        const extMap: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp3': 'mp3', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg' };
                        const ext = extMap[norm.mimeType] || 'webm';
                        const formData = new FormData();
                        formData.append('file', new Blob([bytes], { type: norm.mimeType }), `audio.${ext}`);
                        formData.append('model', 'whisper-large-v3-turbo');
                        formData.append('response_format', 'json');
                        const tRes = await fetch(transcriptionUrl, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: formData });
                        if (tRes.ok) {
                            const tData = await tRes.json();
                            if (tData.text) augmentedPrompt = `[Audio Transcript from voice memo/dictation]:\n"${tData.text}"\n\n${augmentedPrompt}`;
                        }
                    } catch { /* transcription failed, continue with text only */ }
                } else {
                    // Other providers: try standard input_audio format
                    contentParts.push({
                        type: 'input_audio',
                        input_audio: {
                            data: norm.data,
                            format: norm.mimeType.replace('audio/', ''),
                        },
                    });
                }
            } else if (norm.mimeType === 'application/pdf') {
                augmentedPrompt = `[PDF document was attached. If you can process the document content from the provided data, please analyze it. Otherwise, focus on the text input.]\n\n${augmentedPrompt}`;
            }
        }

        contentParts[0].text = augmentedPrompt;

        // Auto-select a vision-capable model on Groq if images are attached and current model is text-only
        let initialModel = config.customModel || 'gpt-4o';
        if (imageCount > 0 && isGroqEndpoint) {
            const isKnownGroqVision = initialModel.includes('vision') || initialModel.includes('qwen');
            if (!isKnownGroqVision) {
                console.log(`Auto-routing Groq request with images from ${initialModel} to llama-3.2-11b-vision-preview`);
                initialModel = 'llama-3.2-11b-vision-preview';
            }
        }

        const payload: any = isAnthropic
            ? {
                model: initialModel,
                max_tokens: 4096,
                messages: [
                    {
                        role: 'user',
                        content: augmentedPrompt,
                    },
                ],
            }
            : {
                model: initialModel,
                messages: [
                    {
                        role: 'user',
                        content: contentParts.length === 1 ? augmentedPrompt : contentParts,
                    },
                ],
                temperature: 0.2,
            };

        const res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => 'Unknown error');
            const errLower = errText.toLowerCase();

            // If multimodal was rejected on Groq, attempt secondary vision models
            if (contentParts.length > 1 && isGroqEndpoint) {
                const alternateGroqModels = ['llama-3.2-11b-vision-preview', 'qwen/qwen3.6-27b', 'llama-3.2-90b-vision-preview'].filter(
                    (m) => m !== initialModel
                );

                for (const altModel of alternateGroqModels) {
                    console.warn(`Groq vision retry with alternate model ${altModel}...`);
                    const altPayload = { ...payload, model: altModel };
                    const altRes = await fetch(endpoint, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(altPayload),
                    });
                    if (altRes.ok) {
                        const data = await altRes.json();
                        return data.choices?.[0]?.message?.content || '';
                    }
                }
            }

            let parsed = errText;
            try {
                const parsedJson = JSON.parse(errText);
                parsed = parsedJson.error?.message || parsedJson.message || errText;
            } catch {
                // keep string
            }

            let hint = '';
            if (
                errLower.includes('does not support image') ||
                errLower.includes('only text') ||
                errLower.includes('vision') ||
                errLower.includes('must be a string') ||
                errLower.includes('unprocessable') ||
                errLower.includes('gptoss120b') ||
                errLower.includes('gpt-oss-120b') ||
                errLower.includes('image_url') ||
                errLower.includes('no image')
            ) {
                hint =
                    ' Tip: The selected model (such as gpt-oss-120b) is strictly a text-only model on OpenRouter and does not support image inputs. To analyze medical photos or lab reports, please select a multimodal vision model (such as Gemini 3.7 Flash, GPT-4o, Claude 3.7 Sonnet, or Llama 3.2 Vision) in Settings.';
            }
            throw new Error(`Custom AI Endpoint Error (${res.status}): ${parsed.slice(0, 300)}${hint}`);
        }

        const data = await res.json();
        if (isAnthropic && data.content && Array.isArray(data.content)) {
            return data.content.map((c: any) => c.text || '').join('');
        }
        return data.choices?.[0]?.message?.content || '';
    }

    // Direct fallback for Google Gemini
    const apiKey =
        config.geminiApiKey ||
        config.apiKey ||
        (typeof window !== 'undefined' ? (localStorage.getItem('gemini_api_key') || localStorage.getItem('app_provider_key_gemini')) : '') ||
        '';

    if (!apiKey) {
        throw new Error('Google Gemini API Key is missing. Please add your key in Settings.');
    }

    const requestedModel = config.geminiModel || DEFAULT_GEMINI_MODEL;
    const isReasoningDisabled = config.enableReasoning === false || config.thinkingBudget === 0;
    const genAI = new GoogleGenerativeAI(apiKey);
    const validNormals = normalizedImages.filter((n) => n && n.data && n.data.length > 50);
    const imageCount = validNormals.filter((n) => n.mimeType.startsWith('image/')).length;

    let effectivePrompt = prompt;
    if (isReasoningDisabled) {
        effectivePrompt = `[FAST RESPONSE MODE: Do NOT output internal thoughts, reasoning steps, or <think> tags. Provide the final response directly and concisely.]\n\n${effectivePrompt}`;
    }
    if (imageCount > 0) {
        effectivePrompt = `[CLINICAL ATTACHMENTS: ${imageCount} medical document/image page(s) attached. Thoroughly examine and extract all visible findings, lab test parameters, numerical values, reference ranges, patient demographics, and clinical text directly from the attached visual image(s) to formulate the comprehensive response.]\n\n${effectivePrompt}`;
    }

    const parts: any[] = [];
    for (const norm of validNormals) {
        parts.push({
            inlineData: {
                data: norm.data,
                mimeType: norm.mimeType,
            },
        });
    }
    parts.push(effectivePrompt);

    try {
        const model = genAI.getGenerativeModel({ model: requestedModel });
        const result = await model.generateContent(parts);
        const text = result.response.text();
        if (text && text.trim().length > 0) {
            return text;
        }
        throw new Error('Model produced an empty response.');
    } catch (err: any) {
        const rawErr = err?.message || String(err || 'Unknown AI error');
        if (rawErr.toLowerCase().includes('api_key_invalid') || rawErr.toLowerCase().includes('invalid api key')) {
            throw new Error('Invalid Google Gemini API Key. Please verify or update your key in Settings.');
        }
        if (rawErr.toLowerCase().includes('quota') || rawErr.toLowerCase().includes('429')) {
            throw new Error('Gemini API Quota Exceeded (429). Please wait a few seconds or check your usage limit in Google AI Studio.');
        }
        if (rawErr.toLowerCase().includes('permission_denied') || rawErr.toLowerCase().includes('403')) {
            throw new Error('Gemini API Permission Denied (403). The provided API key does not have access to this feature.');
        }
        throw new Error(`AI Generation Error (${requestedModel}): ${rawErr}`);
    }
}

export interface StreamChunkCallbackPayload {
    text: string;
    thinking?: string;
    isDone: boolean;
    modelUsed?: string;
}

/**
 * Universal Streaming Prompt Executor that streams both thinking and generated text
 * in real-time to components like Slide Generator, AI Diagnosis, and Clinical Inquiries.
 */
export async function executeStreamingAiPrompt(
    configOrKey: string | AiConfig | undefined,
    prompt: string,
    images?: string[],
    onChunk?: (payload: StreamChunkCallbackPayload) => void,
    options?: { signal?: AbortSignal }
): Promise<{ text: string; thinking: string }> {
    if (options?.signal?.aborted) {
        throw new DOMException('The operation was aborted by the user', 'AbortError');
    }

    const config = resolveAiConfig(configOrKey);

    // Normalize images
    const rawImagesList: any[] = [];
    if (Array.isArray(images)) {
        rawImagesList.push(...images);
    } else if (images && typeof images === 'object') {
        if (Array.isArray((images as any).processedImages)) {
            rawImagesList.push(...(images as any).processedImages);
        } else {
            rawImagesList.push(images);
        }
    } else if (typeof images === 'string') {
        rawImagesList.push(images);
    }

    const normalizedImages: Array<{ data: string; mimeType: string }> = [];
    for (const img of rawImagesList) {
        if (options?.signal?.aborted) {
            throw new DOMException('The operation was aborted by the user', 'AbortError');
        }
        const normalized = await normalizeMediaForGemini(img);
        if (normalized && normalized.data) {
            normalizedImages.push(normalized);
        }
    }

    let accumulatedText = '';
    let accumulatedThinking = '';

    if (typeof window !== 'undefined') {
        try {
            const response = await fetch('/api/ai/generate/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    images: normalizedImages,
                    config,
                }),
                signal: options?.signal,
            });

            if (!response.ok || !response.body) {
                const errJson = await response.json().catch(() => ({ error: `Stream failed with HTTP ${response.status}` }));
                throw new Error(errJson.error || `Stream request failed (${response.status})`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                if (options?.signal?.aborted) {
                    try { await reader.cancel(); } catch {}
                    throw new DOMException('The operation was aborted by the user', 'AbortError');
                }

                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (options?.signal?.aborted) {
                        try { await reader.cancel(); } catch {}
                        throw new DOMException('The operation was aborted by the user', 'AbortError');
                    }

                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data:')) continue;

                    try {
                        const jsonStr = trimmed.replace(/^data:\s*/, '');
                        const parsed = JSON.parse(jsonStr);

                        if (parsed.error) {
                            throw new Error(parsed.error);
                        }

                        if (parsed.text) {
                            accumulatedText += parsed.text;
                        }
                        if (parsed.thinking) {
                            accumulatedThinking += parsed.thinking;
                        }

                        if (onChunk) {
                            onChunk({
                                text: accumulatedText,
                                thinking: accumulatedThinking,
                                isDone: !!parsed.done,
                                modelUsed: parsed.modelUsed,
                            });
                        }
                    } catch (parseErr: any) {
                        if (parseErr?.message && !parseErr.message.includes('JSON')) {
                            throw parseErr;
                        }
                    }
                }
            }

            if (onChunk) {
                onChunk({
                    text: accumulatedText,
                    thinking: accumulatedThinking,
                    isDone: true,
                });
            }

            if (accumulatedText.trim().length > 0) {
                return { text: accumulatedText, thinking: accumulatedThinking };
            }
        } catch (streamErr: any) {
            if (isAbortError(streamErr) || options?.signal?.aborted) {
                throw new DOMException('The operation was aborted by the user', 'AbortError');
            }
            const errMsg = (streamErr?.message || '').toLowerCase();
            if (
                errMsg.includes('api_key_invalid') ||
                errMsg.includes('invalid api key') ||
                errMsg.includes('quota') ||
                errMsg.includes('resource_exhausted') ||
                errMsg.includes('429') ||
                errMsg.includes('permission_denied') ||
                errMsg.includes('403')
            ) {
                throw streamErr;
            }
            console.warn('Streaming API Route unavailable or encountered an error. Falling back to non-streaming execution...', streamErr);
        }
    }

    if (options?.signal?.aborted) {
        throw new DOMException('The operation was aborted by the user', 'AbortError');
    }

    // Fallback: non-streaming execution
    const fallbackRaw = await executeAiPrompt(config, prompt, images, options);
    const { cleanText: fallbackClean, thinking: fallbackThinking } = stripThinkingTags(fallbackRaw);
    if (onChunk) {
        onChunk({ text: fallbackClean, thinking: fallbackThinking, isDone: true });
    }
    return { text: fallbackClean, thinking: fallbackThinking };
}

/**
 * Returns explicit prompt directives to strictly enforce the user's chosen output language,
 * regardless of the language or script used in the input (text, audio, documents, Hindi, etc.).
 */
export function getLanguageDirective(language: TargetLanguage = 'english'): string {
    if (language === 'hinglish') {
        return `
**MANDATORY LANGUAGE & SCRIPT DIRECTIVE (HINGLISH):**
- **User's Chosen Target Output Language**: **HINGLISH** (Conversational Hindi-English blend written strictly in Latin/Roman English alphabet).
- **ABSOLUTE LANGUAGE ENFORCEMENT**: Even if the input text, clinical vignette, user question, or attached audio dictation/voice memo is spoken or written in pure Hindi (Devanagari script), English, Marathi, Tamil, Bengali, or any other language, your ENTIRE JSON response (all text, titles, clinical reasoning, pathophysiology, proactive questions, summaries, bullet points, and pearls) MUST strictly and unconditionally be composed in **natural, fluent, conversational HINGLISH using the Roman/Latin alphabet**.
- **DO NOT** output Devanagari script (e.g. do NOT use "रोगी को..."). Always write phonetically in Roman script (e.g. "Patient ko acute chest pain hai...").
- Keep standard medical condition names, anatomical terms, drug names, and diagnostic test names in English (e.g., "Aortic Dissection", "Myocardial Infarction", "Echocardiogram", "Beta-blockers", "Troponin-I") while explaining concepts, mechanisms, and instructions in conversational Hinglish.
`;
    }

    return `
**MANDATORY LANGUAGE DIRECTIVE (ENGLISH):**
- **User's Chosen Target Output Language**: **ENGLISH**.
- **ABSOLUTE LANGUAGE ENFORCEMENT**: Even if the input text, clinical vignette, question, or attached audio dictation/voice memo is spoken or written in Hindi (Devanagari or Romanized), Hinglish, Marathi, Tamil, or any other regional language/accent, your ENTIRE JSON response (all titles, diagnoses, reasoning, summaries, proactive questions, bullet points, and pearls) MUST strictly and unconditionally be composed in clear, professional, authoritative **ENGLISH**.
- Do not mix random Hindi words into the response. Maintain pure English.
`;
}

/**
 * Returns explicit prompt directives for the selected Audience Mode:
 * - 'doctor': Standard clinical rigor for MBBS students, PG residents, and clinicians.
 * - 'simplified': First-principles, engaging breakdown for patients and curious learners to spark enthusiasm and independent research.
 */
export function getAudienceDirective(audienceMode: AudienceMode = 'doctor'): string {
    if (audienceMode === 'simplified') {
        return `
**TARGET AUDIENCE & TONE: SIMPLIFIED / FIRST-PRINCIPLES ENTHUSIAST (PATIENT & CURIOUS LEARNER)**
- **Core Educational Mission**: Explain this clinical diagnosis or medical topic from **FIRST PRINCIPLES** (fundamental physics, mechanics, plumbing, electricity, chemistry, and biology) so that any patient, high school or college student, or curious explorer can intuitively understand what is happening inside the human body.
- **Intuitive Real-World Analogies**: Use vivid, memorable metaphors (e.g., the heart as a high-pressure dual-chamber pump, blood vessels as elastic highways, the immune system as specialized security patrols, the kidneys as microscopic coffee filters, neurons as insulated fiber-optic wires).
- **Spark Curiosity & Self-Research**: Formulate explanations to spark genuine curiosity and excitement about human biology! Highlight fascinating "Did you know?" bio-mechanics insights that inspire the user to research the topic further on their own.
- **Accessible yet Scientifically Accurate**: Avoid overwhelming jargon. When introducing a real medical term (e.g., "Systolic Hypertension" or "Atherosclerosis"), immediately explain the root meaning simply in parentheses.
- **Empowering Next Steps**: Provide clear, reassuring, practical takeaways on what warning signs mean, how medications help restore balance in the body, and what smart questions to ask a doctor.
`;
    }

    return `
**TARGET AUDIENCE & TONE: CLINICAL / DOCTOR (MBBS, PG RESIDENTS & CLINICIANS - TECHNICAL)**
- **Core Clinical Mission**: Deliver rigorous, postgraduate-level evidence-based medicine and academic clinical precision.
- **Deep Pathophysiology**: Detail cellular/molecular pathophysiology, hemodynamic alterations, receptor kinetics, and biochemical cascades.
- **Guideline Citations**: Reference established clinical guidelines (ACC/AHA, ESC, KDIGO, GOLD, Surviving Sepsis, IDSA, ADA, NICE).
- **High-Yield Specifics**: Emphasize pre-test and post-test probabilities, likelihood ratios, "can't-miss" emergent life threats, pharmacotherapeutic drug classes, dosage contraindications, and high-yield board/viva pearls.
`;
}

export const ClientSideAiService = {
    /**
     * Legacy helper returning a Gemini model instance. Defaulted to gemini-3.7-flash.
     */
    async getGeminiModel(apiKey: string, customModelName?: string) {
        const genAI = new GoogleGenerativeAI(apiKey);
        return genAI.getGenerativeModel({ model: customModelName || DEFAULT_GEMINI_MODEL });
    },

    /**
     * Diagnostic Ping to verify AI credentials and endpoint responsiveness
     */
    async testConnection(configOrKey?: string | AiConfig, options?: { signal?: AbortSignal }): Promise<{
        success: boolean;
        message: string;
        modelUsed: string;
        latencyMs: number;
    }> {
        const startTime = Date.now();
        const config = resolveAiConfig(configOrKey);
        const modelName =
            config.provider === 'custom'
                ? config.customModel || 'Custom Endpoint'
                : config.geminiModel || DEFAULT_GEMINI_MODEL;

        try {
            const reply = await executeAiPrompt(
                config,
                'Respond with the single word "READY" to verify clinical AI readiness and connectivity.',
                undefined,
                options
            );
            const latencyMs = Date.now() - startTime;
            return {
                success: true,
                message: `Connection successful (${latencyMs}ms): ${reply.trim().slice(0, 80)}`,
                modelUsed: modelName,
                latencyMs,
            };
        } catch (err: any) {
            const latencyMs = Date.now() - startTime;
            return {
                success: false,
                message: err?.message || 'Connection test failed. Please verify API key, endpoint URL, and network access.',
                modelUsed: modelName,
                latencyMs,
            };
        }
    },

    /**
     * Helper to run prompt with streaming chunk support if callback provided, else standard prompt.
     */
    async _runPrompt(
        apiKeyOrConfig: string | AiConfig,
        prompt: string,
        images?: string[],
        onStreamChunk?: (payload: StreamChunkCallbackPayload) => void,
        options?: { signal?: AbortSignal }
    ): Promise<string> {
        if (options?.signal?.aborted) {
            throw new DOMException('The operation was aborted by the user', 'AbortError');
        }
        if (onStreamChunk) {
            const res = await executeStreamingAiPrompt(apiKeyOrConfig, prompt, images, onStreamChunk, options);
            return res.text;
        }
        return executeAiPrompt(apiKeyOrConfig, prompt, images, options);
    },

    /**
     * Medical Report Knowledge & Parameter Breakdown Engine:
     * Parses uploaded lab reports, imaging, vitals, and notes to extract
     * all parameters with reference ranges, status flags, and deep
     * 'What If Increased?' and 'What If Decreased?' clinical analyses.
     */
    async generateReportKnowledge(
        apiKeyOrConfig: string | AiConfig,
        patientData?: string,
        images?: string[],
        options?: {
            language?: TargetLanguage;
            audienceMode?: AudienceMode;
            onStreamChunk?: (payload: StreamChunkCallbackPayload) => void;
            signal?: AbortSignal;
        }
    ): Promise<ReportKnowledgeData> {
        const language = options?.language || 'english';
        const audienceMode = options?.audienceMode || 'doctor';

        const prompt = `
You are a Lead Clinical Pathologist, Laboratory Medicine Specialist, and Medical Educator.

${getLanguageDirective(language)}

${getAudienceDirective(audienceMode)}

Exhaustively analyze all provided medical reports, laboratory panels, diagnostic values, imaging findings (ECG, X-Ray, CT, Ultrasound, Echo), vitals, and clinical dictations in the text or attached images.

Extract EVERY parameter, biomarker, lab value, or measurement found in the report into a highly structured clinical breakdown.

For EACH parameter:
1. "name": Standard clinical name (e.g. "Hemoglobin", "Troponin I", "Serum Creatinine", "WBC Count", "Ejection Fraction", "Blood Pressure - Systolic", "Potassium", "Platelets", "SGPT / ALT").
2. "category": Anatomical/system panel (e.g. "Complete Blood Count (CBC)", "Renal Function Panel", "Cardiac Biomarkers & Enzymes", "Electrolytes", "Liver Function Panel", "Lipid Profile", "Imaging & Hemodynamics", "Vitals & Physiological Metrics").
3. "value": The measured value found in the report (e.g. "8.2", "1.45", "14,500", "55%").
4. "unit": Unit of measurement (e.g. "g/dL", "ng/mL", "mg/dL", "cells/mcL", "%", "mEq/L", "mmHg").
5. "referenceRange": Standard normal reference range (e.g. "13.5 - 17.5 g/dL", "< 0.04 ng/mL", "3.5 - 5.0 mEq/L").
6. "status": Exactly one of: "normal" | "high" | "low" | "critical_high" | "critical_low" | "abnormal" | "borderline".
7. "interpretation": Precise clinical assessment of what this observed value indicates for this patient.
8. "whatIfIncreased": ${
    audienceMode === 'simplified'
        ? 'First-principles explanation of what causes this number to go up, what happens inside the body when it is too high, and what symptoms or problems might occur.'
        : 'Deep pathophysiology, differential diagnoses, etiologies (e.g. renal failure, hemolysis, ischemia, endocrinopathies), and clinical risks if this parameter increases/is elevated.'
}
9. "whatIfDecreased": ${
    audienceMode === 'simplified'
        ? 'First-principles explanation of what causes this number to drop, what happens inside the body when it is too low, and what symptoms or problems might occur.'
        : 'Deep pathophysiology, differential diagnoses, etiologies (e.g. blood loss, malabsorption, marrow suppression, dilution), and clinical risks if this parameter decreases/is low.'
}

**Required Output Schema:**
Return a single, strictly valid JSON object:
{
  "reportType": "Title describing the panels (e.g., Complete Hemogram, Cardiac Enzymes & Renal Panel)",
  "patientOverview": "Concise 1-2 sentence overview of the patient status reflected across these findings",
  "sampleDateOrInfo": "Date or specimen source if visible, otherwise null",
  "totalParametersCount": 12,
  "abnormalParametersCount": 3,
  "criticalAlerts": [
    "Critical alert 1 if any life-threatening value exists (e.g., Critical Troponin I elevation indicating acute myocardial injury)"
  ],
  "keyClinicalHighlights": [
    "Highlight 1: Summary of the most significant abnormal finding and its clinical meaning",
    "Highlight 2: Compensatory or associated findings",
    "Highlight 3: Crucial baseline or normal finding to note"
  ],
  "categories": [
    {
      "categoryName": "Category Name (e.g. Complete Blood Count)",
      "parameters": [
        {
          "name": "Hemoglobin",
          "category": "Complete Blood Count",
          "value": "8.2",
          "unit": "g/dL",
          "referenceRange": "13.5 - 17.5 g/dL",
          "status": "low",
          "interpretation": "Moderate normocytic anemia requiring evaluation for blood loss or marrow suppression.",
          "whatIfIncreased": "...",
          "whatIfDecreased": "..."
        }
      ]
    }
  ]
}

${patientData ? `\nPatient Notes & Data:\n${patientData}` : ''}
`;

        const text = await this._runPrompt(apiKeyOrConfig, prompt, images, options?.onStreamChunk, { signal: options?.signal });

        const fallback: ReportKnowledgeData = {
            reportType: 'Clinical Diagnostic Report',
            patientOverview: 'Report parameters extracted and analyzed.',
            totalParametersCount: 0,
            abnormalParametersCount: 0,
            categories: [],
            keyClinicalHighlights: ['Review the uploaded report documents for detailed parameters.'],
        };

        const parsed = parseAiJson<ReportKnowledgeData>(text, fallback);
        return parsed;
    },

    /**
     * Master AI Diagnosis Generator:
     * Supports both Clinical/Doctor mode and Simplified First-Principles mode,
     * in English or Hinglish with strict language enforcement.
     * Also extracts structured report knowledge if medical documents/labs are attached.
     */
    async generateComprehensiveDiagnosis(
        apiKeyOrConfig: string | AiConfig,
        patientData?: string,
        images?: string[],
        options?: {
            language?: TargetLanguage;
            audienceMode?: AudienceMode;
            onStreamChunk?: (payload: StreamChunkCallbackPayload) => void;
            signal?: AbortSignal;
            callbacks?: {
                onThoughtChunk?: (chunk: string, fullThought: string) => void;
                onTextChunk?: (chunk: string, fullText: string) => void;
                onStatus?: (status: string) => void;
            };
        }
    ): Promise<{
        diagnoses: DiagnosisItem[];
        clinicalAnswer: ClinicalAnswerData;
        summary: string;
        proactiveQuestions: string[];
        caseSummaryForPresentation: string;
        reportKnowledge?: ReportKnowledgeData | null;
        thinkingProcess?: string;
    }> {
        const language = options?.language || 'english';
        const audienceMode = options?.audienceMode || 'doctor';

        const prompt = `
You are an expert Medical Consultant and Educator analyzing a medical case.

${getLanguageDirective(language)}

${getAudienceDirective(audienceMode)}

Analyze the provided clinical notes, patient history, laboratory findings, attached audio dictations/voice memos, and medical imaging/documents. If audio files are attached, listen to the speaker's case presentation, auscultation audio, or symptoms described.

**Required Output Schema:**
Return a single, strictly valid JSON object matching this structure:
{
  "summary": "Concise 1-2 sentence summary of the case vignette / core bodily issue",
  "diagnoses": [
    {
      "diagnosis": "Condition Name",
      "confidenceLevel": 0.85,
      "lifeThreatCategory": "Emergent" | "Urgent" | "Secondary",
      "reasoning": "${
          audienceMode === 'simplified'
              ? 'First-principles explanation of how this condition affects the body, using intuitive real-world analogies so anyone can understand why this happens.'
              : 'Detailed pathophysiology and clinical evidence supporting or refuting this diagnosis based on findings.'
      }",
      "missingInformation": {
        "information": ["${
            audienceMode === 'simplified'
                ? 'Key questions or everyday symptoms to check with the patient / doctor'
                : 'Specific clinical history or physical exam findings to clarify'
        }"],
        "tests": ["${
            audienceMode === 'simplified'
                ? 'Simple explanation of what tests (e.g. Blood test, X-Ray, ECG) are needed and why'
                : 'Specific guideline-directed diagnostic test / biomarker / imaging with rationale'
        }"]
      }
    }
  ],
  "clinicalAnswer": {
    "answer": "${
        audienceMode === 'simplified'
            ? 'Engaging first-principles synthesis covering: 1. How this bodily system works normally vs what happened here, 2. Intuitive analogy explaining the root cause, 3. Immediate safe steps & what doctors look for, 4. How standard treatments help restore normal function, 5. Fascinating takeaways that spark curiosity for self-research.'
            : 'In-depth clinical synthesis covering: 1. Primary clinical impression & pathophysiology, 2. Immediate stabilization & triage protocols, 3. Step-by-step guideline-directed medical therapy (e.g. ACC/AHA, ESC, KDIGO, GOLD, Surviving Sepsis), 4. Key prognostic indicators and red flags.'
    }",
    "reasoning": "${
        audienceMode === 'simplified'
            ? 'The intuitive scientific explanation behind why these conclusions make sense.'
            : 'Comprehensive diagnostic breakdown and clinical judgment rationale.'
    }",
    "topic": "Primary Medical Specialty & Topic",
    "keyTakeaways": [
      "${audienceMode === 'simplified' ? 'Exciting first-principle takeaway 1' : 'Crucial clinical takeaway 1'}",
      "${audienceMode === 'simplified' ? 'Exciting first-principle takeaway 2' : 'Crucial clinical takeaway 2'}",
      "${audienceMode === 'simplified' ? 'Exciting first-principle takeaway 3' : 'Crucial clinical takeaway 3'}"
    ]
  },
  "proactiveQuestions": [
    "${
        audienceMode === 'simplified'
            ? 'Thought-provoking question 1 to spark curiosity about how the body adapts or compensates'
            : 'High-yield follow-up question 1 highlighting potential diagnostic blind spots or second-line management'
    }",
    "${
        audienceMode === 'simplified'
            ? 'Fascinating question 2 about the science behind why specific treatments work'
            : 'High-yield follow-up question 2 regarding atypical presentations or drug contraindications'
    }",
    "${
        audienceMode === 'simplified'
            ? 'Curiosity question 3 exploring related bodily systems or evolutionary biology'
            : 'High-yield follow-up question 3 regarding monitoring protocols or escalation triggers'
    }",
    "${
        audienceMode === 'simplified'
            ? 'Practical question 4 on what patients can research to better understand their health'
            : 'High-yield follow-up question 4 regarding board-relevant differential distinctions'
    }"
  ],
  "caseSummaryForPresentation": "A dense, structured synthesis combining presentation, key findings, provisional diagnoses, and mechanism. This will be used directly as text context to generate educational slide decks without re-sending raw image files.",
  "reportKnowledge": {
    "reportType": "Title of any attached report/panel or null if pure vignette",
    "patientOverview": "Brief laboratory/imaging overview",
    "totalParametersCount": 0,
    "abnormalParametersCount": 0,
    "criticalAlerts": [],
    "keyClinicalHighlights": [],
    "categories": [
      {
        "categoryName": "Category Name",
        "parameters": [
          {
            "name": "Parameter Name",
            "category": "Category",
            "value": "Value",
            "unit": "Unit",
            "referenceRange": "Ref Range",
            "status": "normal" | "high" | "low" | "critical_high" | "critical_low" | "abnormal",
            "interpretation": "Interpretation",
            "whatIfIncreased": "Clinical explanation if increased",
            "whatIfDecreased": "Clinical explanation if decreased"
          }
        ]
      }
    ]
  }
}

${patientData ? `\nPatient Data & Clinical Notes:\n${patientData}` : ''}
`;

        let capturedThinking = '';
        const chunkHandler = (payload: StreamChunkCallbackPayload) => {
            if (payload.thinking) capturedThinking = payload.thinking;
            if (options?.onStreamChunk) {
                options.onStreamChunk(payload);
            }
            if (options?.callbacks) {
                if (payload.thinking && options.callbacks.onThoughtChunk) {
                    options.callbacks.onThoughtChunk(payload.thinking, payload.thinking);
                }
                if (payload.text && options.callbacks.onTextChunk) {
                    options.callbacks.onTextChunk(payload.text, payload.text);
                }
            }
        };

        const text = await this._runPrompt(
            apiKeyOrConfig,
            prompt,
            images,
            options?.onStreamChunk || options?.callbacks ? chunkHandler : undefined,
            { signal: options?.signal }
        );

        const { cleanText, thinking: inlineThinking } = stripThinkingTags(text || '');
        const effectiveThinking = capturedThinking || inlineThinking || undefined;

        const fallback = {
            diagnoses: [
                {
                    diagnosis: 'Provisional Clinical Differential',
                    confidenceLevel: 0.75,
                    lifeThreatCategory: 'Emergent' as const,
                    reasoning: sanitizeClinicalAnswerText(cleanText) || 'Comprehensive clinical differential based on presentation.',
                    missingInformation: { information: [], tests: [] },
                },
            ],
            clinicalAnswer: {
                answer: sanitizeClinicalAnswerText(cleanText) || 'Clinical differential analysis and management synthesized.',
                reasoning: 'Clinical reasoning generated.',
                topic: 'Clinical Analysis',
            },
            summary: 'Clinical Case Analysis',
            proactiveQuestions: [
                'What additional investigations should be prioritized?',
                'What are the physiological mechanisms involved?',
                'What are the guideline-directed treatment protocols?',
            ],
            caseSummaryForPresentation: patientData || 'Clinical Case',
            reportKnowledge: null as ReportKnowledgeData | null,
        };

        const parsed = parseAiJson(cleanText, fallback);

        // Ensure clinical answer and diagnosis reasoning are strictly sanitized (no raw thinking tags or raw JSON)
        const sanitizedDiagnoses = (parsed.diagnoses || fallback.diagnoses).map((d: any, idx: number) => ({
            diagnosis: d.diagnosis || d.condition || `Differential #${idx + 1}`,
            confidenceLevel: typeof d.confidenceLevel === 'number' ? d.confidenceLevel : 0.8,
            lifeThreatCategory: d.lifeThreatCategory || 'Emergent',
            reasoning: sanitizeClinicalAnswerText(d.reasoning || d.rationale || ''),
            missingInformation: {
                information: Array.isArray(d.missingInformation?.information) ? d.missingInformation.information : [],
                tests: Array.isArray(d.missingInformation?.tests) ? d.missingInformation.tests : [],
            },
        }));

        const sanitizedClinicalAnswer = {
            answer: sanitizeClinicalAnswerText(parsed.clinicalAnswer?.answer || fallback.clinicalAnswer.answer),
            reasoning: sanitizeClinicalAnswerText(parsed.clinicalAnswer?.reasoning || fallback.clinicalAnswer.reasoning),
            topic: parsed.clinicalAnswer?.topic || fallback.clinicalAnswer.topic,
            keyTakeaways: Array.isArray(parsed.clinicalAnswer?.keyTakeaways) ? parsed.clinicalAnswer.keyTakeaways : [],
        };

        return {
            diagnoses: sanitizedDiagnoses,
            clinicalAnswer: sanitizedClinicalAnswer,
            summary: parsed.summary || fallback.summary,
            proactiveQuestions: parsed.proactiveQuestions || fallback.proactiveQuestions,
            caseSummaryForPresentation:
                parsed.caseSummaryForPresentation || parsed.summary || patientData || 'Case study details',
            reportKnowledge: parsed.reportKnowledge && parsed.reportKnowledge.categories && parsed.reportKnowledge.categories.length > 0 ? parsed.reportKnowledge : null,
            thinkingProcess: effectiveThinking,
        };
    },

    /**
     * Follow-up Q&A Engine for Clinical & General Cases:
     */
    async answerClinicalFollowUp(
        apiKeyOrConfig: string | AiConfig,
        params: {
            originalQuestion?: string;
            originalAnswer?: string;
            diagnosesSummary?: string;
            userFollowUp: string;
            images?: string[];
            conversationHistory?: Array<{ question: string; answer: string }>;
            language?: TargetLanguage;
            audienceMode?: AudienceMode;
            onStreamChunk?: (payload: StreamChunkCallbackPayload) => void;
            signal?: AbortSignal;
        }
    ): Promise<{
        answer: string;
        reasoning?: string;
        suggestedFollowUps?: string[];
    }> {
        const language = params.language || 'english';
        const audienceMode = params.audienceMode || 'doctor';

        const prompt = `
You are an expert Consultant, Educator, and Subject Matter Expert answering a follow-up inquiry.

${getLanguageDirective(language)}

${getAudienceDirective(audienceMode)}

**Adaptive Domain & Subject Matter Guidance:**
- If the case or inquiry is clinical/medical, provide rigorous evidence-based clinical guidance.
- If you see any request, question, or attached document/image which is unrelated to medical topics (e.g. engineering, mathematics, computer science, physics, chemistry, competitive exams like UPSC/GATE/NEET, history, economics, philosophy, law, or general knowledge) which does not require medical domain knowledge, then shift your thinking from medicine to the attached query's Subject Matter Expert (SME) and professor. Answer the question thoroughly and accurately according to that discipline, while STRICTLY maintaining the JSON formatting schema below so that visual output is not hampered.

**Original Context:**
- Clinical Notes / Question: ${params.originalQuestion || 'N/A'}
- Primary Diagnoses / Summary: ${params.diagnosesSummary || 'N/A'}
- Initial Analysis: ${params.originalAnswer || 'N/A'}

${
    params.conversationHistory && params.conversationHistory.length > 0
        ? `**Previous Follow-up Thread:**\n${params.conversationHistory
              .map((h, i) => `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer}`)
              .join('\n\n')}\n`
        : ''
}

**User's Follow-up Question:**
"${params.userFollowUp}"

**Instructions:**
1. Provide a comprehensive answer tailored to the specified audience and language. If images, lab panels, schematics, or PDF documents are attached, examine them closely.
2. If in Simplified mode, break down the answer from first principles with intuitive analogies. If in Doctor/Advanced mode, provide deep academic and guideline/theoretical precision.
3. Suggest 3 additional high-yield follow-up questions relevant to this thread.
4. Output MUST be a valid JSON object:
{
  "answer": "Clear, detailed answer with markdown formatting for bold headings and key points in the chosen language.",
  "reasoning": "Underlying mechanism, theoretical foundation, or analytical rationale.",
  "suggestedFollowUps": ["Next question 1", "Next question 2", "Next question 3"]
}
`;

        const text = await this._runPrompt(apiKeyOrConfig, prompt, params.images, params.onStreamChunk, { signal: params.signal });

        return parseAiJson(text, {
            answer: text,
            reasoning: 'Reasoning provided.',
            suggestedFollowUps: [],
        });
    },

    /**
     * Follow-up Q&A Engine for Individual Slides:
     */
    async answerSlideFollowUp(
        apiKeyOrConfig: string | AiConfig,
        params: {
            presentationTopic: string;
            slideTitle: string;
            slideContent: any;
            slideSummary?: string;
            userQuestion: string;
            images?: string[];
            language?: TargetLanguage;
            audienceMode?: AudienceMode;
            onStreamChunk?: (payload: StreamChunkCallbackPayload) => void;
            signal?: AbortSignal;
        }
    ): Promise<{
        answer: string;
        reasoning?: string;
        clinicalPearls?: string[];
    }> {
        const language = params.language || 'english';
        const audienceMode = params.audienceMode || 'doctor';

        const prompt = `
You are an expert Educator and Subject Matter Expert explaining a specific presentation slide.

${getLanguageDirective(language)}

${getAudienceDirective(audienceMode)}

**Adaptive Domain & Subject Matter Guidance:**
- If the slide is medical, provide clinical education.
- If you see any request, question, or attached document/image which is unrelated to the medical topic (e.g. engineering, mathematics, physics, computer science, UPSC/civil services, humanities, general knowledge), then shift your thinking from medicine to the attached query's Subject Matter Expert (SME) and answer with high authority, precision, and pedagogical clarity while strictly maintaining the JSON formatting schema so that visual output is not hampered.

**Presentation Main Topic:** ${params.presentationTopic}
**Current Slide Title:** ${params.slideTitle}
**Slide Content:** ${JSON.stringify(params.slideContent)}
${params.slideSummary ? `**Slide Summary:** ${params.slideSummary}` : ''}

**User's Question on this Slide:**
"${params.userQuestion}"

**Instructions:**
1. Provide a clear, engaging answer specific to this slide's domain in the chosen language and audience style. If images/documents are attached, analyze them in this context.
2. If in Simplified mode, explain the core concept from first principles with vivid analogies. If in Doctor/Advanced mode, connect concepts to high-level theory, practical applications, and exam pearls.
3. Output valid JSON:
{
  "answer": "Detailed answer explaining the concept with clear formatting.",
  "reasoning": "Deeper mechanism / theoretical or analytical context.",
  "clinicalPearls": [
    "${audienceMode === 'simplified' ? 'Fascinating first-principle insight 1' : 'High-yield domain pearl / exam tip 1'}",
    "${audienceMode === 'simplified' ? 'Fascinating first-principle insight 2' : 'High-yield domain pearl / exam tip 2'}"
  ]
}
`;

        const text = await this._runPrompt(apiKeyOrConfig, prompt, params.images, params.onStreamChunk, { signal: params.signal });

        return parseAiJson(text, {
            answer: text,
            reasoning: 'Educational rationale.',
            clinicalPearls: [],
        });
    },

    /**
     * Direct Inquiry & Clinical Question Answerer:
     */
    async answerClinicalQuestion(
        apiKeyOrConfig: string | AiConfig,
        question?: string,
        images?: string[],
        options?: {
            language?: TargetLanguage;
            audienceMode?: AudienceMode;
            onStreamChunk?: (payload: StreamChunkCallbackPayload) => void;
            signal?: AbortSignal;
        }
    ) {
        const language = options?.language || 'english';
        const audienceMode = options?.audienceMode || 'doctor';

        let prompt = `
You are an expert Subject Matter Consultant, Educator, and Professor.

${getLanguageDirective(language)}

${getAudienceDirective(audienceMode)}

**Adaptive Domain & Subject Matter Guidance:**
- If the inquiry, case presentation, or attached files are medical or clinical, provide high-level clinical guidance and differential analysis.
- CRITICAL: If you see any request, question, or attached document/image which is unrelated to the medical topic which doesn't require MBBS or PG level attention (e.g. engineering, mathematics, computer science, physics, chemistry, competitive exams like UPSC/GATE/NEET, history, economics, philosophy, general knowledge, or daily questions), then shift your thinking from this unrelated medical topic to the attached query's Subject Matter Expert (SME) and answer the question accordingly and thoroughly, but by strictly maintaining the JSON formatting schema so that output should not get hampered in visual way.

If audio dictations or voice recordings are attached, listen to the speaker's inquiry or prompt.

**Constraints:**
1. Output MUST be a valid JSON object.
2. The object must have:
   - "topic": Short descriptive subject/topic title in the target language.
   - "answer": Comprehensive, well-structured explanation with clear formatting, bold concepts, and step-by-step clarity in the target language.
   - "reasoning": The underlying mechanism, theoretical proof, rationale, or analytical context.
   - "proactiveQuestions": Array of 3-4 high-yield proactive deep-dive questions related to this topic.
   - "keyTakeaways": Array of 3 points (high-yield summary points or core takeaways).
`;

        if (question) prompt += `\n\nQuestion / Inquiry: ${question}`;

        const text = await this._runPrompt(apiKeyOrConfig, prompt, images, options?.onStreamChunk, { signal: options?.signal });

        return parseAiJson(text, {
            answer: text,
            reasoning: 'Analysis performed by AI model.',
            topic: 'Subject Analysis',
            proactiveQuestions: [
                'What are the primary underlying principles for this topic?',
                'How to approach advanced problem solving in this area?',
            ],
            keyTakeaways: [],
        });
    },

    async summarizeQuestion(
        apiKeyOrConfig: string | AiConfig,
        question?: string,
        images?: string[],
        options?: {
            language?: TargetLanguage;
            audienceMode?: AudienceMode;
            onStreamChunk?: (payload: StreamChunkCallbackPayload) => void;
            signal?: AbortSignal;
        }
    ) {
        const language = options?.language || 'english';

        let prompt = `
${getLanguageDirective(language)}

Summarize the following inquiry, case question, or prompt into a concise 1-2 sentence title / summary in ${language.toUpperCase()}. If the prompt is non-medical (e.g., engineering, mathematics, UPSC/exam prep, general knowledge), summarize it accurately for that subject.
`;
        if (question) prompt += `\n\nInput: ${question}`;

        const text = await this._runPrompt(apiKeyOrConfig, prompt, images, options?.onStreamChunk, { signal: options?.signal });
        return { summary: text.trim() };
    },

    /**
     * Presentation Outline Generator
     */
    async generatePresentationOutline(
        apiKeyOrConfig: string | AiConfig,
        input: {
            question?: string;
            answer?: string;
            reasoning?: string;
            topic?: string;
            language?: TargetLanguage;
            audienceMode?: AudienceMode;
            onStreamChunk?: (payload: StreamChunkCallbackPayload) => void;
            signal?: AbortSignal;
        }
    ) {
        const language = input.language || 'english';
        const audienceMode = input.audienceMode || 'doctor';

        let prompt = `
${getLanguageDirective(language)}

${getAudienceDirective(audienceMode)}
`;

        if (input.topic) {
            prompt += `
Generate a structured presentation outline of 12-15 slide titles for the topic: **${input.topic}**.

**Adaptive Domain & Subject Matter Guidance:**
- If the topic is medical or clinical, structure the outline covering introduction, pathophysiology, clinical presentation, diagnostic criteria/workup, management guidelines, special populations/complications, and high-yield board summary.
- CRITICAL: If you see any request which is unrelated to the medical topic which doesn't require MBBS or PG level medical attention (e.g. engineering, mathematics, computer science, physics, UPSC/civil services exam preparation, history, economics, business, or general knowledge), then shift your thinking from this unrelated medical topic to the attached query's Subject Matter Expert (SME) and professor. Structure the 12-15 slide titles to comprehensively cover that subject (e.g., Fundamentals & Core Principles, Theoretical Framework & Architecture, Key Equations/Concepts, Step-by-Step Mechanisms, Real-world Applications & Case Studies, Comparative Tables, Exam High-Yield Points, and Synthesis/Summary), while strictly maintaining the JSON formatting schema so that visual output is not hampered.

${
    audienceMode === 'simplified'
        ? 'Structure the outline to introduce the topic from basic fundamentals and intuitive analogies up to practical understanding, exciting insights, and empowering applications.'
        : 'Structure the outline with rigorous academic depth, systematic taxonomy, and high-yield professional/exam insights.'
}

Output a valid JSON object with a single key "outline" whose value is an array of strings in the target language.
`;
        } else {
            prompt += `
Generate a structured presentation outline of 10-12 topics based on this case or inquiry.

**Adaptive Domain & Subject Matter Guidance:**
- If the inquiry is medical, structure topics covering Case Summary & Key Questions, Mechanisms, Differential Considerations, Workup, Management, and Key Insights.
- If the inquiry or attached data is non-medical (e.g. engineering, mathematics, general science, UPSC/exam preparation), shift your thinking to the premier Subject Matter Expert in that subject and structure the 10-12 topics logically for that field (Introduction & Core Questions, Fundamental Principles, Detailed Analysis, Applications/Examples, Exam Pearls & Summary).

The VERY FIRST topic MUST be "${audienceMode === 'simplified' ? 'Core Story & Key Questions' : 'Case & Topic Summary with Key Questions'}".

Output a valid JSON object with a single key "outline" containing an array of strings in the target language.

Case / Inquiry Details:
Question: ${input.question}
Answer: ${input.answer}
Reasoning: ${input.reasoning}
`;
        }

        const text = await this._runPrompt(apiKeyOrConfig, prompt, undefined, input.onStreamChunk, { signal: input.signal });

        return parseAiJson(text, {
            outline: [
                'Overview & First Principles',
                'Core Mechanisms & Theory',
                'Key Concepts & Structural Analysis',
                'Diagnostic Criteria & Methods Explained',
                'Strategies & Practical Applications',
                'Comparative Framework & Edge Cases',
                'Fascinating Insights & Key Takeaways',
            ],
        });
    },

    /**
     * Detailed Slide Content Generator with Per-Slide Pearls and Summaries:
     */
    async generateSlideContent(
        apiKeyOrConfig: string | AiConfig,
        input: {
            topic: string;
            selectedTopics: string[];
            fullQuestion?: string;
            fullAnswer?: string;
            caseSummaryForPresentation?: string;
            language?: TargetLanguage;
            audienceMode?: AudienceMode;
            onStreamChunk?: (payload: StreamChunkCallbackPayload) => void;
            signal?: AbortSignal;
        }
    ): Promise<Slide[]> {
        const language = input.language || 'english';
        const audienceMode = input.audienceMode || 'doctor';

        const prompt = `
You are a Premier Professor, Educator, and Subject Matter Expert creating an exceptional slide deck.

${getLanguageDirective(language)}

${getAudienceDirective(audienceMode)}

**Adaptive Domain & Subject Matter Guidance:**
- If the presentation topic or inquiry is medical, provide authoritative clinical and pathophysiology content.
- CRITICAL: If you see any request which is unrelated to the medical topic which doesn't require MBBS or PG level medical attention (e.g. engineering, mathematics, physics, computer science, economics, UPSC/civil services exam preparation, history, or general knowledge), then shift your thinking from this unrelated medical topic to the attached query's Subject Matter Expert (SME) and professor. Answer the question accordingly and deliver deep, accurate, and structured content for each slide, while STRICTLY maintaining the JSON formatting schema so that output should not get hampered in visual way. For non-medical topics, use "clinicalPearls" to provide high-yield domain pearls, exam tips, key formulas, or "Did You Know?" insights for that field.

**Presentation Parameters:**
- **Main Topic:** ${input.topic}
${input.fullQuestion ? `- **Full Inquiry / Question:** ${input.fullQuestion}` : ''}
${input.fullAnswer ? `- **Full Analysis:** ${input.fullAnswer}` : ''}
${input.caseSummaryForPresentation ? `- **Case / Context Synthesis:** ${input.caseSummaryForPresentation}` : ''}

**Topics for Slide Generation:**
${input.selectedTopics.map((t: string) => `- ${t}`).join('\n')}

**Core Requirements:**
1. Generate one slide for EACH topic listed. Output MUST be a JSON array of slide objects.
2. For each slide, produce:
   - "title": Exact topic title from the list
   - "content": Array of rich content items (paragraph, bullet_list, numbered_list, note, table)
   - "summary": A 1-2 sentence high-yield summary of this slide's core message.
   - "clinicalPearls": 2-3 ${audienceMode === 'simplified' ? 'fascinating first-principles insights or "Did You Know?" facts that spark excitement' : 'high-yield viva / exam pearls, core takeaways, or domain-specific insights'}.
   - "proactiveQuestions": 2-3 proactive deep-dive questions related to this slide.
3. For ${audienceMode === 'simplified' ? 'Simplified First-Principles audience: Use intuitive real-world analogies, clear cause-and-effect explanations, and accessible tables comparing normal vs affected states or concept comparisons.' : 'Doctor / Professional audience: Ensure dense, authoritative, guideline-cited or theory-cited content. Use formatted tables frequently for comparisons, criteria, reference values, differential diagnoses, or decision algorithms.'}
4. Tables: Every table MUST be custom-tailored and distinct to that specific slide's topic with real, meaningful values and clear column headers (e.g., Parameter vs Value vs Significance, Feature A vs Feature B vs Application, Criteria vs Finding). NEVER reuse or duplicate generic table data across slides. In tables, EVERY row's "cells" array length MUST EXACTLY EQUAL the "headers" array length.
5. For bolding, use the "bold" array with exact substring matches. DO NOT use markdown '**' in text strings.
6. The entire output MUST be in the chosen target language (${language.toUpperCase()}).

**Supported Content Types:**
- "paragraph": {"type": "paragraph", "text": "...", "bold": ["..."]}
- "bullet_list": {"type": "bullet_list", "items": [{"text": "...", "bold": ["..."]}]}
- "numbered_list": {"type": "numbered_list", "items": [{"text": "...", "bold": ["..."]}]}
- "note": {"type": "note", "text": "..."}
- "table": {"type": "table", "headers": ["Feature", "Finding / Range", "Significance"], "rows": [{"cells": ["Specific Criteria A", "Value / Observation", "Interpretation"]}]}

Produce ONLY the JSON array.
`;

        const text = await this._runPrompt(apiKeyOrConfig, prompt, undefined, input.onStreamChunk, { signal: input.signal });

        // 1. Try progressive slide parser first (handles live markdown, code blocks, balance scanning, cell normalization)
        const progressive = extractProgressiveSlides(text);
        if (progressive && progressive.length > 0) {
            const hasRealContent = progressive.some((s) => s.content && s.content.length > 0);
            if (hasRealContent) {
                return progressive;
            }
        }

        // 2. Try JSON parser with array unwrap
        const parsed = parseAiJson<Slide[]>(text, []);
        if (Array.isArray(parsed) && parsed.length > 0) {
            const validParsed = parsed
                .filter((s) => s && typeof s === 'object' && s.title)
                .map((s) => ({
                    title: s.title,
                    content: Array.isArray(s.content) ? sanitizeContentItems(s.content) : [],
                    summary: s.summary || '',
                    clinicalPearls: Array.isArray(s.clinicalPearls) ? s.clinicalPearls : [],
                    proactiveQuestions: Array.isArray(s.proactiveQuestions) ? s.proactiveQuestions : [],
                }));
            if (validParsed.length > 0 && validParsed.some((s) => s.content.length > 0)) {
                return validParsed;
            }
        }

        if (progressive && progressive.length > 0) {
            return progressive;
        }

        const fallback = input.selectedTopics.map((t: string) => ({
            title: t,
            content: [
                {
                    type: 'paragraph' as const,
                    text: `Key details and insights for ${t}.`,
                    bold: [t],
                },
            ],
            summary: `Overview of ${t}.`,
            clinicalPearls: [`Master the core concepts for ${t}.`],
            proactiveQuestions: [`What are the latest updates on ${t}?`],
        }));

        return fallback;
    },

    /**
     * Token-Efficient Bridge: Generate Slide Deck directly from Compact Diagnosis Case Summary
     */
    async generatePresentationFromCaseSummary(
        apiKeyOrConfig: string | AiConfig,
        caseSummary: string,
        topic: string,
        diagnosesText?: string,
        options?: {
            language?: TargetLanguage;
            audienceMode?: AudienceMode;
            onStreamChunk?: (payload: StreamChunkCallbackPayload) => void;
            onOutlineReady?: (outline: string[]) => void;
            signal?: AbortSignal;
        }
    ): Promise<{ outline: string[]; slides: Slide[] }> {
        const language = options?.language || 'english';
        const audienceMode = options?.audienceMode || 'doctor';

        // Step 1: Generate outline with streaming
        const outlineData = await this.generatePresentationOutline(apiKeyOrConfig, {
            topic: topic,
            question: caseSummary,
            answer: diagnosesText,
            language: language,
            audienceMode: audienceMode,
            onStreamChunk: options?.onStreamChunk,
            signal: options?.signal,
        });

        const selectedTopics = outlineData.outline.slice(0, 10);
        if (options?.onOutlineReady) {
            options.onOutlineReady(outlineData.outline);
        }

        // Step 2: Generate slide content using only compact text context with live streaming
        const slides = await this.generateSlideContent(apiKeyOrConfig, {
            topic: topic,
            selectedTopics: selectedTopics,
            caseSummaryForPresentation: caseSummary,
            fullAnswer: diagnosesText,
            language: language,
            audienceMode: audienceMode,
            onStreamChunk: options?.onStreamChunk,
            signal: options?.signal,
        });

        return {
            outline: outlineData.outline,
            slides: slides,
        };
    },

    async suggestTopics(
        apiKeyOrConfig: string | AiConfig,
        input: {
            question?: string;
            topic?: string;
            existingTopics: string[];
            language?: TargetLanguage;
            audienceMode?: AudienceMode;
            signal?: AbortSignal;
        }
    ) {
        const language = input.language || 'english';
        const audienceMode = input.audienceMode || 'doctor';

        const prompt = `
${getLanguageDirective(language)}

${getAudienceDirective(audienceMode)}

**Adaptive Domain & Subject Matter Guidance:**
- If the topic or inquiry is non-medical (e.g. engineering, mathematics, physics, computer science, UPSC/general exams, history, general knowledge), shift your thinking to the Subject Matter Expert (SME) in that field.

Based on the following ${input.topic ? 'topic' : 'case / inquiry'}, suggest 6-8 new topics for additional presentation slides in ${language.toUpperCase()}.
Exclude existing topics: ${input.existingTopics.join(', ')}

Output a JSON object with a single key "topics" containing an array of strings in the target language.
${input.topic ? `Topic: ${input.topic}` : `Inquiry / Case: ${input.question}`}
`;

        const text = await executeAiPrompt(apiKeyOrConfig, prompt, undefined, { signal: input.signal });
        return parseAiJson(text, { topics: [] });
    },

    async generateSingleSlide(
        apiKeyOrConfig: string | AiConfig,
        topic: string,
        options?: {
            language?: TargetLanguage;
            audienceMode?: AudienceMode;
            signal?: AbortSignal;
        }
    ): Promise<Slide> {
        const language = options?.language || 'english';
        const audienceMode = options?.audienceMode || 'doctor';

        const prompt = `
You are an expert Educator and Subject Matter Expert.

${getLanguageDirective(language)}

${getAudienceDirective(audienceMode)}

**Adaptive Domain & Subject Matter Guidance:**
- If the topic is non-medical, act as the premier Subject Matter Expert in that discipline, maintaining strict JSON structure.

Generate content for a single presentation slide on the topic: **${topic}**.

**Requirements:**
1. The slide's "title" must be "${topic}".
2. Rich content using bullet lists, tables, or numbered lists in ${language.toUpperCase()}.
3. Provide "summary", "clinicalPearls" (2-3 items), and "proactiveQuestions" (2-3 items).
4. Output a single JSON object.

Format:
{
  "title": "${topic}",
  "content": [
    {"type": "bullet_list", "items": [{"text": "...", "bold": ["..."]}]}
  ],
  "summary": "...",
  "clinicalPearls": ["..."],
  "proactiveQuestions": ["..."]
}
`;

        const text = await executeAiPrompt(apiKeyOrConfig, prompt, undefined, { signal: options?.signal });
        return parseAiJson(text, {
            title: topic,
            content: [{ type: 'paragraph', text: `Detailed information for ${topic}.` }],
            summary: `Summary of ${topic}`,
            clinicalPearls: [],
            proactiveQuestions: [],
        });
    },

    /**
     * AI Speech-to-Text Transcription for Voice Dictation & Audio Notes:
     * Transcribes audio memos using Groq Whisper (whisper-large-v3-turbo), OpenAI Whisper,
     * custom OpenAI-compatible audio endpoints, or Gemini fallback before sending
     * to ensure 100% compatibility with all text and multimodal LLM providers.
     */
    async transcribeAudio(
        apiKeyOrConfig: string | AiConfig | { sttConfig?: SttConfig } | undefined,
        audioDataUriOrBase64: string,
        mimeType = 'audio/webm',
        options?: { signal?: AbortSignal }
    ): Promise<string> {
        if (options?.signal?.aborted) {
            throw new DOMException('The operation was aborted by the user', 'AbortError');
        }

        const config = resolveAiConfig(apiKeyOrConfig as any);
        const sttConfig = (apiKeyOrConfig as any)?.sttConfig || config.sttConfig;

        // 1. Try dedicated server-side transcription route
        try {
            const res = await fetch('/api/ai/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audioData: audioDataUriOrBase64,
                    mimeType,
                    sttConfig,
                    config,
                }),
                signal: options?.signal,
            });

            if (res.ok) {
                const data = await res.json();
                if (data.transcript) {
                    return data.transcript;
                }
            } else {
                const errorData = await res.json().catch(() => null);
                if (errorData?.error) {
                    console.warn('Transcribe route returned error:', errorData.error);
                }
            }
        } catch (err: any) {
            if (isAbortError(err) || options?.signal?.aborted) {
                throw new DOMException('The operation was aborted by the user', 'AbortError');
            }
            console.warn('Server audio transcription route failed, trying direct client path:', err);
        }

        if (options?.signal?.aborted) {
            throw new DOMException('The operation was aborted by the user', 'AbortError');
        }

        // 2. Direct client-side Groq / Whisper fallback if key is directly present
        if (sttConfig?.provider === 'groq' && sttConfig?.apiKey) {
            try {
                const cleanBase64 = audioDataUriOrBase64.includes('base64,')
                    ? audioDataUriOrBase64.split('base64,')[1]
                    : audioDataUriOrBase64;
                const binaryString = atob(cleanBase64);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
                const formData = new FormData();
                formData.append('file', new Blob([bytes], { type: mimeType }), 'speech.webm');
                formData.append('model', sttConfig.model || 'whisper-large-v3-turbo');
                formData.append('response_format', 'json');

                const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${sttConfig.apiKey}` },
                    body: formData,
                    signal: options?.signal,
                });
                if (groqRes.ok) {
                    const gData = await groqRes.json();
                    if (gData.text) return gData.text.trim();
                }
            } catch (gErr: any) {
                if (isAbortError(gErr) || options?.signal?.aborted) {
                    throw new DOMException('The operation was aborted by the user', 'AbortError');
                }
                console.warn('Direct client Groq transcription fallback error:', gErr);
            }
        }

        if (options?.signal?.aborted) {
            throw new DOMException('The operation was aborted by the user', 'AbortError');
        }

        // 3. Direct Gemini audio transcription fallback
        try {
            const cleanBase64 = audioDataUriOrBase64.includes('base64,')
                ? audioDataUriOrBase64.split('base64,')[1]
                : audioDataUriOrBase64;

            const apiKey = config.geminiApiKey || config.apiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
            if (!apiKey) {
                throw new Error('API key is missing for audio transcription. Please configure your Whisper or Gemini key in Settings.');
            }

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
            const result = await model.generateContent([
                {
                    inlineData: {
                        data: cleanBase64,
                        mimeType: mimeType || 'audio/webm',
                    },
                },
                'Transcribe this clinical voice dictation verbatim into clean text. Capture all medical terms, dosages, and patient symptoms accurately. Output ONLY the transcribed text.',
            ]);

            return result.response.text().trim();
        } catch (fallbackErr: any) {
            if (isAbortError(fallbackErr) || options?.signal?.aborted) {
                throw new DOMException('The operation was aborted by the user', 'AbortError');
            }
            console.error('Direct audio transcription failed:', fallbackErr);
            throw new Error(fallbackErr?.message || 'Failed to transcribe audio note.');
        }
    },

    /**
     * Targeted Slide Modification & Depth Expansion:
     * Only modifies the specified selected slides to guarantee 100% reliability,
     * deep clinical tables, pearls, and staging, and merges them back cleanly.
     */
    async modifySlides(
        apiKeyOrConfig: string | AiConfig,
        input: {
            slides: Slide[];
            selectedIndices: number[];
            action: 'replace_content' | 'expand_selected' | string;
            language?: TargetLanguage;
            audienceMode?: AudienceMode;
            signal?: AbortSignal;
            onStreamChunk?: (payload: StreamChunkCallbackPayload) => void;
        }
    ): Promise<Slide[]> {
        const language = input.language || 'english';
        const audienceMode = input.audienceMode || 'doctor';

        if (!input.selectedIndices || input.selectedIndices.length === 0) {
            return input.slides;
        }

        // Extract ONLY the slides to be modified
        const targetSlides = input.selectedIndices
            .map((idx) => ({
                originalIndex: idx,
                slide: input.slides[idx],
            }))
            .filter((item) => Boolean(item.slide));

        if (targetSlides.length === 0) {
            return input.slides;
        }

        const isExpand = input.action === 'expand_selected';

        const prompt = `
You are a Distinguished Medical Professor and Curriculum Director modifying specific medical presentation slides.

${getLanguageDirective(language)}

${getAudienceDirective(audienceMode)}

**Action to perform on target slides:** ${isExpand ? 'EXPAND DEPTH & CLINICAL DETAIL' : 'RE-SYNTHESIZE & REFRESH CONTENT'}

**Target Slides to Modify (${targetSlides.length} slide${targetSlides.length > 1 ? 's' : ''}):**
${JSON.stringify(
    targetSlides.map((t) => ({
        originalIndex: t.originalIndex,
        title: t.slide.title,
        currentContent: t.slide.content,
        currentSummary: t.slide.summary,
    }))
)}

**Core Instructions:**
1. ${
    isExpand
        ? `EXPAND the clinical depth of each target slide significantly. Add:
           - In-depth cellular/hemodynamic pathophysiology, clinical staging criteria, or drug dosing/contraindications.
           - At least ONE dedicated clinical comparison/diagnostic criteria TABLE with clear column headers (e.g. Parameter vs Value vs Clinical Action, Drug vs Mechanism vs Dosing) with real medical values.
           - 2-3 new high-yield clinical pearls and 2-3 proactive Viva/Board questions.
           - An updated 1-2 sentence executive summary.`
        : `RE-SYNTHESIZE each target slide with a fresh clinical perspective, structured bullet points, clear medical tables, updated summary, and new pearls.`
}
2. For ${
    audienceMode === 'simplified'
        ? 'Simplified mode: Use intuitive real-world mechanical/biological analogies and clear cause-and-effect breakdowns.'
        : 'Doctor mode: Provide rigorous postgraduate-level evidence-based precision and guideline citations (ACC/AHA, ESC, KDIGO, GOLD).'
}
3. In tables, EVERY row's "cells" array length MUST EXACTLY EQUAL the "headers" array length.
4. Output MUST be a valid JSON array containing exactly ${targetSlides.length} modified slide object(s), with "originalIndex" matching each target slide:

[
  {
    "originalIndex": ${targetSlides[0].originalIndex},
    "title": "${targetSlides[0].slide.title}",
    "content": [
      {"type": "bullet_list", "items": [{"text": "...", "bold": ["..."]}]},
      {"type": "table", "headers": ["Clinical Metric", "Reference", "Pathological Significance"], "rows": [{"cells": ["Metric A", "Normal", "Indicates X"]}]}
    ],
    "summary": "Updated high-yield summary.",
    "clinicalPearls": ["Pearl 1", "Pearl 2"],
    "proactiveQuestions": ["Question 1", "Question 2"]
  }
]
`;

        const text = await this._runPrompt(
            apiKeyOrConfig,
            prompt,
            undefined,
            input.onStreamChunk,
            { signal: input.signal }
        );

        type ModifiedSlideItem = Slide & { originalIndex?: number };
        let parsedModified = parseAiJson<ModifiedSlideItem[]>(text, []);

        // Fallback: If returned object wasn't unwrapped into an array or was empty
        if (!Array.isArray(parsedModified) || parsedModified.length === 0) {
            const progressiveSlides = extractProgressiveSlides(text);
            if (progressiveSlides.length > 0) {
                parsedModified = progressiveSlides.map((s, idx) => ({
                    ...s,
                    originalIndex: targetSlides[idx]?.originalIndex ?? input.selectedIndices[idx],
                }));
            }
        }

        if (!Array.isArray(parsedModified) || parsedModified.length === 0) {
            console.warn('Failed to parse modified slides JSON, keeping original slides.');
            return input.slides;
        }

        // Clone slides array and merge modified slides back into their exact original positions
        const mergedSlides = [...input.slides];
        parsedModified.forEach((modSlide, i) => {
            const targetIndex =
                typeof modSlide.originalIndex === 'number'
                    ? modSlide.originalIndex
                    : targetSlides[i]?.originalIndex ?? input.selectedIndices[i];

            if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex < mergedSlides.length) {
                const currentSlide = mergedSlides[targetIndex];
                const cleanContent = Array.isArray(modSlide.content) && modSlide.content.length > 0
                    ? sanitizeContentItems(modSlide.content)
                    : currentSlide.content;

                const cleanPearls = Array.isArray(modSlide.clinicalPearls) && modSlide.clinicalPearls.length > 0
                    ? modSlide.clinicalPearls.filter(Boolean)
                    : currentSlide.clinicalPearls;

                const cleanQuestions = Array.isArray(modSlide.proactiveQuestions) && modSlide.proactiveQuestions.length > 0
                    ? modSlide.proactiveQuestions.filter(Boolean)
                    : currentSlide.proactiveQuestions;

                mergedSlides[targetIndex] = {
                    title: (modSlide.title && typeof modSlide.title === 'string' && modSlide.title.trim())
                        ? modSlide.title.trim()
                        : currentSlide.title,
                    content: cleanContent,
                    summary: (modSlide.summary && typeof modSlide.summary === 'string' && modSlide.summary.trim())
                        ? modSlide.summary.trim()
                        : currentSlide.summary,
                    clinicalPearls: cleanPearls,
                    proactiveQuestions: cleanQuestions,
                };
            }
        });

        return mergedSlides;
    },

    /**
     * Ingests documents/notes/PYQ/text and generates a Document Summary + Initial Hierarchical Knowledge Tree.
     * Uses a token-efficient Indented Markdown Outline format (saving 60-70% tokens vs verbose JSON).
     * Works with all LLM providers (Gemini, Groq, OpenAI, Anthropic, OpenRouter, DeepSeek, Together, Ollama).
     */
    async generateKnowledgeMap(
        apiKeyOrConfig: string | AiConfig,
        input: {
            text?: string;
            images?: any;
            language?: TargetLanguage;
            audienceMode?: AudienceMode;
            onStreamChunk?: (payload: StreamChunkCallbackPayload) => void;
            signal?: AbortSignal;
        }
    ): Promise<{ title: string; documentSummary: string; tree: KnowledgeTreeNode[] }> {
        const language = input.language || 'en';
        const audienceMode = input.audienceMode || 'doctor';

        const prompt = `You are a master academic educator, subject matter expert, and first-principles knowledge architect.
Analyze the provided document pages, notes, previous year questions (PYQ), or study topic.

**Core Objectives:**
1. Generate an overarching "title" for this subject or uploaded document.
2. Generate a thorough, high-yield "documentSummary" (3 to 4 paragraphs) synthesizing the major domains, foundational principles, core mechanisms, and key exam/clinical themes.
3. Construct a clean, multi-level hierarchical "tree" (3 to 6 top-level topics).
   - Under each top-level topic (depth 0), break it down into 2 to 4 logical subtopics (depth 1).
   - For key subtopics, include 2 to 3 granular sub-subtopics (depth 2) where appropriate.
   - Flow logically from fundamental foundations to granular mechanisms and clinical/practical applications.
   - Attach a "[PYQ: TagName]" tag on high-yield exam nodes (e.g. "Core Concept", "High-Yield PYQ", "Frequently Tested", "Diagnostic Rule", "Must-Know Mechanism").
   - Attach a "[ANCHOR: Principle]" on key nodes explaining the ground-truth principle in 1 sentence.

**User Material / Input:**
${input.text ? input.text : '[Visual document/image pages attached. Extract and organize all topics directly from the attachments.]'}

**Audience & Language:**
- Target Language: ${language.toUpperCase()}
- Mode: ${audienceMode === 'simplified' ? 'Simplified & Intuitive (Use accessible analogies and clear cause-and-effect)' : 'Professional & Academic (Rigorous, high-yield, structured)'}

**Strict Output Format (Token-Efficient Markdown Outline):**
Generate your response strictly using this structured outline format (do NOT use verbose JSON):

# TITLE: [Overarching Subject / Document Title]

## SUMMARY
[3-4 high-yield paragraphs synthesizing foundational principles, core mechanisms, and key themes...]

## TREE
* 1. Primary Topic Name [PYQ: Core Concept] [ANCHOR: Foundational law or invariant]
  > Clear 1-2 sentence orientation of this domain.
  * 1.1 Subtopic Name [PYQ: High-Yield PYQ]
    > Specific mechanism or concept description.
    * 1.1.1 Granular Concept Name
      > Granular rule, calculation, or finding.
    * 1.1.2 Second Granular Concept Name [PYQ: Must-Know Mechanism] [ANCHOR: Underlying causal truth]
      > Granular rule, mechanism, or finding.
  * 1.2 Second Subtopic Name [PYQ: Frequently Tested]
    > Specific mechanism or concept description.
* 2. Second Primary Topic Name [PYQ: Core Concept] [ANCHOR: Ground-truth law]
  > Clear 1-2 sentence orientation of this domain.
  * 2.1 Subtopic Name
    > Description...

Produce the complete Markdown outline directly without surrounding commentary.`;

        const text = await this._runPrompt(
            apiKeyOrConfig,
            prompt,
            input.images,
            input.onStreamChunk,
            { signal: input.signal }
        );

        return parseKnowledgeMapResponse(text, input.text);
    },

    /**
     * Surgical Token-Efficient Node Dissection:
     * Expands and breaks down a specific subtopic into 3-6 granular sub-subtopics.
     * Uses a token-saving Markdown bullet format (saving ~65% tokens vs JSON).
     */
    async dissectAndExpandKnowledgeNode(
        apiKeyOrConfig: string | AiConfig,
        input: {
            documentSummary: string;
            targetNode: { id: string; title: string; description: string; depth: number };
            parentTitle?: string;
            rootTitle?: string;
            siblingTitles?: string[];
            language?: TargetLanguage;
            audienceMode?: AudienceMode;
            onStreamChunk?: (payload: StreamChunkCallbackPayload) => void;
            signal?: AbortSignal;
        }
    ): Promise<KnowledgeTreeNode[]> {
        const language = input.language || 'en';
        const audienceMode = input.audienceMode || 'doctor';

        const prompt = `You are a master academic educator and first-principles knowledge architect.
Dissect the specified topic into 3 to 6 granular, logical, and non-overlapping subtopics.

**Surgical Context:**
- Document Overview: ${input.documentSummary.slice(0, 800)}
${input.rootTitle ? `- Domain / Subject: ${input.rootTitle}` : ''}
${input.parentTitle ? `- Parent Category: ${input.parentTitle}` : ''}
${input.siblingTitles && input.siblingTitles.length > 0 ? `- Sibling Subtopics (DO NOT DUPLICATE THESE): ${input.siblingTitles.join(', ')}` : ''}

**Target Node To Dissect:**
- Title: "${input.targetNode.title}"
- Current Summary: "${input.targetNode.description}"
- Current Depth: ${input.targetNode.depth}

**Task:**
Deconstruct "${input.targetNode.title}" into 3 to 6 deeper, highly specific sub-subtopics that provide deep clarity.
For each subtopic, provide:
- Concept name with numeric numbering
- Optional [PYQ: Tag] (e.g. "High Yield", "Frequently Tested", "Must-Know Mechanism")
- Optional [ANCHOR: Principle] (1-sentence ground-truth invariant)
- 1-2 sentence orientation description under the bullet (prefixed with >)

**Target Language:** ${language.toUpperCase()}
**Target Mode:** ${audienceMode === 'simplified' ? 'Simplified / Intuitive' : 'Academic / In-Depth'}

**Strict Output Format (Token-Efficient Markdown Bullets):**
* 1. Specific Sub-concept Name [PYQ: High-Yield PYQ] [ANCHOR: Ground truth mechanism]
  > Clear 1-2 sentence orientation explaining this subtopic.
* 2. Second Sub-concept Name [PYQ: Frequently Tested]
  > Clear 1-2 sentence description.

Produce ONLY the Markdown bullet list directly.`;

        const text = await this._runPrompt(
            apiKeyOrConfig,
            prompt,
            undefined,
            input.onStreamChunk,
            { signal: input.signal }
        );

        return parseDissectMarkdownResponse(text, input.targetNode);
    },

    /**
     * Surgical Token-Efficient Node Explanation:
     * Explains a specific subtopic using Standard, First-Principles, or Simplified Analogy lens.
     * Uses ONLY Document Summary + Lineage Path (Parent + Node + Siblings).
     */
    async explainKnowledgeNode(
        apiKeyOrConfig: string | AiConfig,
        input: {
            documentSummary: string;
            targetNode: { title: string; description: string; depth: number; firstPrincipleAnchor?: string };
            parentTitle?: string;
            rootTitle?: string;
            siblingTitles?: string[];
            mode: 'standard' | 'first_principles' | 'simplified';
            language?: TargetLanguage;
            audienceMode?: AudienceMode;
            onStreamChunk?: (payload: StreamChunkCallbackPayload) => void;
            signal?: AbortSignal;
        }
    ): Promise<string> {
        const language = input.language || 'en';

        let modeInstructions = '';
        if (input.mode === 'first_principles') {
            modeInstructions = `**Lens: First-Principles Derivation (Ground-Up Truths)**
- Deconstruct this concept down to its absolute fundamental truths (physics, biochemistry, physiology, or foundational mathematical/logical rules).
- Explain *why* it must be this way from the ground up, eliminating rote memorization.
- Show the foundational causal chain (Step 1 -> Step 2 -> Step 3).
- Highlight why common misconceptions violate this fundamental principle.`;
        } else if (input.mode === 'simplified') {
            modeInstructions = `**Lens: Intuitive Analogy & Simplified Breakdown (Explain Like I'm 12)**
- Use a vivid, memorable real-world analogy (e.g. plumbing, city traffic, kitchen cooking, everyday objects).
- Explain the concept in crystal-clear plain language without losing core accuracy.
- Map the analogy directly back to the technical reality point-by-point.
- Include 3 Quick Rules of Thumb to easily remember it forever.`;
        } else {
            modeInstructions = `**Lens: Standard Comprehensive & High-Yield Deep Dive**
- Provide a rigorous, structured, and complete academic/clinical breakdown.
- Include:
  1. **Core Definition & Significance**
  2. **Underlying Mechanisms / Step-by-Step Pathway**
  3. **High-Yield Clinical / Practical Application & Rules**
  4. **Key Differential / Comparison Table** (if applicable)
  5. **Exam / PYQ Traps & Golden Pearls**`;
        }

        const prompt = `You are a master academic educator and first-principles professor.
Explain the following concept with extreme clarity and educational rigor.

**Surgical Context:**
- Document Synthesis: ${input.documentSummary.slice(0, 800)}
${input.rootTitle ? `- Domain / Main Subject: ${input.rootTitle}` : ''}
${input.parentTitle ? `- Parent Category: ${input.parentTitle}` : ''}
${input.siblingTitles && input.siblingTitles.length > 0 ? `- Related Sibling Concepts: ${input.siblingTitles.join(', ')}` : ''}

**Target Concept to Explain:**
- Title: "${input.targetNode.title}"
- Summary: "${input.targetNode.description}"
${input.targetNode.firstPrincipleAnchor ? `- Anchor Principle: "${input.targetNode.firstPrincipleAnchor}"` : ''}

${modeInstructions}

**Formatting Guidelines:**
- Format in rich, clean GitHub-flavored Markdown.
- Use bolding, clear sub-headings (###), bullet points, callout blockquotes (>), and comparison tables.
- Write in ${language.toUpperCase()}.

Produce the complete Markdown explanation directly without meta-commentary.`;

        const markdownText = await this._runPrompt(
            apiKeyOrConfig,
            prompt,
            undefined,
            input.onStreamChunk,
            { signal: input.signal }
        );

        const { cleanText } = stripThinkingTags(markdownText || '');
        return cleanText.trim();
    },
    isAbortError,
    formatModelDisplayName,
    resolveAiConfig,
};

/**
 * Universal robust parser for Knowledge Maps.
 * Decodes Indented Markdown Outline (saving 60-70% tokens) as primary format,
 * and maintains full backwards-compatibility with JSON schemas.
 */
export function parseKnowledgeMapResponse(
    rawText: string,
    userPromptOrTopic?: string
): { title: string; documentSummary: string; tree: KnowledgeTreeNode[] } {
    if (!rawText || typeof rawText !== 'string') {
        return createDefaultKnowledgeMap(userPromptOrTopic);
    }

    const { cleanText } = stripThinkingTags(rawText);
    const cleaned = cleanText.trim();

    // 1. Try Markdown Outline parsing first (Token-Efficient Standard)
    const mdResult = parseMarkdownKnowledgeOutline(cleaned, userPromptOrTopic);
    if (mdResult.tree.length > 0) {
        return mdResult;
    }

    // 2. Fallback: Try standard JSON parse & repair if an LLM returned JSON
    let parsed = parseAiJson<any>(cleaned, null);

    // If still null, try balanced bracket extraction
    if (!parsed) {
        const balanced = extractBalancedJson(cleaned);
        if (balanced) {
            try {
                parsed = JSON.parse(balanced);
            } catch {
                try {
                    parsed = JSON.parse(repairJsonString(balanced));
                } catch {}
            }
        }
    }

    // 3. Unwrap wrapper objects if nested
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const wrapperKeys = [
            'knowledgeMap',
            'knowledge_map',
            'knowledgeTree',
            'knowledge_tree',
            'studyMap',
            'study_map',
            'data',
            'result',
            'response',
            'output',
            'map',
            'mindmap',
            'tree',
            'content',
        ];
        for (const key of wrapperKeys) {
            if (parsed[key] && typeof parsed[key] === 'object') {
                parsed = parsed[key];
                break;
            }
        }
    }

    // 4. Extract raw tree, title, and summary from JSON
    let rawTree: any[] = [];
    let title = '';
    let documentSummary = '';

    if (Array.isArray(parsed)) {
        rawTree = parsed;
    } else if (parsed && typeof parsed === 'object') {
        title =
            parsed.title ||
            parsed.name ||
            parsed.topic ||
            parsed.subject ||
            parsed.documentTitle ||
            parsed.document_title ||
            parsed.mapTitle ||
            parsed.map_title ||
            parsed.heading ||
            parsed.mainTopic ||
            parsed.main_topic ||
            '';

        documentSummary =
            parsed.documentSummary ||
            parsed.document_summary ||
            parsed.summary ||
            parsed.docSummary ||
            parsed.overview ||
            parsed.synthesis ||
            parsed.description ||
            parsed.abstract ||
            parsed.details ||
            parsed.introduction ||
            '';

        const treeCandidateKeys = [
            'tree',
            'topics',
            'nodes',
            'branches',
            'hierarchy',
            'mindmap',
            'modules',
            'sections',
            'subtopics',
            'sub_topics',
            'chapters',
            'outline',
            'knowledgeTree',
            'knowledge_tree',
            'items',
            'curriculum',
            'syllabus',
            'children',
            'concepts',
        ];

        for (const key of treeCandidateKeys) {
            if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
                rawTree = parsed[key];
                break;
            }
        }

        if (rawTree.length === 0 && (parsed.children || parsed.subtopics || parsed.nodes || parsed.branches)) {
            rawTree = [parsed];
        }
    }

    // 5. Sanitize and structure the JSON nodes recursively
    let idCounter = 1;
    const sanitizeNode = (raw: any, depth = 0, prefix = 'node'): KnowledgeTreeNode => {
        if (typeof raw === 'string') {
            return {
                id: `${prefix}_${idCounter++}`,
                title: raw.trim(),
                description: '',
                depth,
                isExpanded: depth < 2,
            };
        }

        const nodeId = raw.id || raw.key || raw.nodeId || `${prefix}_${idCounter++}`;
        const nodeTitle =
            typeof raw.title === 'string' && raw.title.trim()
                ? raw.title.trim()
                : typeof raw.name === 'string' && raw.name.trim()
                ? raw.name.trim()
                : typeof raw.topic === 'string' && raw.topic.trim()
                ? raw.topic.trim()
                : typeof raw.label === 'string' && raw.label.trim()
                ? raw.label.trim()
                : typeof raw.heading === 'string' && raw.heading.trim()
                ? raw.heading.trim()
                : typeof raw.concept === 'string' && raw.concept.trim()
                ? raw.concept.trim()
                : `Topic ${idCounter}`;

        const description =
            typeof raw.description === 'string'
                ? raw.description.trim()
                : typeof raw.desc === 'string'
                ? raw.desc.trim()
                : typeof raw.summary === 'string'
                ? raw.summary.trim()
                : typeof raw.detail === 'string'
                ? raw.detail.trim()
                : typeof raw.content === 'string'
                ? raw.content.trim()
                : typeof raw.explanation === 'string'
                ? raw.explanation.trim()
                : typeof raw.overview === 'string'
                ? raw.overview.trim()
                : '';

        const pyqTag =
            typeof raw.pyqTag === 'string'
                ? raw.pyqTag.trim()
                : typeof raw.pyq_tag === 'string'
                ? raw.pyq_tag.trim()
                : typeof raw.tag === 'string'
                ? raw.tag.trim()
                : typeof raw.examTag === 'string'
                ? raw.examTag.trim()
                : typeof raw.badge === 'string'
                ? raw.badge.trim()
                : undefined;

        const firstPrincipleAnchor =
            typeof raw.firstPrincipleAnchor === 'string'
                ? raw.firstPrincipleAnchor.trim()
                : typeof raw.first_principle_anchor === 'string'
                ? raw.first_principle_anchor.trim()
                : typeof raw.firstPrinciple === 'string'
                ? raw.firstPrinciple.trim()
                : typeof raw.anchor === 'string'
                ? raw.anchor.trim()
                : typeof raw.mechanism === 'string'
                ? raw.mechanism.trim()
                : typeof raw.principle === 'string'
                ? raw.principle.trim()
                : undefined;

        const keyTakeaway =
            typeof raw.keyTakeaway === 'string'
                ? raw.keyTakeaway.trim()
                : typeof raw.key_takeaway === 'string'
                ? raw.key_takeaway.trim()
                : typeof raw.takeaway === 'string'
                ? raw.takeaway.trim()
                : undefined;

        const rawChildren =
            raw.children ||
            raw.subtopics ||
            raw.subNodes ||
            raw.sub_topics ||
            raw.sub_nodes ||
            raw.nodes ||
            raw.items ||
            raw.branches ||
            raw.topics ||
            raw.childTopics ||
            raw.child_topics ||
            raw.sub_concepts ||
            raw.subConcepts;

        const children: KnowledgeTreeNode[] = [];
        if (Array.isArray(rawChildren)) {
            for (const child of rawChildren) {
                if (child && (typeof child === 'object' || typeof child === 'string')) {
                    children.push(sanitizeNode(child, depth + 1, `${nodeId}_sub`));
                }
            }
        }

        return {
            id: nodeId,
            title: nodeTitle,
            description,
            depth,
            pyqTag,
            firstPrincipleAnchor,
            keyTakeaway,
            children: children.length > 0 ? children : undefined,
            isExpanded: depth < 2,
        };
    };

    const sanitizedTree = rawTree.map((n, i) => sanitizeNode(n, 0, `root_${i + 1}`));

    const cleanTitle =
        title.trim() ||
        (sanitizedTree[0]?.title && sanitizedTree[0].title.length < 50 ? sanitizedTree[0].title : '') ||
        userPromptOrTopic?.slice(0, 50)?.trim() ||
        'Knowledge Study Map';

    const cleanSummary =
        documentSummary.trim() ||
        'Comprehensive synthesis of the core topics, mechanisms, and key study themes.';

    if (sanitizedTree.length > 0) {
        return {
            title: cleanTitle,
            documentSummary: cleanSummary,
            tree: sanitizedTree,
        };
    }

    return createDefaultKnowledgeMap(userPromptOrTopic, cleanTitle);
}

/**
 * Extracts tagged metadata like [PYQ: ...] and [ANCHOR: ...] from a line of text,
 * returning the extracted tags and the cleaned title text.
 */
function extractTaggedMetadata(rawText: string): {
    cleanText: string;
    pyqTag?: string;
    firstPrincipleAnchor?: string;
} {
    let text = rawText;
    let pyqTag: string | undefined;
    let firstPrincipleAnchor: string | undefined;

    // Extract [PYQ: ...] or [TAG: ...] or [EXAM: ...]
    const pyqMatch = text.match(/\[(?:PYQ|TAG|EXAM):\s*(.*?)\]/i) || text.match(/\((?:PYQ|TAG|EXAM):\s*(.*?)\)/i);
    if (pyqMatch) {
        pyqTag = pyqMatch[1].trim();
        text = text.replace(pyqMatch[0], '').trim();
    }

    // Extract [ANCHOR: ...] or [FIRST PRINCIPLE: ...] or [GROUND TRUTH: ...]
    const anchorMatch =
        text.match(/\[(?:ANCHOR|FIRST PRINCIPLE|FIRST_PRINCIPLE|GROUND TRUTH|GROUND_TRUTH):\s*(.*?)\]/i) ||
        text.match(/\((?:ANCHOR|FIRST PRINCIPLE|GROUND TRUTH):\s*(.*?)\)/i);
    if (anchorMatch) {
        firstPrincipleAnchor = anchorMatch[1].trim();
        text = text.replace(anchorMatch[0], '').trim();
    }

    // Remove any leftover outer brackets or asterisks
    text = text.replace(/\*\*/g, '').trim();

    return {
        cleanText: text,
        pyqTag,
        firstPrincipleAnchor,
    };
}

/**
 * Parses Indented Markdown Outline (# TITLE, ## SUMMARY, ## TREE with indented bullets * / -)
 * into structured KnowledgeTreeNodes. Saves 60-70% tokens compared to raw JSON.
 */
export function parseMarkdownKnowledgeOutline(
    mdText: string,
    fallbackTitle?: string
): { title: string; documentSummary: string; tree: KnowledgeTreeNode[] } {
    if (!mdText || typeof mdText !== 'string') {
        return { title: fallbackTitle || 'Knowledge Study Map', documentSummary: '', tree: [] };
    }

    const lines = mdText.split('\n');
    let title = fallbackTitle || '';
    const summaryLines: string[] = [];
    const roots: KnowledgeTreeNode[] = [];
    const stack: KnowledgeTreeNode[] = [];
    let inSummary = false;
    let inTree = false;
    let idCounter = 1;

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();
        if (!trimmed) {
            if (inSummary) {
                summaryLines.push('');
            }
            continue;
        }

        // 1. Document Title (# TITLE: ... or # Title or TITLE: ...)
        if (!title && /^#\s+(?:TITLE:\s*)?(.*)/i.test(trimmed)) {
            const match = trimmed.match(/^#\s+(?:TITLE:\s*)?(.*)/i);
            if (match && match[1]) {
                title = match[1].replace(/\*\*/g, '').trim();
                continue;
            }
        } else if (!title && /^TITLE:\s*(.*)/i.test(trimmed)) {
            const match = trimmed.match(/^TITLE:\s*(.*)/i);
            if (match && match[1]) {
                title = match[1].replace(/\*\*/g, '').trim();
                continue;
            }
        }

        // 2. Summary Section Detection (## SUMMARY, ## OVERVIEW, etc.)
        if (/^##\s+(?:DOCUMENT\s+)?(?:SUMMARY|OVERVIEW|SYNTHESIS)/i.test(trimmed) || /^\*\*(?:Document\s+)?Summary:\*\*/i.test(trimmed)) {
            inSummary = true;
            inTree = false;
            // Capture any content on the same line if present
            const rest = trimmed.replace(/^##\s+(?:DOCUMENT\s+)?(?:SUMMARY|OVERVIEW|SYNTHESIS):?\s*/i, '').replace(/^\*\*(?:Document\s+)?Summary:\*\*\s*/i, '').trim();
            if (rest) summaryLines.push(rest);
            continue;
        }

        // 3. Tree Section Detection (## TREE, ## OUTLINE, ## KNOWLEDGE MAP, or first bullet)
        if (/^##\s+(?:TREE|OUTLINE|KNOWLEDGE\s+TREE|KNOWLEDGE\s+MAP|STRUCTURE)/i.test(trimmed)) {
            inSummary = false;
            inTree = true;
            continue;
        }

        // If in summary mode and not hit a bullet/tree marker yet
        if (inSummary) {
            if (/^(?:[-*]|\d+\.)\s+/.test(trimmed) || /^##\s+/i.test(trimmed)) {
                inSummary = false;
                inTree = true;
            } else {
                summaryLines.push(trimmed);
                continue;
            }
        }

        // 4. Tree Node Line Detection
        // Matches indented bullets: `* 1. ...`, `- 1.1 ...`, `* Topic`, `1. ...`, `1.1 ...`, `### ...`
        const bulletMatch = rawLine.match(/^(\s*)(?:[-*]|\d+(?:\.\d+)*\.)\s+(.*)/);
        const headingMatch = rawLine.match(/^(#{2,4})\s+(.*)/);

        if (bulletMatch || headingMatch) {
            inTree = true;
            inSummary = false;

            let leadingSpaces = 0;
            let rawContent = '';
            let dotDepth: number | null = null;

            if (bulletMatch) {
                leadingSpaces = bulletMatch[1].length;
                rawContent = bulletMatch[2].trim();

                // Check for numbering format like `1.`, `1.1`, `1.1.1` to calculate exact depth
                const numMatch = rawContent.match(/^(\d+(?:\.\d+)*)(?:[\.:\s]+)(.*)/);
                if (numMatch) {
                    const numString = numMatch[1];
                    const dots = (numString.match(/\./g) || []).length;
                    dotDepth = dots;
                }
            } else if (headingMatch) {
                const headingLevel = headingMatch[1].length;
                dotDepth = Math.max(0, headingLevel - 2);
                rawContent = headingMatch[2].trim();
            }

            // Calculate depth: prioritize dot count (e.g. 1.2 -> depth 1) or indentation (2 spaces/depth)
            let depth = 0;
            if (dotDepth !== null && dotDepth >= 0) {
                depth = dotDepth;
            } else {
                depth = Math.min(3, Math.floor(leadingSpaces / 2));
            }

            const { cleanText, pyqTag, firstPrincipleAnchor } = extractTaggedMetadata(rawContent);

            const newNode: KnowledgeTreeNode = {
                id: `node_${idCounter++}_${Date.now().toString(36).slice(-4)}`,
                title: cleanText,
                description: '',
                depth,
                pyqTag,
                firstPrincipleAnchor,
                children: [],
                isExpanded: depth < 2,
            };

            // Pop stack until parent depth is depth - 1
            while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
                stack.pop();
            }

            if (stack.length > 0) {
                const parent = stack[stack.length - 1];
                if (!parent.children) parent.children = [];
                parent.children.push(newNode);
            } else {
                roots.push(newNode);
            }

            stack.push(newNode);
            continue;
        }

        // 5. Description Line or Anchor line under current node (starts with `>` or indented text)
        if (stack.length > 0 && (trimmed.startsWith('>') || /^\s{2,}/.test(rawLine))) {
            const descContent = trimmed.replace(/^>\s*/, '').trim();
            const currentNode = stack[stack.length - 1];

            // Check if line contains tags like [ANCHOR: ...] or [PYQ: ...]
            const { cleanText, pyqTag, firstPrincipleAnchor } = extractTaggedMetadata(descContent);
            if (pyqTag && !currentNode.pyqTag) {
                currentNode.pyqTag = pyqTag;
            }
            if (firstPrincipleAnchor && !currentNode.firstPrincipleAnchor) {
                currentNode.firstPrincipleAnchor = firstPrincipleAnchor;
            }

            if (cleanText) {
                if (!currentNode.description) {
                    currentNode.description = cleanText;
                } else if (!currentNode.description.includes(cleanText)) {
                    currentNode.description += ' ' + cleanText;
                }
            }
        }
    }

    const finalSummary = summaryLines.filter(Boolean).join('\n\n').trim();

    return {
        title: title || fallbackTitle || 'Knowledge Study Map',
        documentSummary: finalSummary || 'Comprehensive synthesis of the core topics, mechanisms, and key study themes.',
        tree: roots,
    };
}

/**
 * Parses subtopic dissection response from Markdown bullets or JSON.
 */
export function parseDissectMarkdownResponse(
    text: string,
    targetNode: { id: string; title: string; depth: number }
): KnowledgeTreeNode[] {
    const parentId = targetNode.id;
    const newDepth = targetNode.depth + 1;
    const { cleanText: cleanedRaw } = stripThinkingTags(text || '');
    const textClean = cleanedRaw.trim();

    // 1. Try Markdown bullet parsing first
    const lines = textClean.split('\n');
    const nodes: KnowledgeTreeNode[] = [];
    let currentNode: KnowledgeTreeNode | null = null;
    let idxCounter = 1;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Check if line is a bullet item (* 1. ... or - 1.1 ... or * Topic)
        const bulletMatch = line.match(/^(\s*)(?:[-*]|\d+(?:\.\d+)*\.)\s+(.*)/);
        if (bulletMatch) {
            const rawContent = bulletMatch[2].trim();
            const { cleanText, pyqTag, firstPrincipleAnchor } = extractTaggedMetadata(rawContent);

            currentNode = {
                id: `${parentId}_dissect_${idxCounter++}_${Date.now().toString(36).slice(-4)}`,
                title: cleanText,
                description: '',
                depth: newDepth,
                pyqTag,
                firstPrincipleAnchor,
                isExpanded: true,
            };
            nodes.push(currentNode);
            continue;
        }

        // Description line (> ...)
        if (currentNode && (trimmed.startsWith('>') || /^\s{2,}/.test(line))) {
            const descContent = trimmed.replace(/^>\s*/, '').trim();
            const { cleanText, pyqTag, firstPrincipleAnchor } = extractTaggedMetadata(descContent);
            if (pyqTag && !currentNode.pyqTag) currentNode.pyqTag = pyqTag;
            if (firstPrincipleAnchor && !currentNode.firstPrincipleAnchor) currentNode.firstPrincipleAnchor = firstPrincipleAnchor;

            if (cleanText) {
                if (!currentNode.description) {
                    currentNode.description = cleanText;
                } else if (!currentNode.description.includes(cleanText)) {
                    currentNode.description += ' ' + cleanText;
                }
            }
        }
    }

    if (nodes.length > 0) {
        return nodes;
    }

    // 2. Fallback: Check if response was JSON array or object
    let parsed = parseAiJson<any[]>(textClean, []);
    if (!Array.isArray(parsed) || parsed.length === 0) {
        const objParsed = parseAiJson<any>(textClean, {});
        if (objParsed && typeof objParsed === 'object') {
            const candidateArrayKeys = ['subtopics', 'sub_topics', 'children', 'topics', 'nodes', 'items', 'branches', 'concepts'];
            for (const key of candidateArrayKeys) {
                if (Array.isArray(objParsed[key]) && objParsed[key].length > 0) {
                    parsed = objParsed[key];
                    break;
                }
            }
        }
    }

    if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item, idx) => {
            if (typeof item === 'string') {
                return {
                    id: `${parentId}_dissect_${idx + 1}_${Date.now().toString(36).slice(-4)}`,
                    title: item.trim(),
                    description: '',
                    depth: newDepth,
                    isExpanded: true,
                };
            }
            const title =
                typeof item.title === 'string' && item.title.trim()
                    ? item.title.trim()
                    : typeof item.name === 'string' && item.name.trim()
                    ? item.name.trim()
                    : `Subtopic ${idx + 1}`;

            const description =
                typeof item.description === 'string'
                    ? item.description.trim()
                    : typeof item.desc === 'string'
                    ? item.desc.trim()
                    : '';

            return {
                id: `${parentId}_dissect_${idx + 1}_${Date.now().toString(36).slice(-4)}`,
                title,
                description,
                depth: newDepth,
                pyqTag: item.pyqTag || item.pyq_tag || item.tag,
                firstPrincipleAnchor: item.firstPrincipleAnchor || item.first_principle_anchor || item.anchor,
                isExpanded: true,
            };
        });
    }

    // 3. Fallback default nodes
    return [
        {
            id: `${parentId}_dissect_1_${Date.now().toString(36).slice(-4)}`,
            title: `${targetNode.title}: Core Mechanism`,
            description: 'Fundamental processes and governing principles.',
            depth: newDepth,
            isExpanded: true,
        },
        {
            id: `${parentId}_dissect_2_${Date.now().toString(36).slice(-4)}`,
            title: `${targetNode.title}: Practical & Exam Takeaways`,
            description: 'High-yield rules, diagnostic criteria, and problem solving patterns.',
            depth: newDepth,
            isExpanded: true,
        },
    ];
}

function createDefaultKnowledgeMap(userPromptOrTopic?: string, titleOverride?: string) {
    const rawSubject = titleOverride || (userPromptOrTopic ? userPromptOrTopic.slice(0, 50).trim() : 'Knowledge Study Map');
    const safeTitle = rawSubject.replace(/[#*`]/g, '').trim() || 'Knowledge Study Map';

    return {
        title: safeTitle,
        documentSummary: `Comprehensive knowledge breakdown and first-principles framework for ${safeTitle}.`,
        tree: [
            {
                id: 'root_1',
                title: safeTitle,
                description: `Primary conceptual domain and foundations of ${safeTitle}.`,
                depth: 0,
                children: [
                    {
                        id: 'root_1_sub_1',
                        title: 'Foundational Principles & Mechanics',
                        description: 'Core physical, biological, or mathematical rules governing this domain.',
                        depth: 1,
                        firstPrincipleAnchor: 'Fundamental laws and foundational invariants.',
                        pyqTag: 'Core Concept',
                    },
                    {
                        id: 'root_1_sub_2',
                        title: 'Processes, Pathways & Methodologies',
                        description: 'Step-by-step causal mechanisms and analytical workflows.',
                        depth: 1,
                        pyqTag: 'High-Yield PYQ',
                    },
                ],
            },
        ],
    };
}

export default ClientSideAiService;
