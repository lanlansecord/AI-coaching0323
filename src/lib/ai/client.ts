import OpenAI from 'openai';

// Provider-neutral AI client using OpenAI-compatible API
// Works with: OpenAI, Anthropic (via proxy), DeepSeek, Moonshot, etc.
function createAIClient(): OpenAI {
  const apiKey = process.env.AI_API_KEY;
  const baseURL = process.env.AI_API_BASE || undefined;

  if (!apiKey) {
    throw new Error('AI_API_KEY environment variable is required');
  }

  return new OpenAI({
    apiKey,
    baseURL,
  });
}

let clientInstance: OpenAI | null = null;

export function getAIClient(): OpenAI {
  if (!clientInstance) {
    clientInstance = createAIClient();
  }
  return clientInstance;
}

export function getModel(): string {
  return process.env.AI_MODEL || 'gpt-4o-mini';
}
