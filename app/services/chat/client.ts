import { createGeminiClient, type LLMClient } from "agents-ai";

const DEFAULT_MODEL = "gemini-flash-latest";

export function createAglamazoLLMClient(): LLMClient {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_GEMINI_API_KEY is not set");
  }
  return createGeminiClient({
    apiKey,
    model: DEFAULT_MODEL,
  });
}
