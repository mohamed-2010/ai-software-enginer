// src/lib/ai/__tests__/utils.test.ts
import { parseGeneratedFiles, ParsedFile } from "../utils";

describe("parseGeneratedFiles", () => {
  it("should parse a single file correctly", () => {
    const rawContent = `
Some introductory text.
--- START FILE: src/index.js ---
console.log("Hello");
--- END FILE: src/index.js ---
Some trailing text.
    `;
    const expected: ParsedFile[] = [
      { path: "src/index.js", content: "console.log(\"Hello\");" },
    ];
    expect(parseGeneratedFiles(rawContent)).toEqual(expected);
  });

  it("should parse multiple files correctly", () => {
    const rawContent = `
--- START FILE: package.json ---
{
  "name": "test-app"
}
--- END FILE: package.json ---
Some text in between.
--- START FILE: src/app.js ---
function main() {}
--- END FILE: src/app.js ---
    `;
    const expected: ParsedFile[] = [
      { path: "package.json", content: "{\n  \"name\": \"test-app\"\n}" },
      { path: "src/app.js", content: "function main() {}" },
    ];
    expect(parseGeneratedFiles(rawContent)).toEqual(expected);
  });

  it("should handle files with varying whitespace and newlines", () => {
    const rawContent = `--- START FILE: config.txt ---  \n   key=value\n   another=pair  \n--- END FILE: config.txt ---`;
    const expected: ParsedFile[] = [
      { path: "config.txt", content: "key=value\n   another=pair" },
    ];
    expect(parseGeneratedFiles(rawContent)).toEqual(expected);
  });

  it("should return an empty array if no valid file markers are found", () => {
    const rawContent = `Just some random text without any file markers.`;
    expect(parseGeneratedFiles(rawContent)).toEqual([]);
  });

  it("should ignore incomplete or mismatched markers", () => {
    const rawContent = `
--- START FILE: file1.txt ---
Content 1
--- END FILE: file1.txt ---
--- START FILE: file2.txt ---
Content 2
--- END FILE: file_WRONG.txt ---
--- START FILE: file3.txt ---
Content 3
--- END FILE: file3.txt ---
    `;
    const expected: ParsedFile[] = [
      { path: "file1.txt", content: "Content 1" },
      { path: "file3.txt", content: "Content 3" },
    ];
    // The regex requires matching start/end paths, so file2 is ignored.
    expect(parseGeneratedFiles(rawContent)).toEqual(expected);
  });

  it("should handle empty file content correctly", () => {
    const rawContent = `--- START FILE: empty.txt ---\n--- END FILE: empty.txt ---`;
    const expected: ParsedFile[] = [
      { path: "empty.txt", content: "" }, // Content is empty string
    ];
    expect(parseGeneratedFiles(rawContent)).toEqual(expected);
  });

  it("should handle empty input string", () => {
    const rawContent = "";
    expect(parseGeneratedFiles(rawContent)).toEqual([]);
  });

  it("should handle paths with special characters (if regex allows)", () => {
    // Current regex `(.*?)` is quite permissive.
    const rawContent = `--- START FILE: path/with spaces/file name.ext ---\nContent
--- END FILE: path/with spaces/file name.ext ---`;
    const expected: ParsedFile[] = [
      { path: "path/with spaces/file name.ext", content: "Content" },
    ];
    expect(parseGeneratedFiles(rawContent)).toEqual(expected);
  });
});

