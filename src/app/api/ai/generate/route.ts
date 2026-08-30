import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow up to 300s for thinking models (Vercel clamps to plan limit)

function isThinkingModel(modelName: string): boolean {
  const lower = modelName.toLowerCase();
  return (
    lower.includes('2.5') ||
    lower.includes('3.7') ||
    lower.includes('think') ||
    lower.includes('reason') ||
    lower.includes('r1')
  );
}

function is503Overloaded(err: any): boolean {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('503') || msg.includes('overloaded') || msg.includes('service unavailable');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseGoogleErrorMessage(err: any): { message: string; statusCode: number; isFatal: boolean } {
  const raw = err?.message || String(err || '');
  const rawLower = raw.toLowerCase();

  if (rawLower.includes('api_key_invalid') || rawLower.includes('api key not valid') || rawLower.includes('invalid api key')) {
    return {
      message: 'Invalid Google Gemini API Key. Please verify your API key in Settings (or check GEMINI_API_KEY in your Vercel Environment Variables).',
      statusCode: 401,
      isFatal: true,
    };
  }

  if (rawLower.includes('quota') || rawLower.includes('resource_exhausted') || rawLower.includes('429') || rawLower.includes('rate limit')) {
    return {
      message: 'Gemini API Rate Limit / Quota Exceeded (429). Please wait a few seconds before trying again or check your billing quota in Google AI Studio.',
      statusCode: 429,
      isFatal: true,
    };
  }

  if (rawLower.includes('permission_denied') || rawLower.includes('403')) {
    return {
      message: 'Gemini API Permission Denied (403). Your API key does not have access to this feature or model.',
      statusCode: 403,
      isFatal: true,
    };
  }

  if (rawLower.includes('not found') || rawLower.includes('404')) {
    return {
      message: `Gemini Model Not Found (404). ${raw}`,
      statusCode: 404,
      isFatal: false,
    };
  }

  if (rawLower.includes('safety') || rawLower.includes('blocked') || rawLower.includes('harm_category')) {
    return {
      message: 'The AI request was filtered by safety policies. Please adjust or clarify the clinical phrasing.',
      statusCode: 422,
      isFatal: true,
    };
  }

  if (rawLower.includes('service unavailable') || rawLower.includes('503') || rawLower.includes('overloaded')) {
    return {
      message: 'Google Gemini service is temporarily overloaded (503). Please retry in a few seconds.',
      statusCode: 503,
      isFatal: false,
    };
  }

  return {
    message: raw.length > 300 ? raw.slice(0, 300) + '...' : raw,
    statusCode: 500,
    isFatal: false,
  };
}

/**
 * Transcribe audio via Groq's dedicated Whisper endpoint.
 * Returns the transcript text, or null if transcription fails.
 */
async function transcribeAudioViaGroq(
  audioBase64: string,
  audioMimeType: string,
  apiKey: string,
  baseEndpoint: string
): Promise<string | null> {
  try {
    // Derive the transcription endpoint from the base endpoint
    let transcriptionUrl = baseEndpoint.replace(/\/+$/, '');
    // Strip /chat/completions if present
    transcriptionUrl = transcriptionUrl.replace(/\/chat\/completions$/, '');
    transcriptionUrl += '/audio/transcriptions';

    // Convert base64 to binary
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Determine file extension from mime type
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
    const ext = extMap[audioMimeType] || 'webm';

    // Create FormData with the audio file
    const formData = new FormData();
    const blob = new Blob([bytes], { type: audioMimeType });
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'json');

    const res = await fetch(transcriptionUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      console.warn(`Groq Whisper transcription failed (${res.status}):`, await res.text());
      return null;
    }

    const data = await res.json();
    return data.text || null;
  } catch (err) {
    console.warn('Audio transcription failed:', err);
    return null;
  }
}

function normalizeCustomEndpoint(endpoint: string): string {
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, images = [], config = {} } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required and must be a text string.' }, { status: 400 });
    }

    // --- 1. Custom Provider Flow (OpenAI / OpenRouter / Groq / DeepSeek / Anthropic / Ollama) ---
    if (config.provider === 'custom') {
      const endpoint = normalizeCustomEndpoint(config.customEndpoint || '');
      if (!endpoint) {
        return NextResponse.json(
          { error: 'Custom LLM endpoint is not configured. Please set your endpoint URL in Settings.' },
          { status: 400 }
        );
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
        } else {
          headers['Authorization'] = `Bearer ${key}`;
        }
      }

      // Detect if this is a Groq endpoint for special audio handling
      const isGroqEndpoint = endpoint.toLowerCase().includes('groq.com');
      const imageCount = images ? images.filter((i: any) => i.mimeType?.startsWith('image/')).length : 0;

      // Process media: transcribe audio for providers that don't support inline audio
      let augmentedPrompt = prompt;
      if (imageCount > 0) {
        augmentedPrompt = `[CLINICAL ATTACHMENTS: ${imageCount} medical document/image page(s) attached. Inspect and analyze all visible findings, lab parameters, test results, numbers, waveforms, patient info, and clinical text directly from the attached visual image(s).]\n\n${prompt}`;
      }

      const contentParts: any[] = [{ type: 'text', text: '' }]; // text placeholder, will be set later

      if (images && images.length > 0) {
        for (const img of images) {
          if (!img.data) continue;

          if (img.mimeType.startsWith('image/')) {
            // Images: standard image_url format (works for Groq vision models, OpenAI, etc.)
            contentParts.push({
              type: 'image_url',
              image_url: {
                url: `data:${img.mimeType};base64,${img.data}`,
              },
            });
          } else if (img.mimeType.startsWith('audio/')) {
            // Audio attachment: transcribe via Whisper or Groq if possible, and inject into prompt text
            // Avoid sending raw 'input_audio' to providers that only support text/vision to prevent 400 Bad Request errors
            let transcriptText: string | null = null;
            if (key) {
              transcriptText = await transcribeAudioViaGroq(img.data, img.mimeType, key, endpoint);
            }
            if (transcriptText) {
              augmentedPrompt = `[Audio Transcript from clinical voice memo]:\n"${transcriptText}"\n\n${augmentedPrompt}`;
            } else {
              augmentedPrompt = `[Spoken voice memo was recorded and attached as optional context. Please analyze based on the clinical text and visual findings.]\n\n${augmentedPrompt}`;
            }
          } else if (img.mimeType === 'application/pdf') {
            // PDFs: most custom providers don't support inline PDFs
            augmentedPrompt = `[PDF document was attached. If you can process the document content from the provided data, please analyze it. Otherwise, focus on the text input.]\n\n${augmentedPrompt}`;
          }
        }
      }

      const isReasoningDisabled = config.enableReasoning === false || config.thinkingBudget === 0;
      if (isReasoningDisabled) {
        augmentedPrompt = `[FAST RESPONSE MODE: Do NOT output any internal chain of thought, reasoning steps, or <think> tags. Provide the final clinical response directly and concisely.]\n\n${augmentedPrompt}`;
      }

      // Set the text content part with the (potentially augmented) prompt
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

      const isOpenRouter = endpoint.toLowerCase().includes('openrouter.ai');
      const isOpenAi = endpoint.toLowerCase().includes('api.openai.com');
      const modelNameLower = initialModel.toLowerCase();

      const payload: any = {
        model: initialModel,
        messages: [
          {
            role: 'user',
            content: contentParts.length === 1 ? augmentedPrompt : contentParts,
          },
        ],
        temperature: 0.2,
      };

      if (isReasoningDisabled) {
        if (isOpenRouter) {
          payload.reasoning = { effort: 'none', exclude: true };
        } else if (isOpenAi && (modelNameLower.startsWith('o1') || modelNameLower.startsWith('o3'))) {
          payload.reasoning_effort = 'low';
        } else if (isAnthropic && modelNameLower.includes('claude-3-7')) {
          payload.thinking = { type: 'disabled' };
        }
      } else {
        if (isOpenRouter) {
          payload.reasoning = { effort: 'medium' };
        } else if (isOpenAi && (modelNameLower.startsWith('o1') || modelNameLower.startsWith('o3'))) {
          payload.reasoning_effort = 'medium';
        }
      }

      try {
        let res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        // If the upstream endpoint rejected the reasoning configuration (e.g. 400 invalid option, unrecognized field), retry without reasoning params
        if (!res.ok && res.status === 400 && (payload.reasoning || payload.reasoning_effort || payload.thinking)) {
          const testErrText = await res.text().catch(() => '');
          const testLower = testErrText.toLowerCase();
          if (
            testLower.includes('reasoning') ||
            testLower.includes('effort') ||
            testLower.includes('thinking') ||
            testLower.includes('invalid option') ||
            testLower.includes('unrecognized') ||
            testLower.includes('unexpected property')
          ) {
            const cleanPayload = { ...payload };
            delete cleanPayload.reasoning;
            delete cleanPayload.reasoning_effort;
            delete cleanPayload.thinking;
            delete cleanPayload.include_reasoning;

            res = await fetch(endpoint, {
              method: 'POST',
              headers,
              body: JSON.stringify(cleanPayload),
            });
          } else {
            // Recreate response if error wasn't reasoning related
            res = new Response(testErrText, {
              status: res.status,
              headers: res.headers,
            });
          }
        }

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
                return NextResponse.json({ text: data.choices?.[0]?.message?.content || '' });
              }
            }
          }

          let parsedMsg = errText;
          try {
            const errJson = JSON.parse(errText);
            parsedMsg = errJson.error?.message || errJson.message || errText;
          } catch {
            // keep raw text
          }

          // Provide helpful guidance for common custom provider errors
          let userHint = '';
          if (
            errLower.includes('does not support image') ||
            errLower.includes('only text') ||
            errLower.includes('vision') ||
            errLower.includes('must be a string') ||
            errLower.includes('unprocessable')
          ) {
            userHint =
              ' Tip: This model does not support image inputs. Try selecting a vision-capable model (e.g. Gemini 3.7 Flash, Llama 3.2 Vision, or GPT-4o) in Settings to analyze medical images.';
          }

          return NextResponse.json(
            { error: `Custom AI Endpoint Error (${res.status}): ${parsedMsg.slice(0, 300)}${userHint}` },
            { status: res.status >= 400 && res.status < 600 ? res.status : 500 }
          );
        }

        const data = await res.json();
        let replyText = '';
        let reasoning = '';

        if (isAnthropic && data.content && Array.isArray(data.content)) {
          replyText = data.content.map((c: any) => c.text || '').join('');
        } else {
          const choice = data.choices?.[0]?.message;
          replyText = choice?.content || '';
          reasoning = choice?.reasoning_content || choice?.reasoning || choice?.thought || choice?.thinking || '';
        }

        // Extract inline <think> tags if present in replyText
        if (replyText && (replyText.includes('<think') || replyText.includes('<thought') || replyText.includes('<reasoning'))) {
          const thinkRegex = /<(?:think|thought|reasoning)>([\s\S]*?)<\/(?:think|thought|reasoning)>/gi;
          let m: RegExpExecArray | null;
          while ((m = thinkRegex.exec(replyText)) !== null) {
            if (m[1]) {
              reasoning += (reasoning ? '\n' : '') + m[1].trim();
            }
          }
          replyText = replyText.replace(thinkRegex, '');
        }

        return NextResponse.json({
          text: replyText,
          thinking: reasoning || undefined,
          modelUsed: data.model || payload.model,
        });
      } catch (fetchErr: any) {
        return NextResponse.json(
          {
            error: `Failed to connect to custom AI endpoint (${endpoint}): ${fetchErr?.message || 'Network error'}`,
          },
          { status: 502 }
        );
      }
    }

    // --- 2. Google Gemini Provider Flow (with Streaming + Retry) ---
    const apiKey =
      config.geminiApiKey ||
      config.apiKey ||
      '';

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'Google Gemini API Key is missing. Please set your API key in Settings.',
        },
        { status: 400 }
      );
    }

    const requestedModel = config.geminiModel || 'gemini-3.7-flash';

    const validImages = images ? images.filter((img: any) => img && img.data && typeof img.data === 'string' && img.data.length > 50) : [];
    const imageCount = validImages.filter((img: any) => img.mimeType?.startsWith('image/')).length;
    const isReasoningDisabled = config.enableReasoning === false || config.thinkingBudget === 0;

    let effectivePrompt = prompt;
    if (isReasoningDisabled) {
      effectivePrompt = `[FAST RESPONSE MODE: Do NOT output internal thoughts, reasoning steps, or <think> tags. Provide the final response directly and concisely.]\n\n${effectivePrompt}`;
    }
    if (imageCount > 0) {
      effectivePrompt = `[CLINICAL ATTACHMENTS: ${imageCount} medical document/image page(s) attached. Thoroughly examine and extract all visible findings, lab test parameters, numerical values, reference ranges, patient demographics, and clinical text directly from the attached visual image(s) to formulate the comprehensive response.]\n\n${effectivePrompt}`;
    }

    const contents: any[] = [];
    if (validImages.length > 0) {
      for (const img of validImages) {
        contents.push({
          inlineData: {
            data: img.data,
            mimeType: img.mimeType || 'image/jpeg',
          },
        });
      }
    }
    contents.push({ text: effectivePrompt });

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const genConfig: any = {};
      if (isReasoningDisabled) {
        genConfig.thinkingConfig = { thinkingBudget: 0 };
      } else {
        const supportsThinking = isThinkingModel(requestedModel);
        if (supportsThinking) {
          const userBudget = config.thinkingBudget;
          if (typeof userBudget === 'number' && userBudget > 0) {
            genConfig.thinkingConfig = { thinkingBudget: userBudget, includeThoughts: true };
          } else {
            // Default thinking budget with thoughts enabled for Gemini thinking models
            genConfig.thinkingConfig = { thinkingBudget: 2048, includeThoughts: true };
          }
        }
      }

      let responseStream;
      try {
        responseStream = await ai.models.generateContentStream({
          model: requestedModel,
          contents,
          config: Object.keys(genConfig).length > 0 ? genConfig : undefined,
        });
      } catch (initialErr: any) {
        const errMsg = (initialErr?.message || '').toLowerCase();
        if (genConfig.thinkingConfig && (errMsg.includes('thinking') || errMsg.includes('unsupported') || errMsg.includes('invalid_argument') || errMsg.includes('400'))) {
          responseStream = await ai.models.generateContentStream({
            model: requestedModel,
            contents,
            config: undefined,
          });
        } else {
          throw initialErr;
        }
      }

      let fullText = '';
      let fullThought = '';

      for await (const chunk of responseStream) {
        const candidate = chunk.candidates?.[0];
        const parts = candidate?.content?.parts;

        if (parts && parts.length > 0) {
          for (const part of parts) {
            const isThoughtPart =
              (part as any).thought === true ||
              typeof (part as any).thought === 'string' ||
              (part as any).type === 'thought' ||
              (part as any).thoughtSummary !== undefined;

            if (isThoughtPart) {
              const tContent =
                part.text ||
                (typeof (part as any).thought === 'string' ? (part as any).thought : '') ||
                (typeof (part as any).thoughtSummary === 'string' ? (part as any).thoughtSummary : '');
              fullThought += tContent;
            } else if (part.text) {
              fullText += part.text;
            }
          }
        } else if (chunk.text) {
          fullText += chunk.text;
        }
      }

      // Parse inline <think> tags if model outputted them into fullText
      if (fullText && (fullText.includes('<think') || fullText.includes('<thought') || fullText.includes('<reasoning'))) {
        const thinkRegex = /<(?:think|thought|reasoning)>([\s\S]*?)<\/(?:think|thought|reasoning)>/gi;
        let m: RegExpExecArray | null;
        while ((m = thinkRegex.exec(fullText)) !== null) {
          if (m[1]) {
            fullThought += (fullThought ? '\n' : '') + m[1].trim();
          }
        }
        fullText = fullText.replace(thinkRegex, '');
      }

      if (fullText.trim().length > 0) {
        return NextResponse.json({
          text: fullText,
          thought: fullThought || undefined,
          modelUsed: requestedModel,
        });
      }

      return NextResponse.json(
        {
          error: 'Model produced an empty response. Please try with a different prompt or model.',
        },
        { status: 500 }
      );
    } catch (err: any) {
      const { message, statusCode } = parseGoogleErrorMessage(err);
      console.error(`Gemini API Route Error (${requestedModel}):`, message);
      return NextResponse.json(
        {
          error: message,
          rawError: err?.message || String(err || ''),
        },
        { status: statusCode }
      );
    }
  } catch (error: any) {
    console.error('Unhandled AI API Route Error:', error);
    return NextResponse.json(
      {
        error: error?.message || 'An unexpected internal error occurred while processing the clinical question.',
      },
      { status: 500 }
    );
  }
}
