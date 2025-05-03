// src/lib/ai/utils.ts

export interface ParsedFile {
  path: string;
  content: string;
}

// Helper function to parse AI response content into structured files
export function parseGeneratedFiles(rawContent: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  const fileRegex = /--- START FILE: (.*?) ---\s*\n([\s\S]*?)\n\s*--- END FILE: \1 ---/g;
  let match;

  console.log("Parsing raw AI content...");

  while ((match = fileRegex.exec(rawContent)) !== null) {
    const path = match[1].trim();
    const content = match[2].trim(); // Trim whitespace around content

    if (path && content) {
      console.log(`Extracted file: ${path}`);
      files.push({ path, content });
    } else {
      console.warn(`Found potential file block but path or content was empty. Path: '${path}'`);
    }
  }

  if (files.length === 0) {
    console.warn("No files extracted. Check AI response format. Raw content snippet:", rawContent.substring(0, 500));
  }

  console.log(`Parsing complete. Found ${files.length} files.`);
  return files;
}

