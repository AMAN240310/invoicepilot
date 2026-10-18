import { config } from '../config/index.js';

export interface OllamaModelInfo {
  name: string;
  size: number;
  modified_at: string;
}

export interface OllamaHealthStatus {
  isAvailable: boolean;
  baseUrl: string;
  selectedModel: string;
  availableModels: string[];
  error?: string;
}

export interface OllamaGenerateResponse {
  response: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaService {
  /**
   * Checks connectivity to Ollama and discovers installed models
   */
  static async checkHealth(): Promise<OllamaHealthStatus> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(`${config.ollama.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          isAvailable: false,
          baseUrl: config.ollama.baseUrl,
          selectedModel: config.ollama.model,
          availableModels: [],
          error: `Ollama returned HTTP status ${response.status}`,
        };
      }

      const data = (await response.json()) as { models?: Array<{ name: string; size: number }> };
      const modelNames = (data.models || []).map((m) => m.name);

      return {
        isAvailable: true,
        baseUrl: config.ollama.baseUrl,
        selectedModel: config.ollama.model,
        availableModels: modelNames,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isAvailable: false,
        baseUrl: config.ollama.baseUrl,
        selectedModel: config.ollama.model,
        availableModels: [],
        error: message.includes('abort')
          ? 'Connection timed out connecting to Ollama'
          : `Ollama service unreachable at ${config.ollama.baseUrl} (${message})`,
      };
    }
  }

  /**
   * Generates a completion using Ollama's local HTTP API with JSON structured output
   */
  static async generateJson(
    prompt: string,
    systemPrompt: string,
    modelOverride?: string
  ): Promise<{ success: boolean; rawText: string; error?: string }> {
    const modelToUse = modelOverride || config.ollama.model;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.ollama.timeoutMs);

      const response = await fetch(`${config.ollama.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelToUse,
          prompt,
          system: systemPrompt,
          format: 'json',
          stream: false,
          options: {
            temperature: 0.1, // Deterministic extraction
            top_p: 0.9,
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          rawText: '',
          error: `Ollama request failed with status ${response.status}: ${errorText}`,
        };
      }

      const data = (await response.json()) as OllamaGenerateResponse;
      return {
        success: true,
        rawText: data.response || '',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        rawText: '',
        error: message.includes('abort')
          ? `Ollama inference timed out after ${config.ollama.timeoutMs}ms`
          : `Ollama request error: ${message}`,
      };
    }
  }
}
