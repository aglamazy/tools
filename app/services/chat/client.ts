import { createGeminiClient, type LLMClient } from "agents-ai";

const DEFAULT_MODEL = "gemini-flash-latest";

export function createAglamazoLLMClient(): LLMClient {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return createGeminiClient({
    apiKey,
    model: DEFAULT_MODEL,
  });
}
