'use client';

import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import type { AiProvider, AiConfig, SttProvider, SttConfig } from '@/types';

export type TargetLanguage = 'english' | 'hinglish';
export type AudienceMode = 'doctor' | 'simplified';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.7-flash';
export const DEFAULT_STT_MODEL = 'whisper-large-v3-turbo';

export interface ProviderPresetInfo {
    id: string;
    name: string;
    description: string;
    endpoint: string;
    defaultModel: string;
    recommendedModels: string[];
    placeholder: string;
    apiKeyUrl?: string;
    keyPrefix?: string;
    isCustom?: boolean;
    supportsVision?: boolean;
}

export const KNOWN_AI_PROVIDERS: ProviderPresetInfo[] = [
    {
        id: 'gemini',
        name: 'Google Gemini',
        description: 'Native Google AI Studio models with direct multimodal, reasoning, and visual capabilities.',
        endpoint: 'https://generativelanguage.googleapis.com',
        defaultModel: 'gemini-3.7-flash',
        recommendedModels: ['gemini-3.7-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
        placeholder: 'AIzaSy...',
        apiKeyUrl: 'https://aistudio.google.com/apikey',
        keyPrefix: 'AIza',
        supportsVision: true,
    },
    {
        id: 'groq',
        name: 'Groq Cloud',
        description: 'Ultra-low latency LPU inference with vision support and Whisper transcription.',
        endpoint: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.3-70b-versatile',
        recommendedModels: ['llama-3.3-70b-versatile', 'llama-3.2-11b-vision-preview', 'llama-3.1-8b-instant', 'deepseek-r1-distill-llama-70b'],
        placeholder: 'gsk_...',
        apiKeyUrl: 'https://console.groq.com/keys',
        keyPrefix: 'gsk_',
        supportsVision: true,
    },
    {
        id: 'openai',
        name: 'OpenAI',
        description: 'Official OpenAI GPT-4o, GPT-4o-mini, and reasoning models.',
        endpoint: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o',
        recommendedModels: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini', 'gpt-4-turbo'],
        placeholder: 'sk-proj-... or sk-...',
        apiKeyUrl: 'https://platform.openai.com/api-keys',
        keyPrefix: 'sk-',
        supportsVision: true,
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        description: 'Universal unified gateway to Claude 3.7, DeepSeek R1, GPT-4o, Llama 3, and 200+ models.',
        endpoint: 'https://openrouter.ai/api/v1',
        defaultModel: 'deepseek/deepseek-r1',
        recommendedModels: ['deepseek/deepseek-r1', 'anthropic/claude-3.7-sonnet', 'google/gemini-3.7-flash', 'meta-llama/llama-3.3-70b-instruct', 'openai/gpt-4o'],
        placeholder: 'sk-or-v1-...',
        apiKeyUrl: 'https://openrouter.ai/keys',
        keyPrefix: 'sk-or-',
        supportsVision: true,
    },
    {
        id: 'anthropic',
        name: 'Anthropic (Claude)',
        description: 'Official Anthropic Claude 3.7 Sonnet & Opus models.',
        endpoint: 'https://api.anthropic.com/v1',
        defaultModel: 'claude-3-7-sonnet-20250219',
        recommendedModels: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
        placeholder: 'sk-ant-...',
        apiKeyUrl: 'https://console.anthropic.com/settings/keys',
        keyPrefix: 'sk-ant-',
        supportsVision: true,
    },
    {
        id: 'deepseek',
        name: 'DeepSeek',
        description: 'Official DeepSeek V3 and DeepSeek R1 reasoning API.',
        endpoint: 'https://api.deepseek.com/v1',
        defaultModel: 'deepseek-chat',
        recommendedModels: ['deepseek-chat', 'deepseek-reasoner'],
        placeholder: 'sk-...',
        apiKeyUrl: 'https://platform.deepseek.com/api_keys',
        keyPrefix: 'sk-',
        supportsVision: false,
    },
    {
        id: 'cerebras',
        name: 'Cerebras Cloud',
        description: 'Blazing-fast CS-3 wafer scale inference (2600+ tok/s).',
        endpoint: 'https://api.cerebras.ai/v1',
        defaultModel: 'llama-3.3-70b',
        recommendedModels: ['llama-3.3-70b', 'llama3.1-8b'],
        placeholder: 'csk-...',
        apiKeyUrl: 'https://cloud.cerebras.ai',
        keyPrefix: 'csk-',
        supportsVision: false,
    },
    {
        id: 'ollama',
        name: 'Ollama (Local Host)',
        description: 'Self-hosted local models running directly on your machine or private network.',
        endpoint: 'http://localhost:11434/v1',
        defaultModel: 'llama3.2-vision',
        recommendedModels: ['llama3.2-vision', 'llama3.3', 'qwen2.5:14b', 'deepseek-r1:14b', 'mistral'],
        placeholder: 'Optional (leave blank for local server)',
        isCustom: true,
        supportsVision: true,
    },
    {
        id: 'custom',
        name: 'Custom OpenAI-Compatible',
        description: 'Any custom vLLM, LM Studio, TGI, or private API gateway.',
        endpoint: '',
        defaultModel: 'gpt-4o',
        recommendedModels: ['gpt-4o', 'llama-3.3-70b-versatile', 'claude-3-7-sonnet', 'deepseek-chat'],
        placeholder: 'sk-... or Bearer token',
        isCustom: true,
        supportsVision: true,
    }
];

export const INITIAL_SAVED_MODELS: Record<string, string[]> = {
    gemini: ['gemini-3.7-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
    groq: ['llama-3.3-70b-versatile', 'llama-3.2-11b-vision-preview', 'llama-3.1-8b-instant', 'deepseek-r1-distill-llama-70b'],
    openai: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
    openrouter: ['deepseek/deepseek-r1', 'anthropic/claude-3.7-sonnet', 'google/gemini-3.7-flash', 'meta-llama/llama-3.3-70b-instruct', 'openai/gpt-4o'],
    anthropic: ['anthropic/claude-3.7-sonnet', 'anthropic/claude-3.5-sonnet', 'anthropic/claude-3-5-haiku'],
    deepseek: ['deepseek-chat', 'deepseek-reasoner'],
    cerebras: ['llama-3.3-70b', 'llama3.1-8b'],
    ollama: ['llama3.2-vision', 'llama3.3', 'qwen2.5:14b', 'deepseek-r1:14b'],
    custom: ['gpt-4o', 'llama-3.3-70b-versatile', 'deepseek-chat'],
    stt: ['whisper-large-v3-turbo', 'whisper-large-v3', 'distil-whisper-large-v3-en', 'whisper-1'],
};

/**
 * Detects standard provider ID from endpoint URL.
 */
export function detectProviderIdFromEndpoint(endpoint: string, model?: string): string {
    if (!endpoint) return 'custom';
    const clean = endpoint.toLowerCase().trim();
    if (clean.includes('generativelanguage.googleapis.com') || clean.includes('gemini')) return 'gemini';
    if (clean.includes('groq.com') || clean.includes('groq')) return 'groq';
    if (clean.includes('api.openai.com') || clean === 'https://api.openai.com/v1' || clean === 'https://api.openai.com') return 'openai';
    if (clean.includes('anthropic.com')) return 'anthropic';
    if (clean.includes('deepseek.com')) return 'deepseek';
    if (clean.includes('cerebras.ai') || clean.includes('cerebras')) return 'cerebras';
    if (clean.includes('localhost') || clean.includes('127.0.0.1') || clean.includes('11434') || clean.includes('ollama')) return 'ollama';
    if (clean.includes('openrouter.ai') || clean.includes('openrouter')) return 'openrouter';
    return 'custom';
}

interface SettingsContextType {
    // AI Provider Configuration
    aiProvider: AiProvider;
    setAiProvider: (provider: AiProvider) => void;
    
    // Gemini Settings
    apiKey: string; // alias for geminiApiKey for backwards compatibility
    setApiKey: (key: string) => void;
    geminiApiKey: string;
    setGeminiApiKey: (key: string) => void;
    geminiModel: string;
    setGeminiModel: (model: string) => void;
    
    // Custom LLM / Endpoint Settings
    customEndpoint: string;
    setCustomEndpoint: (endpoint: string, autoLoadKey?: boolean) => void;
    customApiKey: string;
    setCustomApiKey: (key: string, providerId?: string) => void;
    customModel: string;
    setCustomModel: (model: string) => void;

    // Multi-provider key vault
    providerKeys: Record<string, string>;
    setProviderKey: (providerId: string, key: string) => void;
    getSavedKeyForProvider: (providerId: string) => string;
    saveAllProviderKeys: (keys: Record<string, string>) => void;
    switchToProviderPreset: (presetId: string) => { name: string; endpoint: string; model: string; key: string };

    // Speech-to-Text (STT) Settings
    sttProvider: SttProvider;
    setSttProvider: (provider: SttProvider, autoLoadKey?: boolean) => void;
    sttApiKey: string;
    setSttApiKey: (key: string, providerId?: string) => void;
    sttEndpoint: string;
    setSttEndpoint: (endpoint: string) => void;
    sttModel: string;
    setSttModel: (model: string) => void;
    sttConfig: SttConfig;
    sttProviderKeys: Record<string, string>;
    setSttProviderKey: (providerId: string, key: string) => void;
    getSavedSttKeyForProvider: (providerId: string) => string;
    saveAllSttProviderKeys: (keys: Record<string, string>) => void;

    // Saved Models Pill Box History per Provider
    savedModelsByProvider: Record<string, string[]>;
    addSavedModel: (providerId: string, model: string) => void;
    removeSavedModel: (providerId: string, model: string) => void;
    clearSavedModels: (providerId: string) => void;
    getSavedModelsForProvider: (providerId: string) => string[];

    // Derived AI state
    activeModel: string;
    aiConfig: AiConfig;
    isConfigured: boolean;
    hasServerKey: boolean;

    // Language & Audience Preferences
    language: TargetLanguage;
    setLanguage: (lang: TargetLanguage) => void;
    audienceMode: AudienceMode;
    setAudienceMode: (mode: AudienceMode) => void;
    compressImagesForAi: boolean;
    setCompressImagesForAi: (enabled: boolean) => void;
    targetImageKb: number;
    setTargetImageKb: (kb: number) => void;
    mergeImagesIntoSingle: boolean;
    setMergeImagesIntoSingle: (enabled: boolean) => void;
    mergeTargetKb: number;
    setMergeTargetKb: (kb: number) => void;

    // Feature Flags & Reasoning Toggle
    enableStreamingOutput: boolean;
    setEnableStreamingOutput: (enabled: boolean) => void;
    enableLiveThinking: boolean;
    setEnableLiveThinking: (enabled: boolean) => void;
    enableReasoning: boolean;
    setEnableReasoning: (enabled: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [aiProvider, setAiProviderInternal] = useState<AiProvider>('gemini');
    const [geminiApiKey, setGeminiApiKeyInternal] = useState<string>('');
    const [geminiModel, setGeminiModelInternal] = useState<string>(DEFAULT_GEMINI_MODEL);
    const [hasServerKey, setHasServerKey] = useState<boolean>(false);

    const [customEndpoint, setCustomEndpointInternal] = useState<string>('');
    const [customApiKey, setCustomApiKeyInternal] = useState<string>('');
    const [customModel, setCustomModelInternal] = useState<string>('gpt-4o');

    // Multi-Provider Key Vaults (mapping providerId -> key)
    const [providerKeys, setProviderKeys] = useState<Record<string, string>>({});
    const [sttProviderKeys, setSttProviderKeys] = useState<Record<string, string>>({});

    // STT State
    const [sttProvider, setSttProviderInternal] = useState<SttProvider>('groq');
    const [sttApiKey, setSttApiKeyInternal] = useState<string>('');
    const [sttEndpoint, setSttEndpointInternal] = useState<string>('https://api.groq.com/openai/v1');
    const [sttModel, setSttModelInternal] = useState<string>(DEFAULT_STT_MODEL);

    // Saved Models Pill Box History per Provider
    const [savedModelsByProvider, setSavedModelsByProvider] = useState<Record<string, string[]>>(INITIAL_SAVED_MODELS);

    const [language, setLanguageInternal] = useState<TargetLanguage>('english');
    const [audienceMode, setAudienceModeInternal] = useState<AudienceMode>('doctor');
    const [compressImagesForAi, setCompressImagesForAiInternal] = useState<boolean>(true);
    const [targetImageKb, setTargetImageKbInternal] = useState<number>(50);
    const [mergeImagesIntoSingle, setMergeImagesIntoSingleInternal] = useState<boolean>(false);
    const [mergeTargetKb, setMergeTargetKbInternal] = useState<number>(150);

    // Feature Flags & Reasoning Toggle (default true for deep clinical intelligence)
    const [enableStreamingOutput, setEnableStreamingOutputInternal] = useState<boolean>(false);
    const [enableLiveThinking, setEnableLiveThinkingInternal] = useState<boolean>(true);
    const [enableReasoning, setEnableReasoningInternal] = useState<boolean>(true);

    useEffect(() => {
        // Check if server-side environment variable is configured
        fetch('/api/ai/status')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data?.hasServerKey) {
                    setHasServerKey(true);
                }
            })
            .catch(() => {
                // Ignore background fetch failure
            });

        // 1. Load multi-provider LLM vault from localStorage
        let loadedProviderKeys: Record<string, string> = {};
        try {
            const rawVault = localStorage.getItem('app_provider_keys');
            if (rawVault) loadedProviderKeys = JSON.parse(rawVault);
        } catch {
            loadedProviderKeys = {};
        }

        // Migrate standalone provider keys if available
        const knownIds = ['gemini', 'groq', 'openai', 'openrouter', 'anthropic', 'deepseek', 'cerebras', 'ollama', 'custom'];
        for (const pid of knownIds) {
            const standalone = localStorage.getItem(`app_provider_key_${pid}`);
            if (standalone && !loadedProviderKeys[pid]) {
                loadedProviderKeys[pid] = standalone;
            }
        }
        // Also check legacy gemini_api_key and app_custom_api_key
        const legacyGemini = localStorage.getItem('gemini_api_key');
        if (legacyGemini && !loadedProviderKeys['gemini']) {
            loadedProviderKeys['gemini'] = legacyGemini;
        }
        if (!loadedProviderKeys['gemini'] && process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
            loadedProviderKeys['gemini'] = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
        }

        // 2. Load STT vault from localStorage
        let loadedSttKeys: Record<string, string> = {};
        try {
            const rawStt = localStorage.getItem('app_stt_provider_keys');
            if (rawStt) loadedSttKeys = JSON.parse(rawStt);
        } catch {
            loadedSttKeys = {};
        }
        const knownSttIds = ['groq', 'openai', 'gemini', 'custom'];
        for (const spid of knownSttIds) {
            const standaloneStt = localStorage.getItem(`app_stt_provider_key_${spid}`);
            if (standaloneStt && !loadedSttKeys[spid]) {
                loadedSttKeys[spid] = standaloneStt;
            }
        }
        const legacySttKey = localStorage.getItem('app_stt_api_key');
        if (legacySttKey && !loadedSttKeys['groq']) {
            loadedSttKeys['groq'] = legacySttKey;
        }

        // 3. Load active AI Provider
        const savedProvider = localStorage.getItem('app_ai_provider') as AiProvider | null;
        if (savedProvider === 'gemini' || savedProvider === 'custom') {
            setAiProviderInternal(savedProvider);
        }

        // 4. Load Gemini Config
        const activeGeminiKey = loadedProviderKeys['gemini'] || legacyGemini || '';
        setGeminiApiKeyInternal(activeGeminiKey);

        const savedGeminiModel = localStorage.getItem('app_gemini_model');
        if (savedGeminiModel) {
            setGeminiModelInternal(savedGeminiModel);
        } else {
            setGeminiModelInternal(DEFAULT_GEMINI_MODEL);
        }

        // 5. Load Custom LLM Endpoint Config
        const savedEndpoint = localStorage.getItem('app_custom_endpoint');
        if (savedEndpoint) {
            setCustomEndpointInternal(savedEndpoint);
        }
        const savedCustomModel = localStorage.getItem('app_custom_model');
        if (savedCustomModel) {
            setCustomModelInternal(savedCustomModel);
        }

        const pid = detectProviderIdFromEndpoint(savedEndpoint || '', savedCustomModel || '');
        const activeCustomKey = loadedProviderKeys[pid] || localStorage.getItem(`app_provider_key_${pid}`) || localStorage.getItem('app_custom_api_key') || '';
        setCustomApiKeyInternal(activeCustomKey);
        if (pid && activeCustomKey) {
            loadedProviderKeys[pid] = activeCustomKey;
        }

        // 6. Load STT Config
        const savedSttProvider = localStorage.getItem('app_stt_provider') as SttProvider | null;
        const activeSttProvider = savedSttProvider && ['groq', 'openai', 'gemini', 'custom'].includes(savedSttProvider) ? savedSttProvider : 'groq';
        setSttProviderInternal(activeSttProvider);

        const activeSttKey = loadedSttKeys[activeSttProvider] || localStorage.getItem(`app_stt_provider_key_${activeSttProvider}`) || legacySttKey || '';
        setSttApiKeyInternal(activeSttKey);
        if (activeSttKey) {
            loadedSttKeys[activeSttProvider] = activeSttKey;
        }

        const savedSttEndpoint = localStorage.getItem('app_stt_endpoint');
        if (savedSttEndpoint) {
            setSttEndpointInternal(savedSttEndpoint);
        }
        const savedSttModel = localStorage.getItem('app_stt_model');
        if (savedSttModel) {
            setSttModelInternal(savedSttModel);
        }

        setProviderKeys(loadedProviderKeys);
        setSttProviderKeys(loadedSttKeys);

        // 7. Load Language & Audience
        const savedLang = localStorage.getItem('app_target_language') as TargetLanguage | null;
        if (savedLang === 'english' || savedLang === 'hinglish') {
            setLanguageInternal(savedLang);
        }

        const savedMode = localStorage.getItem('app_audience_mode') as AudienceMode | null;
        if (savedMode === 'doctor' || savedMode === 'simplified') {
            setAudienceModeInternal(savedMode);
        }

        const savedCompress = localStorage.getItem('app_compress_images_for_ai');
        if (savedCompress !== null) {
            setCompressImagesForAiInternal(savedCompress === 'true');
        }

        const savedTargetKb = localStorage.getItem('app_target_image_kb');
        if (savedTargetKb) {
            const parsed = parseInt(savedTargetKb, 10);
            if (!isNaN(parsed) && parsed >= 20 && parsed <= 300) {
                setTargetImageKbInternal(parsed);
            }
        }

        const savedMerge = localStorage.getItem('app_merge_images_into_single');
        if (savedMerge !== null) {
            setMergeImagesIntoSingleInternal(savedMerge === 'true');
        }

        const savedMergeTargetKb = localStorage.getItem('app_merge_target_kb');
        if (savedMergeTargetKb) {
            const parsed = parseInt(savedMergeTargetKb, 10);
            if (!isNaN(parsed) && parsed >= 50 && parsed <= 500) {
                setMergeTargetKbInternal(parsed);
            }
        }

        // Feature flags & Reasoning toggle (default true)
        const savedStreaming = localStorage.getItem('app_enable_streaming_output');
        if (savedStreaming !== null) {
            setEnableStreamingOutputInternal(savedStreaming === 'true');
        }
        const savedReasoning = localStorage.getItem('app_enable_reasoning');
        if (savedReasoning !== null) {
            setEnableReasoningInternal(savedReasoning === 'true');
            setEnableLiveThinkingInternal(savedReasoning === 'true');
        } else {
            const savedThinking = localStorage.getItem('app_enable_live_thinking');
            if (savedThinking !== null) {
                setEnableReasoningInternal(savedThinking === 'true');
                setEnableLiveThinkingInternal(savedThinking === 'true');
            }
        }

        // 8. Load saved models per provider
        try {
            const rawSavedModels = localStorage.getItem('app_saved_models_by_provider');
            if (rawSavedModels) {
                const parsed = JSON.parse(rawSavedModels);
                setSavedModelsByProvider((prev) => ({
                    ...prev,
                    ...parsed,
                }));
            }
        } catch {
            // Keep default initial models
        }
    }, []);

    const setAiProvider = (provider: AiProvider) => {
        localStorage.setItem('app_ai_provider', provider);
        setAiProviderInternal(provider);
    };

    const setGeminiApiKey = (key: string) => {
        localStorage.setItem('gemini_api_key', key);
        localStorage.setItem('app_provider_key_gemini', key);
        setGeminiApiKeyInternal(key);
        setProviderKeys((prev) => {
            const updated = { ...prev, gemini: key };
            localStorage.setItem('app_provider_keys', JSON.stringify(updated));
            return updated;
        });
    };

    // Alias for backwards compatibility
    const setApiKey = (key: string) => {
        setGeminiApiKey(key);
    };

    const setGeminiModel = (model: string) => {
        const sanitized = model.trim() || DEFAULT_GEMINI_MODEL;
        localStorage.setItem('app_gemini_model', sanitized);
        setGeminiModelInternal(sanitized);
    };

    const setCustomEndpoint = (endpoint: string, autoLoadKey: boolean = true) => {
        localStorage.setItem('app_custom_endpoint', endpoint);
        setCustomEndpointInternal(endpoint);

        if (autoLoadKey) {
            const pid = detectProviderIdFromEndpoint(endpoint, customModel);
            const savedKey = providerKeys[pid] || localStorage.getItem(`app_provider_key_${pid}`) || '';
            if (savedKey) {
                setCustomApiKeyInternal(savedKey);
                localStorage.setItem('app_custom_api_key', savedKey);
            }
        }
    };

    const setCustomApiKey = (key: string, providerId?: string) => {
        const cleanKey = key.trim();
        localStorage.setItem('app_custom_api_key', cleanKey);
        setCustomApiKeyInternal(cleanKey);

        const targetPid = providerId || detectProviderIdFromEndpoint(customEndpoint, customModel);
        if (targetPid) {
            localStorage.setItem(`app_provider_key_${targetPid}`, cleanKey);
            setProviderKeys((prev) => {
                const updated = { ...prev, [targetPid]: cleanKey };
                localStorage.setItem('app_provider_keys', JSON.stringify(updated));
                return updated;
            });
        }
    };

    const setProviderKey = (providerId: string, key: string) => {
        const cleanKey = key.trim();
        localStorage.setItem(`app_provider_key_${providerId}`, cleanKey);
        setProviderKeys((prev) => {
            const updated = { ...prev, [providerId]: cleanKey };
            localStorage.setItem('app_provider_keys', JSON.stringify(updated));
            return updated;
        });
        if (providerId === 'gemini') {
            setGeminiApiKeyInternal(cleanKey);
            localStorage.setItem('gemini_api_key', cleanKey);
        } else {
            const currentActivePid = detectProviderIdFromEndpoint(customEndpoint, customModel);
            if (providerId === currentActivePid) {
                setCustomApiKeyInternal(cleanKey);
                localStorage.setItem('app_custom_api_key', cleanKey);
            }
        }
    };

    const getSavedKeyForProvider = (providerId: string): string => {
        if (providerId === 'gemini') {
            return geminiApiKey || providerKeys['gemini'] || localStorage.getItem('gemini_api_key') || localStorage.getItem('app_provider_key_gemini') || '';
        }
        return providerKeys[providerId] || localStorage.getItem(`app_provider_key_${providerId}`) || '';
    };

    const saveAllProviderKeys = (keys: Record<string, string>, currentPid?: string) => {
        setProviderKeys((prev) => {
            const updated = { ...prev, ...keys };
            localStorage.setItem('app_provider_keys', JSON.stringify(updated));
            return updated;
        });
        for (const [pid, key] of Object.entries(keys)) {
            if (key !== undefined) {
                const cleanKey = (key || '').trim();
                localStorage.setItem(`app_provider_key_${pid}`, cleanKey);
            }
        }
        if (keys['gemini'] !== undefined) {
            const gemKey = (keys['gemini'] || '').trim();
            setGeminiApiKeyInternal(gemKey);
            localStorage.setItem('gemini_api_key', gemKey);
        }
        const activePid = currentPid || detectProviderIdFromEndpoint(customEndpoint, customModel);
        if (keys[activePid] !== undefined) {
            const custKey = (keys[activePid] || '').trim();
            setCustomApiKeyInternal(custKey);
            localStorage.setItem('app_custom_api_key', custKey);
        }
    };

    const switchToProviderPreset = (presetId: string) => {
        const preset = KNOWN_AI_PROVIDERS.find((p) => p.id === presetId);
        if (!preset) {
            return { name: presetId, endpoint: customEndpoint, model: customModel, key: customApiKey };
        }

        if (preset.id === 'gemini') {
            setAiProvider('gemini');
            const savedKey = getSavedKeyForProvider('gemini');
            return {
                name: preset.name,
                endpoint: preset.endpoint,
                model: geminiModel || preset.defaultModel,
                key: savedKey,
            };
        }

        // Custom / Third-party LLM
        setAiProvider('custom');
        setCustomEndpoint(preset.endpoint, false);
        setCustomModel(preset.defaultModel);

        const savedKey = getSavedKeyForProvider(preset.id);
        setCustomApiKey(savedKey, preset.id);

        return {
            name: preset.name,
            endpoint: preset.endpoint,
            model: preset.defaultModel,
            key: savedKey,
        };
    };

    const setCustomModel = (model: string) => {
        localStorage.setItem('app_custom_model', model);
        setCustomModelInternal(model);
    };

    const setSttProvider = (provider: SttProvider, autoLoadKey: boolean = true) => {
        localStorage.setItem('app_stt_provider', provider);
        setSttProviderInternal(provider);

        if (autoLoadKey) {
            const savedKey = provider === 'gemini' 
                ? (geminiApiKey || providerKeys['gemini'] || '')
                : (sttProviderKeys[provider] || localStorage.getItem(`app_stt_provider_key_${provider}`) || '');
            if (savedKey) {
                setSttApiKeyInternal(savedKey);
                localStorage.setItem('app_stt_api_key', savedKey);
            }
        }
    };

    const setSttApiKey = (key: string, providerId?: string) => {
        localStorage.setItem('app_stt_api_key', key);
        setSttApiKeyInternal(key);

        const targetPid = providerId || sttProvider;
        if (targetPid) {
            localStorage.setItem(`app_stt_provider_key_${targetPid}`, key);
            setSttProviderKeys((prev) => {
                const updated = { ...prev, [targetPid]: key };
                localStorage.setItem('app_stt_provider_keys', JSON.stringify(updated));
                return updated;
            });
        }
    };

    const setSttProviderKey = (providerId: string, key: string) => {
        localStorage.setItem(`app_stt_provider_key_${providerId}`, key);
        setSttProviderKeys((prev) => {
            const updated = { ...prev, [providerId]: key };
            localStorage.setItem('app_stt_provider_keys', JSON.stringify(updated));
            return updated;
        });
        if (providerId === sttProvider) {
            setSttApiKeyInternal(key);
            localStorage.setItem('app_stt_api_key', key);
        }
    };

    const getSavedSttKeyForProvider = (providerId: string): string => {
        if (providerId === 'gemini') {
            return geminiApiKey || providerKeys['gemini'] || '';
        }
        return sttProviderKeys[providerId] || localStorage.getItem(`app_stt_provider_key_${providerId}`) || '';
    };

    const saveAllSttProviderKeys = (keys: Record<string, string>) => {
        setSttProviderKeys(keys);
        localStorage.setItem('app_stt_provider_keys', JSON.stringify(keys));
        for (const [pid, key] of Object.entries(keys)) {
            if (key !== undefined) localStorage.setItem(`app_stt_provider_key_${pid}`, key);
        }
        if (keys[sttProvider] !== undefined) {
            setSttApiKeyInternal(keys[sttProvider]);
            localStorage.setItem('app_stt_api_key', keys[sttProvider]);
        }
    };

    const setSttEndpoint = (endpoint: string) => {
        localStorage.setItem('app_stt_endpoint', endpoint);
        setSttEndpointInternal(endpoint);
    };

    const setSttModel = (model: string) => {
        const sanitized = model.trim() || DEFAULT_STT_MODEL;
        localStorage.setItem('app_stt_model', sanitized);
        setSttModelInternal(sanitized);
    };

    const setLanguage = (lang: TargetLanguage) => {
        localStorage.setItem('app_target_language', lang);
        setLanguageInternal(lang);
    };

    const setAudienceMode = (mode: AudienceMode) => {
        localStorage.setItem('app_audience_mode', mode);
        setAudienceModeInternal(mode);
    };

    const setCompressImagesForAi = (enabled: boolean) => {
        localStorage.setItem('app_compress_images_for_ai', String(enabled));
        setCompressImagesForAiInternal(enabled);
    };

    const setTargetImageKb = (kb: number) => {
        const sanitized = Math.max(20, Math.min(300, kb));
        localStorage.setItem('app_target_image_kb', String(sanitized));
        setTargetImageKbInternal(sanitized);
    };

    const setMergeImagesIntoSingle = (enabled: boolean) => {
        localStorage.setItem('app_merge_images_into_single', String(enabled));
        setMergeImagesIntoSingleInternal(enabled);
    };

    const setMergeTargetKb = (kb: number) => {
        const sanitized = Math.max(50, Math.min(500, kb));
        localStorage.setItem('app_merge_target_kb', String(sanitized));
        setMergeTargetKbInternal(sanitized);
    };

    const setEnableStreamingOutput = (enabled: boolean) => {
        localStorage.setItem('app_enable_streaming_output', String(enabled));
        setEnableStreamingOutputInternal(enabled);
    };

    const setEnableReasoning = (enabled: boolean) => {
        localStorage.setItem('app_enable_reasoning', String(enabled));
        localStorage.setItem('app_enable_live_thinking', String(enabled));
        setEnableReasoningInternal(enabled);
        setEnableLiveThinkingInternal(enabled);
    };

    const setEnableLiveThinking = (enabled: boolean) => {
        setEnableReasoning(enabled);
    };

    const addSavedModel = (providerId: string, model: string) => {
        const clean = model.trim();
        if (!clean) return;
        setSavedModelsByProvider((prev) => {
            const currentList = prev[providerId] || INITIAL_SAVED_MODELS[providerId] || [];
            const updated = [clean, ...currentList.filter((m) => m.toLowerCase() !== clean.toLowerCase())].slice(0, 20);
            const next = { ...prev, [providerId]: updated };
            try {
                localStorage.setItem('app_saved_models_by_provider', JSON.stringify(next));
            } catch {
                // Ignore storage limits
            }
            return next;
        });
    };

    const removeSavedModel = (providerId: string, model: string) => {
        const clean = model.trim().toLowerCase();
        setSavedModelsByProvider((prev) => {
            const currentList = prev[providerId] || INITIAL_SAVED_MODELS[providerId] || [];
            const updated = currentList.filter((m) => m.toLowerCase() !== clean);
            const next = { ...prev, [providerId]: updated };
            try {
                localStorage.setItem('app_saved_models_by_provider', JSON.stringify(next));
            } catch {
                // Ignore storage limits
            }
            return next;
        });
    };

    const clearSavedModels = (providerId: string) => {
        setSavedModelsByProvider((prev) => {
            const next = { ...prev, [providerId]: [] };
            try {
                localStorage.setItem('app_saved_models_by_provider', JSON.stringify(next));
            } catch {
                // Ignore storage limits
            }
            return next;
        });
    };

    const getSavedModelsForProvider = (providerId: string): string[] => {
        if (savedModelsByProvider[providerId] && savedModelsByProvider[providerId].length > 0) {
            return savedModelsByProvider[providerId];
        }
        return INITIAL_SAVED_MODELS[providerId] || [];
    };

    // Derived values
    const isConfigured =
        aiProvider === 'gemini'
            ? (!!geminiApiKey || hasServerKey)
            : !!customEndpoint.trim() && !!customModel.trim();

    const activeModel =
        aiProvider === 'gemini'
            ? geminiModel || DEFAULT_GEMINI_MODEL
            : customModel || 'Custom Model';

    const sttConfig: SttConfig = useMemo(() => ({
        provider: sttProvider,
        apiKey: sttApiKey,
        endpoint: sttEndpoint,
        model: sttModel || DEFAULT_STT_MODEL,
    }), [sttProvider, sttApiKey, sttEndpoint, sttModel]);

    const aiConfig: AiConfig = useMemo(() => ({
        provider: aiProvider,
        apiKey: geminiApiKey,
        geminiApiKey,
        geminiModel: geminiModel || DEFAULT_GEMINI_MODEL,
        customEndpoint,
        customApiKey,
        customModel,
        enableReasoning,
        thinkingBudget: enableReasoning ? 2048 : 0,
        sttConfig,
    }), [aiProvider, geminiApiKey, geminiModel, customEndpoint, customApiKey, customModel, enableReasoning, sttConfig]);

    return (
        <SettingsContext.Provider
            value={{
                aiProvider,
                setAiProvider,
                apiKey: geminiApiKey,
                setApiKey,
                geminiApiKey,
                setGeminiApiKey,
                geminiModel,
                setGeminiModel,
                customEndpoint,
                setCustomEndpoint,
                customApiKey,
                setCustomApiKey,
                customModel,
                setCustomModel,
                providerKeys,
                setProviderKey,
                getSavedKeyForProvider,
                saveAllProviderKeys,
                switchToProviderPreset,
                sttProvider,
                setSttProvider,
                sttApiKey,
                setSttApiKey,
                sttEndpoint,
                setSttEndpoint,
                sttModel,
                setSttModel,
                sttConfig,
                sttProviderKeys,
                setSttProviderKey,
                getSavedSttKeyForProvider,
                saveAllSttProviderKeys,
                savedModelsByProvider,
                addSavedModel,
                removeSavedModel,
                clearSavedModels,
                getSavedModelsForProvider,
                activeModel,
                aiConfig,
                isConfigured,
                hasServerKey,
                language,
                setLanguage,
                audienceMode,
                setAudienceMode,
                compressImagesForAi,
                setCompressImagesForAi,
                targetImageKb,
                setTargetImageKb,
                mergeImagesIntoSingle,
                setMergeImagesIntoSingle,
                mergeTargetKb,
                setMergeTargetKb,
                enableStreamingOutput,
                setEnableStreamingOutput,
                enableLiveThinking,
                setEnableLiveThinking,
                enableReasoning,
                setEnableReasoning,
            }}
        >
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}

