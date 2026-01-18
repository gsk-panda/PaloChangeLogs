import { GoogleGenAI } from "@google/genai";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY not found in environment variables");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const analyzeChange = async (
  description: string,
  before: string,
  after: string
): Promise<string> => {
  const ai = getAiClient();
  if (!ai) {
    return "API Key is missing. Please configure your environment to use AI features.";
  }

  const prompt = `
    You are a Senior Network Security Engineer auditing Palo Alto Panorama configuration changes.
    
    Context:
    A configuration change was made at path: "${description}".
    
    Task:
    Analyze the following configuration preview (Before vs After) and provide a concise summary.
    1. Explain what changed in plain English.
    2. Assess the potential security impact (Risk Level: Low/Medium/High).
    3. If there are red flags (e.g., opening "any" to "any", removing authentication), highlight them explicitly.

    Before:
    \`\`\`xml
    ${before}
    \`\`\`

    After:
    \`\`\`xml
    ${after}
    \`\`\`

    Output format:
    Please provide the response in clean Markdown. Keep it brief and professional.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "No analysis could be generated.";
  } catch (error) {
    console.error("Error analyzing change with Gemini:", error);
    return "Failed to analyze change due to an API error.";
  }
};