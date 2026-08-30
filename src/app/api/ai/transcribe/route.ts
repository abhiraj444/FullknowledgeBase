import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { audioData, mimeType = 'audio/webm', sttConfig, config = {}, isTest = false } = body;

    // Resolve active STT configuration
    const activeSttConfig = sttConfig || config.sttConfig || {};
    const provider = activeSttConfig.provider || (process.env.GROQ_API_KEY ? 'groq' : 'gemini');
    const sttKey = (activeSttConfig.apiKey || '').trim() || (provider === 'groq' ? process.env.GROQ_API_KEY : provider === 'openai' ? process.env.OPENAI_API_KEY : '') || (provider === 'gemini' ? (config.geminiApiKey || process.env.GEMINI_API_KEY) : '');
    const customEndpoint = (activeSttConfig.endpoint || '').trim();
    const sttModel = activeSttConfig.model || (provider === 'openai' ? 'whisper-1' : 'whisper-large-v3-turbo');

    // 0. Direct Connection & Authentication Test Mode
    if (isTest) {
      if (provider === 'groq') {
        const key = sttKey || process.env.GROQ_API_KEY;
        if (!key) {
          return NextResponse.json(
            { error: 'Groq API key is missing. Please enter your Groq API key (starts with gsk_).' },
            { status: 400 }
          );
        }
        try {
          const testRes = await fetch('https://api.groq.com/openai/v1/models', {
            method: 'GET',
            headers: { Authorization: `Bearer ${key}` },
          });
          if (testRes.ok) {
            return NextResponse.json({
              success: true,
              ok: true,
              message: `Groq Whisper connection verified successfully. Ready to transcribe with ${sttModel}.`,
              provider: 'groq',
              model: sttModel,
            });
          } else {
            const errData = await testRes.json().catch(() => null);
            const errMsg = errData?.error?.message || `Groq authentication error (HTTP ${testRes.status})`;
            return NextResponse.json({ error: errMsg }, { status: 400 });
          }
        } catch (fetchErr: any) {
          return NextResponse.json(
            { error: `Network error connecting to Groq API: ${fetchErr?.message || fetchErr}` },
            { status: 500 }
          );
        }
      }

      if (provider === 'openai') {
        const key = sttKey || process.env.OPENAI_API_KEY;
        if (!key) {
          return NextResponse.json(
            { error: 'OpenAI API key is missing. Please enter your OpenAI API key (starts with sk-).' },
            { status: 400 }
          );
        }
        try {
          const testRes = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: { Authorization: `Bearer ${key}` },
          });
          if (testRes.ok) {
            return NextResponse.json({
              success: true,
              ok: true,
              message: `OpenAI Whisper connection verified successfully. Ready to transcribe with ${sttModel}.`,
              provider: 'openai',
              model: sttModel,
            });
          } else {
            const errData = await testRes.json().catch(() => null);
            const errMsg = errData?.error?.message || `OpenAI authentication error (HTTP ${testRes.status})`;
            return NextResponse.json({ error: errMsg }, { status: 400 });
          }
        } catch (fetchErr: any) {
          return NextResponse.json(
            { error: `Network error connecting to OpenAI API: ${fetchErr?.message || fetchErr}` },
            { status: 500 }
          );
        }
      }

      if (provider === 'custom') {
        if (!customEndpoint) {
          return NextResponse.json(
            { error: 'Custom STT endpoint URL is missing. Please specify a base URL.' },
            { status: 400 }
          );
        }
        try {
          const baseUrl = customEndpoint
            .replace(/\/audio\/transcriptions$/, '')
            .replace(/\/chat\/completions$/, '')
            .replace(/\/+$/, '');
          const headers: Record<string, string> = {};
          if (sttKey) headers['Authorization'] = `Bearer ${sttKey}`;

          const testRes = await fetch(`${baseUrl}/models`, {
            method: 'GET',
            headers,
          });

          if (testRes.ok || testRes.status === 404 || testRes.status === 405) {
            // Some specialized Whisper standalone servers return 404/405 for /models but serve /audio/transcriptions
            return NextResponse.json({
              success: true,
              ok: true,
              message: `Custom STT endpoint reached successfully (${baseUrl}). Ready with ${sttModel}.`,
              provider: 'custom',
              model: sttModel,
            });
          } else {
            const errData = await testRes.json().catch(() => null);
            const errMsg = errData?.error?.message || `Custom STT endpoint responded with HTTP ${testRes.status}`;
            return NextResponse.json({ error: errMsg }, { status: 400 });
          }
        } catch (fetchErr: any) {
          return NextResponse.json(
            { error: `Network error reaching custom STT endpoint: ${fetchErr?.message || fetchErr}` },
            { status: 500 }
          );
        }
      }

      if (provider === 'gemini') {
        const gemKey = config.geminiApiKey || config.apiKey || process.env.GEMINI_API_KEY || '';
        if (!gemKey) {
          return NextResponse.json(
            { error: 'Gemini API key is missing. Please enter your Gemini API key.' },
            { status: 400 }
          );
        }
        return NextResponse.json({
          success: true,
          ok: true,
          message: 'Gemini Audio transcription engine is configured and ready.',
          provider: 'gemini',
          model: 'gemini-2.5-flash',
        });
      }
    }

    if (!audioData || typeof audioData !== 'string') {
      return NextResponse.json(
        { error: 'Audio data is required as a base64 string or data URI.' },
        { status: 400 }
      );
    }

    // Clean base64 string if data URI was passed
    const cleanBase64 = audioData.includes('base64,')
      ? audioData.split('base64,')[1]
      : audioData;

    let lastError: string | null = null;

    // Helper: Convert base64 to Blob & FormData for Whisper endpoints
    const createWhisperFormData = (modelName: string) => {
      const binaryString = atob(cleanBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const extMap: Record<string, string> = {
        'audio/webm': 'webm',
        'audio/mp3': 'mp3',
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'audio/ogg': 'ogg',
        'audio/mp4': 'm4a',
        'audio/flac': 'flac',
        'audio/aac': 'aac',
      };
      const ext = extMap[mimeType] || 'webm';

      const formData = new FormData();
      const blob = new Blob([bytes], { type: mimeType });
      formData.append('file', blob, `speech_recording.${ext}`);
      formData.append('model', modelName);
      formData.append('response_format', 'json');
      return formData;
    };

    // 1. Groq Cloud Whisper STT
    if (provider === 'groq' && sttKey) {
      try {
        const formData = createWhisperFormData(sttModel || 'whisper-large-v3-turbo');
        const groqUrl = customEndpoint
          ? (customEndpoint.endsWith('/audio/transcriptions') ? customEndpoint : `${customEndpoint.replace(/\/+$/, '')}/audio/transcriptions`)
          : 'https://api.groq.com/openai/v1/audio/transcriptions';

        const groqRes = await fetch(groqUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sttKey}`,
          },
          body: formData,
        });

        if (groqRes.ok) {
          const data = await groqRes.json();
          if (typeof data.text === 'string') {
            return NextResponse.json({
              transcript: data.text.trim(),
              provider: 'groq-whisper',
              model: sttModel || 'whisper-large-v3-turbo',
            });
          }
        } else {
          const errData = await groqRes.json().catch(() => null);
          lastError = errData?.error?.message || `Groq returned HTTP ${groqRes.status}`;
          console.warn('Groq STT returned non-200:', groqRes.status, lastError);
        }
      } catch (groqErr: any) {
        lastError = groqErr?.message || String(groqErr);
        console.warn('Groq whisper transcription error, testing fallback:', groqErr);
      }
    }

    // 2. OpenAI Whisper STT
    if (provider === 'openai' && sttKey) {
      try {
        const formData = createWhisperFormData(sttModel || 'whisper-1');
        const openaiUrl = customEndpoint
          ? (customEndpoint.endsWith('/audio/transcriptions') ? customEndpoint : `${customEndpoint.replace(/\/+$/, '')}/audio/transcriptions`)
          : 'https://api.openai.com/v1/audio/transcriptions';

        const openaiRes = await fetch(openaiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sttKey}`,
          },
          body: formData,
        });

        if (openaiRes.ok) {
          const data = await openaiRes.json();
          if (typeof data.text === 'string') {
            return NextResponse.json({
              transcript: data.text.trim(),
              provider: 'openai-whisper',
              model: sttModel || 'whisper-1',
            });
          }
        } else {
          const errData = await openaiRes.json().catch(() => null);
          lastError = errData?.error?.message || `OpenAI returned HTTP ${openaiRes.status}`;
          console.warn('OpenAI STT returned non-200:', openaiRes.status, lastError);
        }
      } catch (openaiErr: any) {
        lastError = openaiErr?.message || String(openaiErr);
        console.warn('OpenAI Whisper transcription error, testing fallback:', openaiErr);
      }
    }

    // 3. Custom OpenAI-compatible Whisper STT Endpoint
    if (provider === 'custom' && customEndpoint) {
      try {
        const formData = createWhisperFormData(sttModel || 'whisper-large-v3-turbo');
        let endpointUrl = customEndpoint.trim();
        if (endpointUrl.endsWith('/chat/completions')) {
          endpointUrl = endpointUrl.replace(/\/chat\/completions$/, '');
        }
        if (!endpointUrl.endsWith('/audio/transcriptions')) {
          endpointUrl = `${endpointUrl.replace(/\/+$/, '')}/audio/transcriptions`;
        }

        const headers: Record<string, string> = {};
        if (sttKey) {
          headers['Authorization'] = `Bearer ${sttKey}`;
        }

        const customRes = await fetch(endpointUrl, {
          method: 'POST',
          headers,
          body: formData,
        });

        if (customRes.ok) {
          const data = await customRes.json();
          if (typeof data.text === 'string') {
            return NextResponse.json({
              transcript: data.text.trim(),
              provider: 'custom-whisper',
              model: sttModel || 'whisper-large-v3-turbo',
            });
          }
        } else {
          const errData = await customRes.json().catch(() => null);
          lastError = errData?.error?.message || `Custom STT returned HTTP ${customRes.status}`;
          console.warn('Custom STT endpoint returned non-200:', customRes.status, lastError);
        }
      } catch (customErr: any) {
        lastError = customErr?.message || String(customErr);
        console.warn('Custom STT transcription error, testing fallback:', customErr);
      }
    }

    // 4. Server GROQ_API_KEY fallback if user didn't provide custom STT key but server has one
    if (process.env.GROQ_API_KEY && (!sttKey || provider !== 'groq')) {
      try {
        const formData = createWhisperFormData('whisper-large-v3-turbo');
        const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          },
          body: formData,
        });

        if (groqRes.ok) {
          const data = await groqRes.json();
          if (typeof data.text === 'string') {
            return NextResponse.json({
              transcript: data.text.trim(),
              provider: 'groq-whisper (server fallback)',
              model: 'whisper-large-v3-turbo',
            });
          }
        }
      } catch (serverGroqErr) {
        console.warn('Server Groq fallback error:', serverGroqErr);
      }
    }

    // 5. Gemini Audio Transcription Fallback
    const geminiKey =
      config.geminiApiKey ||
      config.apiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
      '';

    if (geminiKey) {
      const modelName = config.geminiModel || 'gemini-3.7-flash';
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: mimeType || 'audio/webm',
              },
            },
            {
              text: 'Transcribe this clinical audio recording/voice memo verbatim into clear text. Capture all medical terms, medication names, dosages, and patient symptoms accurately with proper clinical capitalization and punctuation. Output ONLY the raw transcribed text with no conversational preamble or commentary.',
            },
          ],
        });

        const transcript = (response.text || '').trim();
        if (transcript) {
          return NextResponse.json({
            transcript,
            provider: 'gemini-audio',
            model: modelName,
          });
        }
      } catch (geminiErr: any) {
        lastError = geminiErr?.message || String(geminiErr);
        console.error(`Gemini audio model ${modelName} failed:`, geminiErr?.message);
      }
    }

    return NextResponse.json(
      {
        error:
          lastError ||
          'Speech-to-text transcription could not be completed. Please verify your Groq, OpenAI, Custom STT, or Gemini API key in Settings.',
      },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Audio transcription route error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to transcribe audio dictation.' },
      { status: 500 }
    );
  }
}
