import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

function parseGoogleErrorMessage(err: any): { message: string; statusCode: number; isFatal: boolean } {
  const raw = err?.message || String(err || '');
  const rawLower = raw.toLowerCase();

  if (rawLower.includes('api_key_invalid') || rawLower.includes('api key not valid') || rawLower.includes('invalid api key')) {
    return {
      message: 'Invalid Google Gemini API Key. Please verify your API key in Settings.',
      statusCode: 401,
      isFatal: true,
    };
  }
  if (rawLower.includes('quota') || rawLower.includes('resource_exhausted') || rawLower.includes('429')) {
    return {
      message: 'Gemini API Rate Limit / Quota Exceeded (429). Please wait a few seconds before trying again.',
      statusCode: 429,
      isFatal: true,
    };
  }
  if (rawLower.includes('permission_denied') || rawLower.includes('403')) {
    return {
      message: 'Gemini API Permission Denied (403). Your API key does not have access to this feature.',
      statusCode: 403,
      isFatal: true,
    };
  }
  if (rawLower.includes('safety') || rawLower.includes('blocked')) {
    return {
      message: 'The AI request was filtered by safety policies. Please clarify the clinical phrasing.',
      statusCode: 422,
      isFatal: true,
    };
  }
  return {
    message: raw.length > 300 ? raw.slice(0, 300) + '...' : raw,
    statusCode: 500,
    isFatal: false,
  };
}

/**
 * Robust streaming filter that tracks open/close thinking tags and pre-JSON thought blocks across arbitrary chunk boundaries,
 * ensuring no reasoning text or broken tag artifacts ever leak into the client text stream.
 */
class StreamingThoughtExtractor {
  private insideThink: boolean = false;
  private buffer: string = '';
  private isJsonMode: boolean = false;
  private hasSeenJsonStart: boolean = false;

  constructor(isJsonMode: boolean = false) {
    this.isJsonMode = isJsonMode;
  }

  private readonly OPEN_TAGS = [
    '<think>',
    '<thought>',
    '<reasoning>',
    '<antthinking>',
    '<reflection>',
    '<internal_thought>',
    '[thinking]',
    '[reasoning]',
    '[thought]',
  ];

  private readonly CLOSE_TAGS = [
    '</think>',
    '</thought>',
    '</reasoning>',
    '</antthinking>',
    '</reflection>',
    '</internal_thought>',
    '[/thinking]',
    '[/reasoning]',
    '[/thought]',
  ];

  public feed(chunkText: string): { text: string; thinking: string } {
    if (!chunkText) return { text: '', thinking: '' };

    let current = this.buffer + chunkText;
    this.buffer = '';

    let outText = '';
    let outThinking = '';

    while (current.length > 0) {
      if (this.insideThink) {
        let earliestIdx = -1;
        let matchedTagLen = 0;

        const lowerCurrent = current.toLowerCase();
        for (const tag of this.CLOSE_TAGS) {
          const idx = lowerCurrent.indexOf(tag);
          if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
            earliestIdx = idx;
            matchedTagLen = tag.length;
          }
        }

        if (earliestIdx !== -1) {
          outThinking += current.slice(0, earliestIdx);
          current = current.slice(earliestIdx + matchedTagLen);
          this.insideThink = false;
        } else {
          // Check if the tail looks like an incomplete closing tag (e.g. "</th" or "[/th")
          const partialMatch = current.match(/(?:<\/?[a-z_]*|\[\/?(?:thinking|reasoning|thought)?)$/i);
          if (partialMatch && partialMatch[0].length < 20) {
            outThinking += current.slice(0, partialMatch.index);
            this.buffer = partialMatch[0];
            current = '';
          } else {
            outThinking += current;
            current = '';
          }
        }
      } else {
        let earliestIdx = -1;
        let matchedTagLen = 0;

        const lowerCurrent = current.toLowerCase();
        for (const tag of this.OPEN_TAGS) {
          const idx = lowerCurrent.indexOf(tag);
          if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
            earliestIdx = idx;
            matchedTagLen = tag.length;
          }
        }

        if (earliestIdx !== -1) {
          outText += current.slice(0, earliestIdx);
          current = current.slice(earliestIdx + matchedTagLen);
          this.insideThink = true;
        } else {
          // Check if the tail looks like an incomplete opening tag (e.g. "<th" or "<" or "[th")
          const partialMatch = current.match(/(?:<[a-z_]*|\[(?:thinking|reasoning|thought)?)$/i);
          if (partialMatch && partialMatch[0].length < 20) {
            outText += current.slice(0, partialMatch.index);
            this.buffer = partialMatch[0];
            current = '';
          } else {
            outText += current;
            current = '';
          }
        }
      }
    }

    return { text: outText, thinking: outThinking };
  }

  public flush(): { text: string; thinking: string } {
    const leftover = this.buffer;
    this.buffer = '';
    if (!leftover) return { text: '', thinking: '' };
    if (this.insideThink) {
      return { text: '', thinking: leftover };
    }
    return { text: leftover, thinking: '' };
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

  // Anthropic direct API
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
      return new Response(JSON.stringify({ error: 'Prompt is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const encoder = new TextEncoder();

    // 1. Custom Provider Streaming (OpenAI-compatible)
    if (config.provider === 'custom') {
      const endpoint = normalizeCustomEndpoint(config.customEndpoint || '');
      if (!endpoint) {
        return new Response(JSON.stringify({ error: 'Custom LLM endpoint is not configured. Please set your endpoint in Settings.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const key = config.customApiKey || config.apiKey;
      if (key) headers['Authorization'] = `Bearer ${key}`;

      const isReasoningDisabled = config.enableReasoning === false || config.thinkingBudget === 0;

      const imageCount = images ? images.filter((i: any) => i.mimeType?.startsWith('image/')).length : 0;
      let augmentedPrompt = prompt;
      if (isReasoningDisabled) {
        augmentedPrompt = `[FAST RESPONSE MODE: Do NOT output any internal chain of thought, reasoning steps, or <think> tags. Provide the final clinical response directly and concisely.]\n\n${augmentedPrompt}`;
      }
      if (imageCount > 0) {
        augmentedPrompt = `[CLINICAL ATTACHMENTS: ${imageCount} medical document/image page(s) attached. Inspect and analyze all visible findings, lab parameters, test results, numbers, and clinical text directly from the attached visual image(s).]\n\n${augmentedPrompt}`;
      }

      const contentParts: any[] = [{ type: 'text', text: augmentedPrompt }];
      if (images && images.length > 0) {
        for (const img of images) {
          if (img.data && img.mimeType?.startsWith('image/')) {
            contentParts.push({
              type: 'image_url',
              image_url: { url: `data:${img.mimeType};base64,${img.data}` },
            });
          }
        }
      }

      const isOpenRouter = endpoint.toLowerCase().includes('openrouter.ai');
      const isOpenAi = endpoint.toLowerCase().includes('api.openai.com');
      const isAnthropic = endpoint.toLowerCase().includes('anthropic.com');
      const modelName = (config.customModel || 'gpt-4o').toLowerCase();

      const payload: any = {
        model: config.customModel || 'gpt-4o',
        messages: [{ role: 'user', content: contentParts.length === 1 ? augmentedPrompt : contentParts }],
        temperature: 0.2,
        stream: true,
      };

      if (isReasoningDisabled) {
        if (isOpenRouter) {
          payload.reasoning = { effort: 'none', exclude: true };
        } else if (isOpenAi && (modelName.startsWith('o1') || modelName.startsWith('o3'))) {
          payload.reasoning_effort = 'low';
        } else if (isAnthropic && modelName.includes('claude-3-7')) {
          payload.thinking = { type: 'disabled' };
        }
      } else {
        if (isOpenRouter) {
          payload.reasoning = { effort: 'medium' };
        } else if (isOpenAi && (modelName.startsWith('o1') || modelName.startsWith('o3'))) {
          payload.reasoning_effort = 'medium';
        }
      }

      let upstreamRes = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      // If the upstream endpoint rejected the reasoning configuration (e.g. 400 invalid option, unrecognized field), retry without reasoning params
      if (!upstreamRes.ok && upstreamRes.status === 400 && (payload.reasoning || payload.reasoning_effort || payload.thinking)) {
        const testErrText = await upstreamRes.text().catch(() => '');
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

          upstreamRes = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(cleanPayload),
          });
        } else {
          // Reconstruct response if error was not reasoning-related
          upstreamRes = new Response(testErrText, {
            status: upstreamRes.status,
            headers: upstreamRes.headers,
          });
        }
      }

      if (!upstreamRes.ok || !upstreamRes.body) {
        const errText = await upstreamRes.text().catch(() => 'Custom endpoint error');
        let errorMsg = `Custom endpoint error (${upstreamRes.status}): ${errText}`;
        const errLower = errText.toLowerCase();
        if (
          errLower.includes('does not support image') ||
          errLower.includes('only text') ||
          errLower.includes('vision') ||
          errLower.includes('must be a string') ||
          errLower.includes('gptoss120b') ||
          errLower.includes('gpt-oss-120b') ||
          errLower.includes('unprocessable')
        ) {
          errorMsg = `The selected model (${payload.model}) does not support image inputs on OpenRouter. Please select a multimodal/vision model (such as Gemini 2.5 Flash, GPT-4o, Claude 3.7 Sonnet, or Llama 3.2 Vision) in Settings when uploading medical images.`;
        }
        return new Response(JSON.stringify({ error: errorMsg }), {
          status: upstreamRes.status >= 400 && upstreamRes.status < 600 ? upstreamRes.status : 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'connected', modelUsed: payload.model })}\n\n`));
          const reader = upstreamRes.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          const thoughtExtractor = new StreamingThoughtExtractor();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;
                if (trimmed === 'data: [DONE]') {
                  const flushed = thoughtExtractor.flush();
                  if (flushed.text || flushed.thinking) {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ text: flushed.text, thinking: flushed.thinking, modelUsed: payload.model })}\n\n`
                      )
                    );
                  }
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, modelUsed: payload.model })}\n\n`));
                  continue;
                }
                try {
                  const jsonStr = trimmed.replace(/^data:\s*/, '');
                  const parsed = JSON.parse(jsonStr);
                  const delta = parsed.choices?.[0]?.delta || {};
                  const content = delta.content || '';
                  const explicitReasoning = delta.reasoning_content || delta.reasoning || delta.thought || delta.thinking || '';

                  let extractedText = '';
                  let extractedThinking = explicitReasoning;

                  if (content) {
                    const filtered = thoughtExtractor.feed(content);
                    extractedText += filtered.text;
                    if (filtered.thinking) {
                      extractedThinking += (extractedThinking ? '\n' : '') + filtered.thinking;
                    }
                  }

                  if (extractedText || extractedThinking) {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ text: extractedText, thinking: extractedThinking, modelUsed: payload.model })}\n\n`
                      )
                    );
                  }
                } catch {
                  // ignore partial JSON
                }
              }
            }

            const flushed = thoughtExtractor.flush();
            if (flushed.text || flushed.thinking) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ text: flushed.text, thinking: flushed.thinking, modelUsed: payload.model })}\n\n`
                )
              );
            }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, modelUsed: payload.model })}\n\n`));
            controller.close();
          } catch (err: any) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err?.message || 'Stream error' })}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform, no-store, must-revalidate',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          'Content-Encoding': 'none',
        },
      });
    }

    // 2. Google Gemini Streaming Flow
    const apiKey =
      config.geminiApiKey ||
      config.apiKey ||
      '';

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Google Gemini API Key is missing. Please set your API key in Settings.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
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

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'connected', modelUsed: requestedModel })}\n\n`));

        try {
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          // Build generation config
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
                // Default thinking budget to enable Chain of Thought streaming
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
            // If initial attempt failed with thinkingConfig unsupported error, retry without thinkingConfig
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

          let chunksReceived = 0;
          const thoughtExtractor = new StreamingThoughtExtractor();

          for await (const chunk of responseStream) {
            const candidate = chunk.candidates?.[0];
            const parts = candidate?.content?.parts;

            let textChunk = '';
            let directThinkingChunk = '';

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
                  if (tContent) directThinkingChunk += tContent;
                } else if (part.text) {
                  textChunk += part.text;
                }
              }
            } else if (chunk.text) {
              textChunk = chunk.text;
            }

            // Filter any embedded <think> tags in standard text parts
            let filteredText = '';
            let filteredThinking = directThinkingChunk;

            if (textChunk) {
              const filtered = thoughtExtractor.feed(textChunk);
              filteredText += filtered.text;
              if (filtered.thinking) {
                filteredThinking += (filteredThinking ? '\n' : '') + filtered.thinking;
              }
            }

            if (filteredText || filteredThinking) {
              chunksReceived++;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: filteredText, thinking: filteredThinking, modelUsed: requestedModel, status: 'streaming' })}\n\n`)
              );
            }
          }

          const flushed = thoughtExtractor.flush();
          if (flushed.text || flushed.thinking) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ text: flushed.text, thinking: flushed.thinking, modelUsed: requestedModel, status: 'streaming' })}\n\n`
              )
            );
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, modelUsed: requestedModel })}\n\n`));
          controller.close();
        } catch (err: any) {
          const { message } = parseGoogleErrorMessage(err);
          console.error(`Gemini Streaming API Error (${requestedModel}):`, message);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message, done: true })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Content-Encoding': 'none',
      },
    });
  } catch (error: any) {
    console.error('Unhandled Streaming Route Error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Streaming server error.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
