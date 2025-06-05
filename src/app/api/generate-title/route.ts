import { createOllama } from "ollama-ai-provider";
import { streamText, convertToCoreMessages } from "ai";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { prompt, selectedModel } = await req.json();

    const ollamaUrl = process.env.OLLAMA_URL;
    const ollama = createOllama({ baseURL: ollamaUrl + "/api" });

    // Use llama3.2 specifically for title generation or fallback to provided model
    const modelToUse = selectedModel || "llama3.2:latest";

    const result = await streamText({
      model: ollama(modelToUse),
      messages: [
        {
          role: "user",
          content: `${prompt}

Please respond with ONLY the title, no additional text, quotes, or explanations. Maximum 6 words.`,
        },
      ],
      maxTokens: 20, // Keep it short for title generation
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Error generating title:", error);
    return new Response("Error generating title", { status: 500 });
  }
}
