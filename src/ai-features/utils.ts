/**
 * Utility functions for AI features
 * Handles GPT-5 compatibility
 */

/**
 * Get the correct token parameter name based on model
 */
export function getTokenParam(model: string | undefined, tokens: number) {
  const isGpt5 = model === 'gpt-5';
  return isGpt5 
    ? { max_tokens: tokens }
    : { max_tokens: tokens };
}

/**
 * Create OpenAI chat completion parameters with GPT-5 compatibility
 */
export function createChatParams(params: {
  model: string;
  temperature?: number;
  maxTokens?: number;
  messages: any[];
}) {
  return {
    model: params.model,
    temperature: params.temperature || 1,
    ...getTokenParam(params.model, params.maxTokens || 500),
    messages: params.messages
  };
}