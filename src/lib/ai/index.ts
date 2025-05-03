// src/lib/ai/index.ts
import { generateCodeWithOpenAI } from "./openai"
import { generateCodeWithDeepSeek } from "./deepseek"
import { ParsedFile } from "./utils"; // Import the interface

interface GenerateCodeParams {
  prompt: string
  model: string // Model name like "gpt-4", "gpt-3.5-turbo", "deepseek-coder"
}

// Central function updated to return ParsedFile[]
export async function generateCode({ prompt, model }: GenerateCodeParams): Promise<ParsedFile[]> {
  console.log(`Attempting code generation with model: ${model}`) 

  try {
    if (model.startsWith("gpt-")) {
      const openAIModel = model as "gpt-4" | "gpt-3.5-turbo"
      return await generateCodeWithOpenAI({ prompt, model: openAIModel })
    } else if (model.startsWith("deepseek-")) {
      return await generateCodeWithDeepSeek({ prompt, model })
    } else {
      console.warn(`Unsupported model specified: ${model}. Falling back to gpt-3.5-turbo.`)
      try {
        return await generateCodeWithOpenAI({ prompt, model: "gpt-3.5-turbo" })
      } catch (fallbackError) {
         console.error("Fallback model gpt-3.5-turbo also failed:", fallbackError)
         throw new Error(`Unsupported model: ${model} and fallback failed.`) 
      }
    }
  } catch (error) {
    console.error(`Error during code generation with model ${model}:`, error)
    // Simple fallback: Try the other provider if one fails
    if (model.startsWith("gpt-")) {
      console.log("OpenAI failed, attempting fallback to DeepSeek...")
      try {
        // Ensure fallback model exists and is appropriate
        return await generateCodeWithDeepSeek({ prompt, model: "deepseek-coder" })
      } catch (fallbackError) {
        console.error("DeepSeek fallback failed:", fallbackError)
        throw new Error(`Primary model ${model} and DeepSeek fallback failed.`) 
      }
    } else if (model.startsWith("deepseek-")) {
       console.log("DeepSeek failed, attempting fallback to OpenAI...")
       try {
         // Ensure fallback model exists and is appropriate
         return await generateCodeWithOpenAI({ prompt, model: "gpt-3.5-turbo" })
       } catch (fallbackError) {
         console.error("OpenAI fallback failed:", fallbackError)
         throw new Error(`Primary model ${model} and OpenAI fallback failed.`) 
       }
    }
    // If it wasn't an OpenAI or DeepSeek model initially, or if fallback also failed
    throw error // Re-throw the original or fallback error
  }
}

// Re-exporting the prompt creation function for convenience
export { createProjectGenerationPrompt } from "./openai"
// Re-exporting the parser utility and interface
export { parseGeneratedFiles, type ParsedFile } from "./utils";

