// src/lib/ai/deepseek.ts
import OpenAI from "openai"
import { parseGeneratedFiles, ParsedFile } from "./utils"; // Import helper

// DeepSeek API is OpenAI compatible, so we can use the OpenAI client
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com/v1", // Specific endpoint for DeepSeek
})

interface GenerateCodeParams {
  prompt: string
  model?: string // DeepSeek has specific model names like 'deepseek-coder'
}

// Updated function to generate code using DeepSeek and expect structured file output
export async function generateCodeWithDeepSeek({ prompt, model = "deepseek-coder" }: GenerateCodeParams): Promise<ParsedFile[]> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("DeepSeek API key is not configured.")
  }

  try {
    console.log(`Calling DeepSeek with model: ${model}`) // Log model being used
    const completion = await deepseek.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are an expert software engineer. Generate the full code for the requested project based on the user prompt. 
          Output each file's content enclosed within specific markers:
          --- START FILE: path/to/your/file.ext ---
          (Your file content here)
          --- END FILE: path/to/your/file.ext ---
          Ensure the path is relative to the project root. Include all necessary files (package.json, config files, source code, etc.). Do not include any other text, explanations, or introductions outside these markers. The file path must be present and correct in both START and END markers.`,
        },
        { role: "user", content: prompt },
      ],
      model: model,
      // Consider increasing max_tokens if projects are large
      // max_tokens: 4096, 
    })

    const content = completion.choices[0]?.message?.content

    if (!content) {
      throw new Error("DeepSeek returned empty content.")
    }

    console.log("DeepSeek call successful, parsing content...")
    const files = parseGeneratedFiles(content); // Use helper to parse
    if (files.length === 0) {
        console.warn("DeepSeek response parsed, but no files were extracted. Raw content:", content.substring(0, 500));
        throw new Error("Failed to parse files from DeepSeek response. The response might not be in the expected format.");
    }
    console.log(`Parsed ${files.length} files from DeepSeek response.`);
    return files;

  } catch (error) {
    console.error("Error calling DeepSeek API or parsing response:", error)
    throw new Error(`Failed to generate code using DeepSeek: ${error instanceof Error ? error.message : String(error)}`)
  }
}

