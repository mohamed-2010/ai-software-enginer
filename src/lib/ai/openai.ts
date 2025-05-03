// src/lib/ai/openai.ts
import OpenAI from "openai"
import { parseGeneratedFiles, ParsedFile } from "./utils"; // Import helper

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface GenerateCodeParams {
  prompt: string
  model?: "gpt-4" | "gpt-3.5-turbo" // Add more models as needed
}

// Updated function to generate code and expect structured file output
export async function generateCodeWithOpenAI({ prompt, model = "gpt-4" }: GenerateCodeParams): Promise<ParsedFile[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured.")
  }

  try {
    console.log(`Calling OpenAI with model: ${model}`) // Log model being used
    const completion = await openai.chat.completions.create({
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
      throw new Error("OpenAI returned empty content.")
    }

    console.log("OpenAI call successful, parsing content...")
    const files = parseGeneratedFiles(content); // Use helper to parse
    if (files.length === 0) {
        console.warn("OpenAI response parsed, but no files were extracted. Raw content:", content.substring(0, 500));
        throw new Error("Failed to parse files from OpenAI response. The response might not be in the expected format.");
    }
    console.log(`Parsed ${files.length} files from OpenAI response.`);
    return files;

  } catch (error) {
    console.error("Error calling OpenAI API or parsing response:", error)
    throw new Error(`Failed to generate code using OpenAI: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Updated prompt function - more detailed instructions for the AI
export function createProjectGenerationPrompt(description: string, stackDetails: string): string {
  return `
    Generate a full-stack project based on the following requirements:

    **Project Description:**
    ${description}

    **Technology Stack:**
    ${stackDetails}

    **Instructions:**
    1.  Create a complete, runnable project structure.
    2.  Include all necessary configuration files (e.g., package.json, tsconfig.json, .env.example, Dockerfile if applicable based on stack).
    3.  Generate placeholder or basic implementations for core features described.
    4.  Ensure code follows standard practices for the specified stack.
    5.  Output *only* the file contents, each enclosed in the specified markers:
        --- START FILE: path/to/file.ext ---
        (File content)
        --- END FILE: path/to/file.ext ---
  `;
}

