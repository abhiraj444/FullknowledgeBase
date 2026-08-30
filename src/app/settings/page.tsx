'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  useSettings,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_STT_MODEL,
  KNOWN_AI_PROVIDERS,
  detectProviderIdFromEndpoint,
  type ProviderPresetInfo,
} from '@/context/SettingsContext';
import { ClientSideAiService } from '@/lib/ClientSideAiService';
import type { AiProvider, AiConfig, SttProvider } from '@/types';
import {
  ArrowLeft,
  Save,
  Sparkles,
  Cpu,
  Server,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  RotateCcw,
  Activity,
  Sliders,
  Mic,
  Radio,
  Check,
  BrainCircuit,
  Key,
  ShieldCheck,
  Trash2,
  Layers,
  HelpCircle,
  X,
  Plus,
  History,
  Tag,
} from 'lucide-react';

import { ModeLanguageSelector } from '@/components/ModeLanguageSelector';

const GEMINI_MODEL_PRESETS = [
  {
    id: 'gemini-3.7-flash',
    label: 'gemini-3.7-flash',
    tag: 'Flagship (Hybrid Thinking)',
    desc: 'Cutting-edge clinical reasoning with dynamic thinking budget controls and multi-step intelligence.',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'gemini-2.5-pro',
    tag: 'Deep Clinical Reasoning',
    desc: 'Complex clinical cases, multi-step pathophysiology, differential diagnoses.',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'gemini-2.5-flash',
    tag: 'Fast & Efficient',
    desc: 'Ultra-fast multimodal clinical reasoning with native reasoning capability.',
  },
];

interface ModelPillBoxProps {
  providerId: string;
  currentModel: string;
  onSelectModel: (model: string) => void;
  savedModels: string[];
  onAddModel: (providerId: string, model: string) => void;
  onRemoveModel: (providerId: string, model: string) => void;
  onClearModels: (providerId: string) => void;
  title?: string;
}

function ModelPillBox({
  providerId,
  currentModel,
  onSelectModel,
  savedModels,
  onAddModel,
  onRemoveModel,
  onClearModels,
  title = 'Previously Tried & Saved Models',
}: ModelPillBoxProps) {
  const cleanCurrent = (currentModel || '').trim();
  const isCurrentInList = savedModels.some((m) => m.toLowerCase() === cleanCurrent.toLowerCase());
  const canAdd = cleanCurrent.length > 0 && !isCurrentInList;

  return (
    <div className="pt-3 pb-1 space-y-2 border-t border-border/60">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
          <History className="h-3.5 w-3.5 text-primary" />
          <span>{title}</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-mono font-semibold">
            {savedModels.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canAdd && (
            <button
              type="button"
              onClick={() => onAddModel(providerId, cleanCurrent)}
              className="text-[10px] text-primary hover:underline flex items-center gap-1 font-semibold bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded-md border border-primary/30 transition-colors"
            >
              <Plus className="h-3 w-3" />
              <span>Save &ldquo;{cleanCurrent}&rdquo;</span>
            </button>
          )}
          {savedModels.length > 0 && (
            <button
              type="button"
              onClick={() => onClearModels(providerId)}
              className="text-[10px] text-muted-foreground hover:text-red-500 transition-colors flex items-center gap-0.5"
              title="Clear all saved pills for this provider"
            >
              <Trash2 className="h-2.5 w-2.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {savedModels.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">
          No saved models yet. Type any custom model name above or click Save to keep it in your pill box.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {savedModels.map((m) => {
            const isSelected = cleanCurrent.toLowerCase() === m.trim().toLowerCase();
            return (
              <div
                key={m}
                className={`group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-all ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-2xs font-semibold ring-2 ring-primary/20'
                    : 'bg-muted/70 hover:bg-muted text-foreground border-border/80 hover:border-primary/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectModel(m)}
                  className="text-left flex items-center gap-1"
                  title={`Select model "${m}"`}
                >
                  {isSelected && <Check className="h-3 w-3 shrink-0" />}
                  <span>{m}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveModel(providerId, m);
                  }}
                  className={`rounded-full p-0.5 transition-colors ${
                    isSelected
                      ? 'hover:bg-primary-foreground/20 text-primary-foreground/80 hover:text-primary-foreground'
                      : 'hover:bg-red-500/20 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 opacity-60 group-hover:opacity-100'
                  }`}
                  title={`Remove "${m}" from saved pills`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        Click any pill to select. Models you use or test are saved locally so you don&apos;t have to re-enter them.
      </p>
    </div>
  );
}

const STT_PROVIDER_PRESETS: Array<{
  id: SttProvider;
  name: string;
  endpoint: string;
  defaultModel: string;
  desc: string;
  tag?: string;
}> = [
  {
    id: 'groq',
    name: 'Groq Cloud (Whisper Turbo)',
    endpoint: 'https://api.groq.com/openai/v1',
    defaultModel: 'whisper-large-v3-turbo',
    desc: 'Lightning fast (~200ms) Whisper Large V3 Turbo. Exceptional clinical transcription accuracy.',
    tag: 'Recommended',
  },
  {
    id: 'openai',
    name: 'OpenAI Whisper',
    endpoint: 'https://api.openai.com/v1',
    defaultModel: 'whisper-1',
    desc: 'Official OpenAI speech-to-text API model (whisper-1).',
  },
  {
    id: 'custom',
    name: 'Custom OpenAI-Compatible Audio',
    endpoint: 'https://api.groq.com/openai/v1',
    defaultModel: 'whisper-large-v3-turbo',
    desc: 'Any self-hosted or cloud OpenAI-compatible /audio/transcriptions server.',
  },
  {
    id: 'gemini',
    name: 'Google Gemini Audio Fallback',
    endpoint: '',
    defaultModel: 'gemini-2.5-flash',
    desc: 'Direct multimodal audio transcription using your Gemini API key.',
  },
];

const STT_MODEL_PRESETS = [
  'whisper-large-v3-turbo',
  'whisper-large-v3',
  'distil-whisper-large-v3-en',
  'whisper-1',
];

export default function SettingsPage() {
  const router = useRouter();
  const { toast } = useToast();

  const {
    aiProvider,
    setAiProvider,
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
    saveAllProviderKeys,
    getSavedKeyForProvider,
    sttProvider,
    setSttProvider,
    sttApiKey,
    setSttApiKey,
    sttEndpoint,
    setSttEndpoint,
    sttModel,
    setSttModel,
    sttProviderKeys,
    setSttProviderKey,
    saveAllSttProviderKeys,
    getSavedSttKeyForProvider,
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
    savedModelsByProvider,
    addSavedModel,
    removeSavedModel,
    clearSavedModels,
    getSavedModelsForProvider,
  } = useSettings();

  // Local form state
  const [provider, setLocalProvider] = useState<AiProvider>(aiProvider);
  const [localGeminiKey, setLocalGeminiKey] = useState(geminiApiKey);
  const [localGeminiModel, setLocalGeminiModel] = useState(geminiModel || DEFAULT_GEMINI_MODEL);

  const [localCustomEndpoint, setLocalCustomEndpoint] = useState(customEndpoint);
  const [localCustomKey, setLocalCustomKey] = useState(customApiKey);
  const [localCustomModel, setLocalCustomModel] = useState(customModel || 'gpt-4o');

  // Multi-provider key vault local copy
  const [vaultKeys, setVaultKeys] = useState<Record<string, string>>(providerKeys || {});
  const [sttVaultKeys, setSttVaultKeys] = useState<Record<string, string>>(sttProviderKeys || {});

  // STT (Speech-to-Text) Local State
  const [localSttProvider, setLocalSttProvider] = useState<SttProvider>(sttProvider || 'groq');
  const [localSttApiKey, setLocalSttApiKey] = useState(sttApiKey || '');
  const [localSttEndpoint, setLocalSttEndpoint] = useState(sttEndpoint || 'https://api.groq.com/openai/v1');
  const [localSttModel, setLocalSttModel] = useState(sttModel || DEFAULT_STT_MODEL);
  const [showSttKey, setShowSttKey] = useState(false);

  const [localCompressImages, setLocalCompressImages] = useState<boolean>(compressImagesForAi);
  const [localTargetKb, setLocalTargetKb] = useState<number>(targetImageKb || 50);
  const [localMergeImages, setLocalMergeImages] = useState<boolean>(mergeImagesIntoSingle);
  const [localMergeTargetKb, setLocalMergeTargetKb] = useState<number>(mergeTargetKb || 150);

  // Feature Flags Local State
  const [localStreamingOutput, setLocalStreamingOutput] = useState<boolean>(enableStreamingOutput);
  const [localLiveThinking, setLocalLiveThinking] = useState<boolean>(enableLiveThinking);

  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showCustomKey, setShowCustomKey] = useState(false);
  const [visibleVaultKeys, setVisibleVaultKeys] = useState<Record<string, boolean>>({});

  // Connection Test state for LLM
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    modelUsed: string;
    latencyMs?: number;
  } | null>(null);

  // Connection Test state for STT Whisper
  const [isTestingStt, setIsTestingStt] = useState(false);
  const [sttTestResult, setSttTestResult] = useState<{
    success: boolean;
    message: string;
    modelUsed: string;
    latencyMs?: number;
  } | null>(null);

  const isInitializedRef = useRef(false);

  // Synchronize state on initial load only
  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      setLocalProvider(aiProvider);
      setLocalGeminiKey(geminiApiKey);
      setLocalGeminiModel(geminiModel || DEFAULT_GEMINI_MODEL);
      setLocalCustomEndpoint(customEndpoint);
      setLocalCustomKey(customApiKey);
      setLocalCustomModel(customModel || 'gpt-4o');
      setVaultKeys((prev) => ({ ...prev, ...providerKeys }));
      setSttVaultKeys((prev) => ({ ...prev, ...sttProviderKeys }));
      setLocalSttProvider(sttProvider);
      setLocalSttApiKey(sttApiKey);
      setLocalSttEndpoint(sttEndpoint);
      setLocalSttModel(sttModel || DEFAULT_STT_MODEL);
    }
  }, [
    aiProvider,
    geminiApiKey,
    geminiModel,
    customEndpoint,
    customApiKey,
    customModel,
    providerKeys,
    sttProviderKeys,
    sttProvider,
    sttApiKey,
    sttEndpoint,
    sttModel,
  ]);

  // Determine current active custom provider ID
  const activeCustomProviderId = detectProviderIdFromEndpoint(localCustomEndpoint, localCustomModel);

  // When user switches preset in Custom LLM tab
  const handleApplyPreset = (preset: ProviderPresetInfo) => {
    // 1. Save currently entered key to previous provider slot if present
    const oldPid = activeCustomProviderId;
    if (localCustomKey.trim() && oldPid && oldPid !== preset.id) {
      const cleanKey = localCustomKey.trim();
      setVaultKeys((prev) => {
        const updated = { ...prev, [oldPid]: cleanKey };
        try {
          localStorage.setItem('app_provider_keys', JSON.stringify(updated));
          localStorage.setItem(`app_provider_key_${oldPid}`, cleanKey);
        } catch {}
        return updated;
      });
    }

    // 2. Switch to new preset configuration
    setLocalCustomEndpoint(preset.endpoint);
    setLocalCustomModel(preset.defaultModel);
    setTestResult(null);

    // 3. Retrieve and populate saved key for the newly selected preset
    const targetPid = preset.id;
    const savedKeyForNew =
      vaultKeys[targetPid] ||
      (typeof window !== 'undefined' ? localStorage.getItem(`app_provider_key_${targetPid}`) : '') ||
      getSavedKeyForProvider(targetPid) ||
      '';
    setLocalCustomKey(savedKeyForNew);

    if (savedKeyForNew) {
      toast({
        title: `${preset.name} Selected`,
        description: `Loaded your saved API key for ${preset.name}. Model set to ${preset.defaultModel}.`,
      });
    } else {
      toast({
        title: `${preset.name} Selected`,
        description: `Endpoint set to ${preset.endpoint}. Enter your API key below—it will be saved locally automatically.`,
      });
    }
  };

  // Switch active provider directly from Vault Card
  const handleActivateProviderFromVault = (preset: ProviderPresetInfo) => {
    if (preset.id === 'gemini') {
      if (localCustomKey.trim() && activeCustomProviderId) {
        const cleanKey = localCustomKey.trim();
        setVaultKeys((prev) => {
          const updated = { ...prev, [activeCustomProviderId]: cleanKey };
          try {
            localStorage.setItem('app_provider_keys', JSON.stringify(updated));
            localStorage.setItem(`app_provider_key_${activeCustomProviderId}`, cleanKey);
          } catch {}
          return updated;
        });
      }

      setLocalProvider('gemini');
      const savedKey = vaultKeys['gemini'] || localGeminiKey || getSavedKeyForProvider('gemini') || '';
      setLocalGeminiKey(savedKey);
      setTestResult(null);
      toast({
        title: 'Switched to Google Gemini',
        description: savedKey ? 'Loaded your saved Gemini API key.' : 'Please enter your Gemini key.',
      });
      return;
    }

    // If currently on custom, save the current key for the previous provider before switching
    if (localCustomKey.trim() && activeCustomProviderId && activeCustomProviderId !== preset.id) {
      const cleanKey = localCustomKey.trim();
      setVaultKeys((prev) => {
        const updated = { ...prev, [activeCustomProviderId]: cleanKey };
        try {
          localStorage.setItem('app_provider_keys', JSON.stringify(updated));
          localStorage.setItem(`app_provider_key_${activeCustomProviderId}`, cleanKey);
        } catch {}
        return updated;
      });
    }

    // Switch to Custom Tab & Preset
    setLocalProvider('custom');
    setLocalCustomEndpoint(preset.endpoint);
    setLocalCustomModel(preset.defaultModel);
    const savedKey =
      vaultKeys[preset.id] ||
      (typeof window !== 'undefined' ? localStorage.getItem(`app_provider_key_${preset.id}`) : '') ||
      getSavedKeyForProvider(preset.id) ||
      '';
    setLocalCustomKey(savedKey);
    setTestResult(null);
    toast({
      title: `Switched to ${preset.name}`,
      description: savedKey ? `Loaded your saved API key for ${preset.name}.` : `Enter your ${preset.name} key.`,
    });
  };

  // Update a single provider key in the vault
  const handleUpdateVaultKey = (pid: string, newKey: string) => {
    const trimmed = newKey.trim();
    setVaultKeys((prev) => {
      const updated = { ...prev, [pid]: trimmed };
      localStorage.setItem('app_provider_keys', JSON.stringify(updated));
      if (trimmed) {
        localStorage.setItem(`app_provider_key_${pid}`, trimmed);
      } else {
        localStorage.removeItem(`app_provider_key_${pid}`);
      }
      return updated;
    });
    setProviderKey(pid, trimmed);

    // Also sync with active inputs if currently using this provider
    if (pid === 'gemini') {
      setLocalGeminiKey(trimmed);
    }
    if (pid === activeCustomProviderId) {
      setLocalCustomKey(trimmed);
    }
  };

  // Clear a specific provider key
  const handleClearVaultKey = (pid: string, providerName: string) => {
    handleUpdateVaultKey(pid, '');
    toast({
      title: 'Key Removed',
      description: `Removed saved API key for ${providerName}.`,
    });
  };

  const handleApplySttPreset = (preset: (typeof STT_PROVIDER_PRESETS)[0]) => {
    // 1. Save previous STT key
    if (localSttApiKey.trim() && localSttProvider) {
      setSttVaultKeys((prev) => {
        const updated = { ...prev, [localSttProvider]: localSttApiKey.trim() };
        localStorage.setItem('app_stt_provider_keys', JSON.stringify(updated));
        localStorage.setItem(`app_stt_provider_key_${localSttProvider}`, localSttApiKey.trim());
        return updated;
      });
    }

    // 2. Set new preset
    setLocalSttProvider(preset.id);
    if (preset.endpoint) {
      setLocalSttEndpoint(preset.endpoint);
    }
    setLocalSttModel(preset.defaultModel);
    setSttTestResult(null);

    // 3. Load saved STT key for this provider
    const savedStt = preset.id === 'gemini' 
      ? (localGeminiKey || vaultKeys['gemini'] || '')
      : (sttVaultKeys[preset.id] || getSavedSttKeyForProvider(preset.id) || '');
    
    if (preset.id !== 'gemini') {
      setLocalSttApiKey(savedStt);
    }

    toast({
      title: `${preset.name} Selected`,
      description: savedStt ? `Loaded saved STT key for ${preset.name}.` : `STT set to ${preset.name}.`,
    });
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    const testConfig: AiConfig = {
      provider,
      apiKey: provider === 'gemini' ? localGeminiKey : localCustomKey,
      geminiApiKey: localGeminiKey,
      geminiModel: localGeminiModel.trim() || DEFAULT_GEMINI_MODEL,
      customEndpoint: localCustomEndpoint.trim(),
      customApiKey: localCustomKey.trim(),
      customModel: localCustomModel.trim(),
    };

    try {
      const res = await ClientSideAiService.testConnection(testConfig);
      setTestResult(res);
      if (res.success) {
        if (provider === 'gemini' && localGeminiModel.trim()) {
          addSavedModel('gemini', localGeminiModel.trim());
        } else if (provider === 'custom' && localCustomModel.trim()) {
          addSavedModel(activeCustomProviderId, localCustomModel.trim());
          addSavedModel('custom', localCustomModel.trim());
        }
        toast({
          title: 'Connection Successful',
          description: `AI model (${res.modelUsed}) responded in ${res.latencyMs}ms.`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Connection Failed',
          description: res.message,
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Failed to reach AI service.',
        modelUsed: provider === 'gemini' ? localGeminiModel : localCustomModel,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestStt = async () => {
    setIsTestingStt(true);
    setSttTestResult(null);
    const startTime = Date.now();

    try {
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isTest: true,
          sttConfig: {
            provider: localSttProvider,
            apiKey: localSttApiKey.trim(),
            endpoint: localSttEndpoint.trim(),
            model: localSttModel.trim() || DEFAULT_STT_MODEL,
          },
          config: {
            geminiApiKey: localGeminiKey.trim(),
          },
        }),
      });

      const data = await res.json();
      const latencyMs = Date.now() - startTime;

      if (res.ok && (data.success || data.ok)) {
        if (localSttModel.trim()) {
          addSavedModel(`stt_${localSttProvider}`, localSttModel.trim());
        }
        setSttTestResult({
          success: true,
          message: data.message || `STT Whisper endpoint is active and authenticated (${latencyMs}ms). Provider: ${data.provider || localSttProvider}.`,
          modelUsed: data.model || localSttModel || DEFAULT_STT_MODEL,
          latencyMs,
        });
        toast({
          title: 'STT Whisper Verified',
          description: `Speech-to-Text connection verified in ${latencyMs}ms (${localSttProvider}).`,
        });
      } else {
        throw new Error(data.error || 'Failed to verify speech-to-text endpoint.');
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      setSttTestResult({
        success: false,
        message: err?.message || 'STT Connection test failed. Please verify your STT API key and endpoint URL.',
        modelUsed: localSttModel || DEFAULT_STT_MODEL,
        latencyMs,
      });
      toast({
        variant: 'destructive',
        title: 'STT Verification Failed',
        description: err?.message || 'Could not verify STT endpoint.',
      });
    } finally {
      setIsTestingStt(false);
    }
  };

  const handleSave = () => {
    const targetCustomPid = detectProviderIdFromEndpoint(localCustomEndpoint.trim(), localCustomModel.trim());

    // 1. Build and save entire complete key vault first to preserve all providers
    const completeVault: Record<string, string> = {
      ...providerKeys,
      ...vaultKeys,
    };
    if (localGeminiKey.trim()) {
      completeVault['gemini'] = localGeminiKey.trim();
    }
    if (targetCustomPid && localCustomKey.trim()) {
      completeVault[targetCustomPid] = localCustomKey.trim();
    }
    saveAllProviderKeys(completeVault, targetCustomPid);

    // 2. Save provider and main keys
    setAiProvider(provider);
    setGeminiApiKey(localGeminiKey.trim());
    setGeminiModel(localGeminiModel.trim() || DEFAULT_GEMINI_MODEL);

    setCustomEndpoint(localCustomEndpoint.trim(), false);
    setCustomModel(localCustomModel.trim() || 'gpt-4o');
    setCustomApiKey(localCustomKey.trim(), targetCustomPid);

    // 3. Save STT settings and vault
    setSttProvider(localSttProvider, false);
    setSttApiKey(localSttApiKey.trim(), localSttProvider);
    setSttEndpoint(localSttEndpoint.trim());
    setSttModel(localSttModel.trim() || DEFAULT_STT_MODEL);

    const completeSttVault = {
      ...sttVaultKeys,
      [localSttProvider]: localSttApiKey.trim(),
    };
    saveAllSttProviderKeys(completeSttVault);

    // 4. Save active models to local pill boxes
    if (localGeminiModel.trim()) {
      addSavedModel('gemini', localGeminiModel.trim());
    }
    if (localCustomModel.trim()) {
      addSavedModel(activeCustomProviderId, localCustomModel.trim());
      addSavedModel('custom', localCustomModel.trim());
    }
    if (localSttModel.trim()) {
      addSavedModel(localSttProvider, localSttModel.trim());
      addSavedModel('stt', localSttModel.trim());
    }

    // 5. Token optimization and flags
    setCompressImagesForAi(localCompressImages);
    setTargetImageKb(localTargetKb);
    setMergeImagesIntoSingle(localMergeImages);
    setMergeTargetKb(localMergeTargetKb);

    setEnableStreamingOutput(localStreamingOutput);
    setEnableLiveThinking(localLiveThinking);

    toast({
      title: 'Settings & Keys Saved',
      description: `Active AI: ${provider === 'gemini' ? 'Google Gemini' : 'Custom LLM'} (${
        provider === 'gemini' ? localGeminiModel || DEFAULT_GEMINI_MODEL : localCustomModel
      }) • All provider API keys stored securely in local browser storage.`,
    });
    router.back();
  };

  const handleResetDefaults = () => {
    setLocalProvider('gemini');
    setLocalGeminiModel(DEFAULT_GEMINI_MODEL);
    setLocalCustomEndpoint('');
    setLocalCustomKey('');
    setLocalCustomModel('gpt-4o');

    setLocalSttProvider('groq');
    setLocalSttApiKey('');
    setLocalSttEndpoint('https://api.groq.com/openai/v1');
    setLocalSttModel(DEFAULT_STT_MODEL);

    setLocalCompressImages(true);
    setLocalTargetKb(50);
    setLocalMergeImages(false);
    setLocalMergeTargetKb(150);

    setLocalStreamingOutput(false);
    setLocalLiveThinking(false);

    setTestResult(null);
    setSttTestResult(null);

    toast({
      title: 'Reset to Defaults',
      description: `Gemini (${DEFAULT_GEMINI_MODEL}), STT Whisper (${DEFAULT_STT_MODEL}), token optimization, and feature flags restored.`,
    });
  };

  // Filter custom presets (excluding pure gemini which is in tab 1)
  const customPresets = KNOWN_AI_PROVIDERS.filter((p) => p.id !== 'gemini');

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()} className="h-9 px-3 gap-2 rounded-xl text-xs font-semibold hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Journal</span>
        </Button>
        <div className="flex items-center gap-2">
          <span className="stamp-badge text-[10px] stamp-inquiry">
            PREFERENCES &amp; AI ENGINE
          </span>
        </div>
      </div>

      {/* Presentation Style & Language Preferences */}
      <Card className="border border-border shadow-xs overflow-hidden rounded-2xl bg-card">
        <div className="h-1 w-full bg-gradient-to-r from-amber-400/50 via-primary/40 to-blue-500/40" />
        <CardHeader className="bg-muted/20 border-b border-border/70 p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-foreground">
                <Sliders className="h-4 w-4 text-primary" />
                Teaching Style &amp; Language Directives
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Configure your target audience perspective and bilingual clinical vocabulary.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 sm:p-6 space-y-4">
          <ModeLanguageSelector />
        </CardContent>
      </Card>

      {/* AI Model & Provider Architecture */}
      <Card className="border border-border shadow-xs overflow-hidden rounded-2xl bg-card">
        <div className="h-1 w-full bg-gradient-to-r from-primary/50 via-blue-500/50 to-emerald-500/50" />
        <CardHeader className="bg-muted/20 border-b border-border/70 p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-foreground">
                <Cpu className="h-4 w-4 text-primary" />
                AI Inference Engine &amp; Model Selection
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Choose between Google Gemini or configure a custom OpenAI-compatible LLM endpoint (Groq, OpenAI, Anthropic, OpenRouter, DeepSeek, Cerebras, Ollama).
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-6">
          {/* Provider Selection Tabs */}
          <Tabs
            value={provider}
            onValueChange={(val) => {
              const newProvider = val as AiProvider;
              setLocalProvider(newProvider);
              setTestResult(null);

              if (newProvider === 'gemini') {
                const savedKey = vaultKeys['gemini'] || localGeminiKey || getSavedKeyForProvider('gemini') || '';
                setLocalGeminiKey(savedKey);
              } else {
                const currentPid = activeCustomProviderId;
                const savedKey = vaultKeys[currentPid] || localCustomKey || getSavedKeyForProvider(currentPid) || '';
                setLocalCustomKey(savedKey);
              }
            }}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 p-1 rounded-xl bg-muted/60 border border-border h-11">
              <TabsTrigger
                value="gemini"
                className="rounded-lg text-xs font-bold gap-2 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>Google Gemini</span>
              </TabsTrigger>
              <TabsTrigger
                value="custom"
                className="rounded-lg text-xs font-bold gap-2 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs"
              >
                <Server className="h-3.5 w-3.5 text-blue-500" />
                <span>Custom LLM / Provider Preset</span>
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: GOOGLE GEMINI */}
            <TabsContent value="gemini" className="space-y-6 pt-4">
              {/* API Key */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="gemini-key" className="text-xs font-bold text-foreground">
                      Google Gemini API Key
                    </Label>
                    {(localGeminiKey || vaultKeys['gemini']) && (
                      <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1">
                        <Check className="h-2.5 w-2.5" /> Saved Locally
                      </span>
                    )}
                  </div>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                  >
                    <span>Get Key from Google AI Studio</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="relative">
                  <Input
                    id="gemini-key"
                    type={showGeminiKey ? 'text' : 'password'}
                    placeholder="AIzaSy..."
                    value={localGeminiKey}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLocalGeminiKey(val);
                      setVaultKeys((prev) => ({ ...prev, gemini: val.trim() }));
                      setTestResult(null);
                    }}
                    className="pr-10 rounded-xl font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    title={showGeminiKey ? 'Hide key' : 'Show key'}
                  >
                    {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Your key is saved locally in your browser sandbox and automatically reused whenever you select Google Gemini.
                </p>
              </div>

              {/* Gemini Model Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="gemini-model-name" className="text-xs font-bold text-foreground">
                    Gemini Model Name / Identifier
                  </Label>
                  <span className="text-[11px] font-mono text-primary font-semibold">
                    Active: {localGeminiModel || DEFAULT_GEMINI_MODEL}
                  </span>
                </div>

                {/* Model Quick Select Presets */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {GEMINI_MODEL_PRESETS.map((preset) => {
                    const isSelected = localGeminiModel === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setLocalGeminiModel(preset.id);
                          setTestResult(null);
                        }}
                        className={`text-left p-3 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/30 shadow-2xs'
                            : 'border-border bg-background hover:bg-card hover:border-primary/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-mono text-xs font-bold text-foreground">
                            {preset.label}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded-md font-semibold ${
                              isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {preset.tag}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {preset.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Exact Model Name Input */}
                <div className="pt-2 space-y-2">
                  <Label htmlFor="custom-gemini-model-input" className="text-xs font-medium text-muted-foreground">
                    Or specify exact model name:
                  </Label>
                  <Input
                    id="custom-gemini-model-input"
                    type="text"
                    placeholder="e.g. gemini-3.7-flash, gemini-2.5-pro, gemini-2.5-flash"
                    value={localGeminiModel}
                    onChange={(e) => {
                      setLocalGeminiModel(e.target.value);
                      setTestResult(null);
                    }}
                    className="font-mono text-xs rounded-xl"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Default model is set to <strong>{DEFAULT_GEMINI_MODEL}</strong> for state-of-the-art diagnostic synthesis.
                  </p>

                  {/* Gemini Pill Box for previously tried / saved models */}
                  <ModelPillBox
                    providerId="gemini"
                    currentModel={localGeminiModel}
                    onSelectModel={(m) => {
                      setLocalGeminiModel(m);
                      setTestResult(null);
                    }}
                    savedModels={getSavedModelsForProvider('gemini')}
                    onAddModel={(pid, m) => addSavedModel(pid, m)}
                    onRemoveModel={(pid, m) => removeSavedModel(pid, m)}
                    onClearModels={(pid) => clearSavedModels(pid)}
                    title="Saved Gemini Models"
                  />
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: CUSTOM LLM ENDPOINT */}
            <TabsContent value="custom" className="space-y-6 pt-4">
              {/* Quick Provider Preset Chips */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground">
                    Select LLM Provider (Auto-loads saved API key for that provider)
                  </Label>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Provider ID: {activeCustomProviderId.toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {customPresets.map((preset) => {
                    const isSelected = activeCustomProviderId === preset.id;
                    const hasSavedKey = !!vaultKeys[preset.id];
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyPreset(preset)}
                        className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1 ${
                          isSelected
                            ? 'bg-blue-500/10 border-blue-500 text-foreground ring-1 ring-blue-500/30 shadow-xs'
                            : 'bg-background hover:bg-card hover:border-primary/40 border-border text-foreground'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 w-full">
                          <span className="font-bold text-xs flex items-center gap-1.5">
                            {isSelected && <Check className="h-3 w-3 text-blue-600 dark:text-blue-400" />}
                            <span>{preset.name}</span>
                          </span>
                          {hasSavedKey ? (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold">
                              Key Saved
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono text-muted-foreground">
                              No Key
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground line-clamp-1">
                          {preset.defaultModel}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Endpoint URL */}
              <div className="space-y-1.5">
                <Label htmlFor="custom-endpoint" className="text-xs font-bold text-foreground">
                  Base Endpoint URL (OpenAI-compatible)
                </Label>
                <Input
                  id="custom-endpoint"
                  type="url"
                  placeholder="https://api.openai.com/v1 or https://openrouter.ai/api/v1"
                  value={localCustomEndpoint}
                  onChange={(e) => {
                    const newEndpoint = e.target.value;
                    setLocalCustomEndpoint(newEndpoint);
                    const newPid = detectProviderIdFromEndpoint(newEndpoint, localCustomModel);
                    if (newPid && vaultKeys[newPid]) {
                      setLocalCustomKey(vaultKeys[newPid]);
                    }
                    setTestResult(null);
                  }}
                  className="font-mono text-xs rounded-xl"
                />
                <p className="text-[11px] text-muted-foreground">
                  The service automatically formats standard <code className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">/chat/completions</code> routes.
                </p>
              </div>

              {/* Custom Model Name */}
              <div className="space-y-2">
                <Label htmlFor="custom-model-id" className="text-xs font-bold text-foreground">
                  Model Identifier / Name
                </Label>
                <Input
                  id="custom-model-id"
                  type="text"
                  placeholder="e.g. llama-3.3-70b-versatile, llama-3.2-11b-vision-preview, gpt-4o, deepseek/deepseek-r1"
                  value={localCustomModel}
                  onChange={(e) => {
                    setLocalCustomModel(e.target.value);
                    setTestResult(null);
                  }}
                  className="font-mono text-xs rounded-xl"
                />

                {/* Custom Provider Pill Box for previously tried / saved models */}
                <ModelPillBox
                  providerId={activeCustomProviderId || 'custom'}
                  currentModel={localCustomModel}
                  onSelectModel={(m) => {
                    setLocalCustomModel(m);
                    setTestResult(null);
                  }}
                  savedModels={getSavedModelsForProvider(activeCustomProviderId || 'custom')}
                  onAddModel={(pid, m) => addSavedModel(pid, m)}
                  onRemoveModel={(pid, m) => removeSavedModel(pid, m)}
                  onClearModels={(pid) => clearSavedModels(pid)}
                  title={`Saved Models (${KNOWN_AI_PROVIDERS.find((p) => p.id === activeCustomProviderId)?.name || 'Custom'})`}
                />
              </div>

              {/* Custom API Key for this Provider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="custom-api-key" className="text-xs font-bold text-foreground">
                      API Key for {KNOWN_AI_PROVIDERS.find((p) => p.id === activeCustomProviderId)?.name || 'This Endpoint'}
                    </Label>
                    {localCustomKey && (
                      <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1">
                        <Check className="h-2.5 w-2.5" /> Saved for {activeCustomProviderId}
                      </span>
                    )}
                  </div>
                  {KNOWN_AI_PROVIDERS.find((p) => p.id === activeCustomProviderId)?.apiKeyUrl && (
                    <a
                      href={KNOWN_AI_PROVIDERS.find((p) => p.id === activeCustomProviderId)?.apiKeyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <span>Get {KNOWN_AI_PROVIDERS.find((p) => p.id === activeCustomProviderId)?.name} Key</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="custom-api-key"
                    type={showCustomKey ? 'text' : 'password'}
                    placeholder="sk-... or Bearer Token (leave empty for local Ollama)"
                    value={localCustomKey}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLocalCustomKey(val);
                      setVaultKeys((prev) => ({ ...prev, [activeCustomProviderId]: val.trim() }));
                      setTestResult(null);
                    }}
                    className="pr-10 rounded-xl font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCustomKey(!showCustomKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    title={showCustomKey ? 'Hide key' : 'Show key'}
                  >
                    {showCustomKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Saved separately for <strong>{activeCustomProviderId}</strong> in local browser storage. When you switch to other providers and come back, your key is automatically restored.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {/* Connection Test Action & Diagnostics */}
          <div className="pt-2 border-t border-border/60 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="gap-2 text-xs font-bold rounded-xl h-9 border-border hover:border-primary/40 shadow-2xs"
              >
                {isTesting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Activity className="h-3.5 w-3.5 text-primary" />
                )}
                <span>Test Model Connection</span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetDefaults}
                className="text-xs text-muted-foreground hover:text-foreground h-9 px-3 gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset Default ({DEFAULT_GEMINI_MODEL})</span>
              </Button>
            </div>

            {/* Test Result Display */}
            {testResult && (
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-3 transition-all ${
                  testResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-900 dark:text-red-300'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5 flex-1 min-w-0 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">
                      {testResult.success ? 'Model Verified & Ready' : 'Connection Error'}
                    </span>
                    {testResult.latencyMs && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-background/60 border border-border">
                        {testResult.latencyMs}ms
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed break-words opacity-90">
                    {testResult.message}
                  </p>
                  <p className="text-[10px] font-mono opacity-75">
                    Model: {testResult.modelUsed}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Multi-Provider API Key Vault (Local Storage) */}
      <Card className="border border-border shadow-xs overflow-hidden rounded-2xl bg-card">
        <div className="h-1 w-full bg-gradient-to-r from-amber-500/60 via-primary/60 to-emerald-500/60" />
        <CardHeader className="bg-muted/20 border-b border-border/70 p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-foreground">
                <Key className="h-4 w-4 text-amber-500" />
                Saved API Keys Vault (Multi-Provider Local Storage)
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Manage all your LLM provider keys in one place. Keys are safely stored locally in your browser sandbox and automatically recalled when you switch providers.
              </CardDescription>
            </div>
            <span className="stamp-badge stamp-confirmed text-[9px] py-0.5 px-2 hidden sm:inline-flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-emerald-600" />
              SANDBOX VAULT
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="text-xs text-muted-foreground leading-relaxed">
            Enter your API keys for any provider below. Whenever you switch to that provider, MediGen will automatically use your saved key so you never have to re-enter it.
          </div>

          <div className="space-y-3">
            {KNOWN_AI_PROVIDERS.map((p) => {
              const isCurrentActive =
                (provider === 'gemini' && p.id === 'gemini') ||
                (provider === 'custom' && activeCustomProviderId === p.id);

              const currentVal = p.id === 'gemini' 
                ? localGeminiKey 
                : (p.id === activeCustomProviderId ? localCustomKey : (vaultKeys[p.id] || ''));

              const hasKey = !!currentVal.trim();
              const isKeyVisible = !!visibleVaultKeys[p.id];

              return (
                <div
                  key={p.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isCurrentActive
                      ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border bg-background hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                        <span>{p.name}</span>
                      </span>
                      {isCurrentActive && (
                        <span className="text-[9px] font-mono px-2 py-0.2 rounded-full bg-primary text-primary-foreground font-bold">
                          Active Provider
                        </span>
                      )}
                      {hasKey && !isCurrentActive && (
                        <span className="text-[9px] font-mono px-2 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/30">
                          ✓ Key Saved
                        </span>
                      )}
                      {!hasKey && (
                        <span className="text-[9px] font-mono px-2 py-0.2 rounded-full bg-muted text-muted-foreground">
                          Not Set
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {p.apiKeyUrl && (
                        <a
                          href={p.apiKeyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-muted-foreground hover:text-foreground hover:underline flex items-center gap-1 mr-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span className="hidden sm:inline">Get Key</span>
                        </a>
                      )}
                      {!isCurrentActive && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleActivateProviderFromVault(p)}
                          className="h-7 text-[11px] px-2.5 rounded-lg border-border hover:border-primary/40 text-foreground font-semibold"
                        >
                          Use Provider
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={isKeyVisible ? 'text' : 'password'}
                        placeholder={p.placeholder}
                        value={currentVal}
                        onChange={(e) => handleUpdateVaultKey(p.id, e.target.value)}
                        className="pr-16 text-xs font-mono rounded-xl h-9 bg-card"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setVisibleVaultKeys((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                          }
                          className="p-1 text-muted-foreground hover:text-foreground"
                          title={isKeyVisible ? 'Hide key' : 'Show key'}
                        >
                          {isKeyVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        {hasKey && (
                          <button
                            type="button"
                            onClick={() => handleClearVaultKey(p.id, p.name)}
                            className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                            title="Clear this key"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    {p.description}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Speech-to-Text (STT) Whisper Engine Configuration */}
      <Card className="border border-border shadow-xs overflow-hidden rounded-2xl bg-card">
        <div className="h-1 w-full bg-gradient-to-r from-violet-500/60 via-indigo-500/60 to-purple-500/60" />
        <CardHeader className="bg-muted/20 border-b border-border/70 p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-foreground">
                <Mic className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                Speech-to-Text (STT) Voice Dictation Engine
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Configure your dedicated Whisper transcription engine for clinical voice notes and audio memos.
              </CardDescription>
            </div>
            <span className="stamp-badge stamp-confirmed text-[9px] py-0.5 px-2 hidden sm:inline-flex">
              {localSttProvider.toUpperCase()} • {localSttModel}
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-6">
          {/* Quick STT Provider Presets */}
          <div className="space-y-2.5">
            <Label className="text-xs font-bold text-foreground">
              Choose STT Provider Preset
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {STT_PROVIDER_PRESETS.map((preset) => {
                const isSelected = localSttProvider === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplySttPreset(preset)}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5 ${
                      isSelected
                        ? 'bg-violet-500/10 border-violet-500 text-foreground ring-1 ring-violet-500/40 shadow-xs'
                        : 'bg-background hover:bg-muted/40 border-border text-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        {isSelected ? (
                          <Check className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
                        ) : (
                          <Radio className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span>{preset.name}</span>
                      </div>
                      {preset.tag && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-violet-600 text-white font-semibold">
                          {preset.tag}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {preset.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STT Base Endpoint URL (for Groq, OpenAI, or Custom) */}
          {localSttProvider !== 'gemini' && (
            <div className="space-y-1.5">
              <Label htmlFor="stt-endpoint" className="text-xs font-bold text-foreground">
                STT Base Endpoint URL (OpenAI-compatible)
              </Label>
              <Input
                id="stt-endpoint"
                type="url"
                placeholder="https://api.groq.com/openai/v1 or https://api.openai.com/v1"
                value={localSttEndpoint}
                onChange={(e) => {
                  setLocalSttEndpoint(e.target.value);
                  setSttTestResult(null);
                }}
                className="font-mono text-xs rounded-xl"
              />
              <p className="text-[11px] text-muted-foreground">
                The transcription engine automatically calls the <code className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">/audio/transcriptions</code> route on this endpoint.
              </p>
            </div>
          )}

          {/* STT Model Identifier */}
          {localSttProvider !== 'gemini' && (
            <div className="space-y-2">
              <Label htmlFor="stt-model" className="text-xs font-bold text-foreground">
                STT Model Identifier
              </Label>
              <Input
                id="stt-model"
                type="text"
                placeholder="whisper-large-v3-turbo, whisper-large-v3, whisper-1"
                value={localSttModel}
                onChange={(e) => {
                  setLocalSttModel(e.target.value);
                  setSttTestResult(null);
                }}
                className="font-mono text-xs rounded-xl"
              />

              {/* STT Pill Box for previously tried / saved models */}
              <ModelPillBox
                providerId={`stt_${localSttProvider}`}
                currentModel={localSttModel}
                onSelectModel={(m) => {
                  setLocalSttModel(m);
                  setSttTestResult(null);
                }}
                savedModels={getSavedModelsForProvider(`stt_${localSttProvider}`)}
                onAddModel={(pid, m) => addSavedModel(pid, m)}
                onRemoveModel={(pid, m) => removeSavedModel(pid, m)}
                onClearModels={(pid) => clearSavedModels(pid)}
                title={`Saved STT Models (${localSttProvider.toUpperCase()})`}
              />
            </div>
          )}

          {/* Dedicated STT API Key */}
          {localSttProvider !== 'gemini' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="stt-api-key" className="text-xs font-bold text-foreground">
                    STT API Key ({localSttProvider.toUpperCase()})
                  </Label>
                  {localSttApiKey && (
                    <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1">
                      <Check className="h-2.5 w-2.5" /> Saved
                    </span>
                  )}
                </div>
                {localSttProvider === 'groq' && (
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                  >
                    <span>Get free Groq API Key</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="relative">
                <Input
                  id="stt-api-key"
                  type={showSttKey ? 'text' : 'password'}
                  placeholder="gsk_... or sk-... (leave empty if using server environment key)"
                  value={localSttApiKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLocalSttApiKey(val);
                    setSttVaultKeys((prev) => ({ ...prev, [localSttProvider]: val.trim() }));
                    setSttTestResult(null);
                  }}
                  className="pr-10 rounded-xl font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowSttKey(!showSttKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  title={showSttKey ? 'Hide key' : 'Show key'}
                >
                  {showSttKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Saved locally per STT provider. Automatically loaded when switching between Groq and OpenAI transcription.
              </p>
            </div>
          )}

          {localSttProvider === 'gemini' && (
            <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs text-foreground space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-violet-700 dark:text-violet-300">
                <Sparkles className="h-3.5 w-3.5" />
                Gemini Multimodal Audio Transcription
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Voice recordings will be sent to Google Gemini for transcription using your saved Gemini API key.
              </p>
            </div>
          )}

          {/* STT Test Connection & Diagnostics */}
          <div className="pt-2 border-t border-border/60 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestStt}
                disabled={isTestingStt}
                className="gap-2 text-xs font-bold rounded-xl h-9 border-border hover:border-violet-500/40 shadow-2xs"
              >
                {isTestingStt ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600 dark:text-violet-400" />
                ) : (
                  <Activity className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                )}
                <span>Test STT (Whisper) Endpoint</span>
              </Button>
              <span className="text-[11px] text-muted-foreground font-mono">
                {localSttProvider.toUpperCase()}: {localSttModel}
              </span>
            </div>

            {/* STT Test Result Display */}
            {sttTestResult && (
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-3 transition-all ${
                  sttTestResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-900 dark:text-red-300'
                }`}
              >
                {sttTestResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5 flex-1 min-w-0 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">
                      {sttTestResult.success ? 'STT Engine Verified & Ready' : 'STT Engine Error'}
                    </span>
                    {sttTestResult.latencyMs && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-background/60 border border-border">
                        {sttTestResult.latencyMs}ms
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed break-words opacity-90">
                    {sttTestResult.message}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Document & Image Compression & Multi-Image Stitching */}
      <Card className="border border-border shadow-xs overflow-hidden rounded-2xl bg-card">
        <div className="h-1 w-full bg-gradient-to-r from-emerald-500/50 via-teal-500/50 to-primary/50" />
        <CardHeader className="bg-muted/20 border-b border-border/70 p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-foreground">
                <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Document &amp; Image Token Optimization &amp; Multi-Page Stitcher
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Compress and stitch uploaded medical documents, multi-page PDFs, and photos before sending to AI models to save tokens and minimize latency.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 sm:p-6 space-y-5">
          {/* Option 1: Individual Image Auto-Compression */}
          <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl border bg-muted/30 border-border/70">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="settings-compress-toggle" className="text-sm font-bold text-foreground cursor-pointer">
                  Auto-Compress Uploaded Images (~{localTargetKb}KB each)
                </Label>
                {localCompressImages && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/30">
                    Active Token Saver
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                When enabled, each uploaded image and PDF page is converted and downscaled to ~{localTargetKb}KB only for the AI API prompt. The original full-fidelity images remain saved in your local history untouched.
              </p>
            </div>
            <input
              id="settings-compress-toggle"
              type="checkbox"
              checked={localCompressImages}
              onChange={(e) => setLocalCompressImages(e.target.checked)}
              className="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
          </div>

          {localCompressImages && (
            <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
              <Label className="text-xs font-semibold text-foreground">
                Target Size per Individual Image
              </Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { kb: 40, label: '40 KB (Maximum Token Saving)' },
                  { kb: 50, label: '50 KB (Recommended / Balanced)' },
                  { kb: 80, label: '80 KB (Higher Detail)' },
                  { kb: 120, label: '120 KB (High Resolution)' },
                ].map((item) => (
                  <button
                    key={item.kb}
                    type="button"
                    onClick={() => setLocalTargetKb(item.kb)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      localTargetKb === item.kb
                        ? 'bg-emerald-600 text-white font-bold border-emerald-600 shadow-xs'
                        : 'bg-background hover:bg-muted text-foreground border-border'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Option 2: Convert/Stitch All Images into 1 Single Image */}
          <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl border bg-muted/30 border-border/70">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="settings-merge-toggle" className="text-sm font-bold text-foreground cursor-pointer">
                  Convert All Uploaded Images into 1 Single Composite Image (~{localMergeTargetKb}KB)
                </Label>
                {localMergeImages && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 font-bold border border-blue-500/30">
                    Multi-Page Merger
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Stitches multi-page lab reports, prescriptions, and clinical photos side-by-side into a single composite canvas (~{localMergeTargetKb}KB) for the AI model. Reduces multi-turn vision tokens while keeping document context unified.
              </p>
            </div>
            <input
              id="settings-merge-toggle"
              type="checkbox"
              checked={localMergeImages}
              onChange={(e) => setLocalMergeImages(e.target.checked)}
              className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
          </div>

          {localMergeImages && (
            <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-2">
              <Label className="text-xs font-semibold text-foreground">
                Target Composite Canvas Size for AI Prompts
              </Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { kb: 100, label: '100 KB (Max Token Efficiency)' },
                  { kb: 150, label: '150 KB (Recommended / Crisp Multi-Page)' },
                  { kb: 200, label: '200 KB (High Density Documents)' },
                  { kb: 250, label: '250 KB (Ultra Detailed Scans)' },
                ].map((item) => (
                  <button
                    key={item.kb}
                    type="button"
                    onClick={() => setLocalMergeTargetKb(item.kb)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      localMergeTargetKb === item.kb
                        ? 'bg-blue-600 text-white font-bold border-blue-600 shadow-xs'
                        : 'bg-background hover:bg-muted text-foreground border-border'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="p-3 rounded-xl bg-muted/40 border border-border text-[11px] text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <span>🛡️ Patient Case History Integrity</span>
            </p>
            <p>
              Regardless of your AI prompt compression or single-image stitching settings, <strong>all uploaded files and multi-page documents are stored in full original resolution</strong> in your local Dexie database and Case History.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Feature Flags: Live Streaming & AI Thinking Display */}
      <Card className="border border-border shadow-xs overflow-hidden rounded-2xl bg-card">
        <div className="h-1 w-full bg-gradient-to-r from-cyan-500/60 via-blue-500/60 to-indigo-500/60" />
        <CardHeader className="bg-muted/20 border-b border-border/70 p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-foreground">
                <BrainCircuit className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                Feature Flags &amp; Live AI Display
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Control experimental live token streaming and real-time internal scratchpad / thinking outputs.
              </CardDescription>
            </div>
            <span className="stamp-badge stamp-inquiry text-[9px] py-0.5 px-2">
              FEATURE FLAGS
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-5">
          {/* Flag 1: Live Text Streaming */}
          <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl border bg-muted/30 border-border/70">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="settings-stream-toggle" className="text-sm font-bold text-foreground cursor-pointer">
                  Live Response Streaming Output
                </Label>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                  localStreamingOutput 
                    ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30' 
                    : 'bg-muted text-muted-foreground border-border'
                }`}>
                  {localStreamingOutput ? 'Enabled' : 'Disabled (Default)'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                When <strong>disabled (recommended)</strong>, AI outputs are presented in fully rendered, pristine clinical cards without intermediate raw JSON tokens or stream jitter. Enable only if you wish to inspect raw response tokens.
              </p>
            </div>
            <input
              id="settings-stream-toggle"
              type="checkbox"
              checked={localStreamingOutput}
              onChange={(e) => setLocalStreamingOutput(e.target.checked)}
              className="h-5 w-5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
            />
          </div>

          {/* Flag 2: AI Clinical Reasoning & Chain of Thought (All Providers) */}
          <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl border bg-muted/30 border-border/70">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="settings-thinking-toggle" className="text-sm font-bold text-foreground cursor-pointer">
                  Clinical Reasoning &amp; Chain of Thought (All Providers)
                </Label>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                  localLiveThinking 
                    ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30' 
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                }`}>
                  {localLiveThinking ? 'Reasoning ON (Deep Analysis)' : 'Reasoning OFF (Ultra-Fast Response)'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                When enabled, models perform multi-step clinical reasoning and hypothesis deliberation. When <strong>turned OFF</strong>, reasoning tokens and thinking budgets are bypassed across <strong>all providers</strong> (Gemini, Claude, GPT, DeepSeek, Groq) to deliver instantaneous, low-latency direct responses.
              </p>
            </div>
            <input
              id="settings-thinking-toggle"
              type="checkbox"
              checked={localLiveThinking}
              onChange={(e) => setLocalLiveThinking(e.target.checked)}
              className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
          </div>
        </CardContent>

        <CardFooter className="bg-muted/30 border-t border-border p-4 sm:p-5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-handwriting hidden sm:inline">
            configurations saved to local journal storage
          </span>
          <Button onClick={handleSave} className="w-full sm:w-auto px-6 h-10 rounded-xl text-xs font-bold gap-2 shadow-xs">
            <Save className="h-4 w-4" />
            <span>Save &amp; Apply All Settings &amp; Keys</span>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
