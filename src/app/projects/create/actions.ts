// src/app/projects/create/actions.ts
"use server"

import { prisma } from "@/lib/prisma"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { getServerSession } from "next-auth/next"
import { generateCode, createProjectGenerationPrompt } from "@/lib/ai"
import { getUserCreditBalance, deductCredits } from "@/lib/credits"; // Import credit functions
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import path from "path";
import archiver from "archiver";
import { Writable } from "stream";

interface CreateProjectData {
  title: string
  description: string
  stackDetails: string
  aiModelUsed: string
}

// Helper function to ensure file paths are safe
function isPathSafe(filePath: string, baseDir: string): boolean {
  const resolvedPath = path.resolve(baseDir, filePath);
  return resolvedPath.startsWith(baseDir);
}

const PROJECT_GENERATION_COST = 1; // Define credit cost per project

export async function createProjectAction(
  data: CreateProjectData
): Promise<{ error?: string; success?: boolean; projectId?: string }> {
  const session = await getServerSession()
  const userId = session?.user?.id;

  if (!userId) {
    return { error: "User not authenticated" }
  }

  const { title, description, stackDetails, aiModelUsed } = data

  if (!title || !description || !aiModelUsed) {
    return { error: "Missing required project details (title, description, AI model)" }
  }

  let projectId: string | null = null;
  const baseGenerationDir = "/home/ubuntu/generated_projects";

  try {
    // 1. Check user credit balance
    console.log(`[Credit Check] Checking balance for user ${userId}...`);
    const currentBalance = await getUserCreditBalance(userId);
    if (currentBalance < PROJECT_GENERATION_COST) {
      console.log(`[Credit Check] User ${userId}: Insufficient credits. Required: ${PROJECT_GENERATION_COST}, Available: ${currentBalance}`);
      return { error: `Insufficient credits. You need ${PROJECT_GENERATION_COST} credit(s) to generate a project, but you only have ${currentBalance}. Please upgrade your plan or wait for renewal.` };
    }
    console.log(`[Credit Check] User ${userId}: Sufficient credits (${currentBalance}). Proceeding...`);

    // 2. Create initial project record
    const newProject = await prisma.project.create({
      data: {
        userId: userId,
        title,
        description,
        stackDetails,
        aiModelUsed,
        status: "pending", // Initial status
      },
    });
    projectId = newProject.id;
    console.log(`Project record created with ID: ${projectId}`);

    // Update status to generating immediately
    await prisma.project.update({
        where: { id: projectId },
        data: { status: "generating" },
    });
    console.log(`Project ${projectId} status updated to generating`);

    // 3. Trigger the AI generation process (asynchronously)
    // Note: In a real app, this should be offloaded to a background job queue.
    const generationResult = await generateProjectFiles(projectId ?? "", description, stackDetails, aiModelUsed, baseGenerationDir);

    if (generationResult.success && generationResult.zipPath) {
        // 4. Deduct credits *after* successful generation
        console.log(`[Credit Deduction] Attempting to deduct ${PROJECT_GENERATION_COST} credit(s) for user ${userId}, project ${projectId}...`);
        const deductionSuccess = await deductCredits(userId, projectId ?? "", PROJECT_GENERATION_COST);
        if (!deductionSuccess) {
            // This case is tricky: generation succeeded but deduction failed.
            // Log error, maybe flag project for review, but don't fail the user now.
            console.error(`CRITICAL: Project ${projectId} generated successfully, but credit deduction failed for user ${userId}. Manual review required.`);
            // Optionally, update project status to indicate this issue?
            // For now, proceed but log the error.
        } else {
             console.log(`[Credit Deduction] Successfully deducted ${PROJECT_GENERATION_COST} credit(s) for user ${userId}, project ${projectId}.`);
        }

        // 5. Update project record with final status and zip URL
        await prisma.project.update({
            where: { id: projectId },
            data: {
                status: "completed",
                generatedZipUrl: generationResult.zipPath,
            },
        });
        console.log(`Project ${projectId} completed. Zip available at: ${generationResult.zipPath}`);
        return { success: true, projectId: projectId ?? "" };
    } else {
        // Generation failed, no credits deducted.
        throw new Error(generationResult.error || "Unknown generation error");
    }

  } catch (error) {
    console.error(`Error during project creation or generation for project ID ${projectId}:`, error);
    // If an error occurred after project creation, update its status to failed
    if (projectId) {
      try {
        // Ensure status is updated to failed ONLY if it wasn't already completed (edge case)
        const currentProject = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } });
        if (currentProject && currentProject.status !== 'completed') {
            await prisma.project.update({
              where: { id: projectId },
              data: { status: "failed" },
            });
            console.log(`Project ${projectId} status updated to failed`);
        }
      } catch (updateError) {
        console.error(`Failed to update project ${projectId} status to failed:`, updateError);
      }
    }
    // Return specific credit error or generic error
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { error: errorMessage.includes("Insufficient credits") ? errorMessage : `An unexpected error occurred: ${errorMessage}` };
  }
}

// Separate function for the generation logic (remains largely the same)
async function generateProjectFiles(
    projectId: string,
    description: string,
    stackDetails: string,
    aiModelUsed: string,
    baseGenerationDir: string
): Promise<{ success: boolean; zipPath?: string; error?: string }> {
    const projectDir = path.join(baseGenerationDir, projectId);
    const zipPath = path.join(baseGenerationDir, `${projectId}.zip`);

    try {
        console.log(`[${projectId}] Starting AI generation...`);
        const prompt = createProjectGenerationPrompt(description, stackDetails);
        const generatedFiles = await generateCode({ prompt, model: aiModelUsed });
        console.log(`[${projectId}] AI generation completed. Received ${generatedFiles.length} files.`);

        if (generatedFiles.length === 0) {
            throw new Error("AI returned no files. Generation failed.");
        }

        console.log(`[${projectId}] Writing files to ${projectDir}...`);
        await fsPromises.mkdir(projectDir, { recursive: true });

        for (const file of generatedFiles) {
            const filePath = path.join(projectDir, file.path);
            if (!isPathSafe(filePath, projectDir)) {
                console.warn(`[${projectId}] Skipping potentially unsafe file path: ${file.path}`);
                continue;
            }
            const dirName = path.dirname(filePath);
            await fsPromises.mkdir(dirName, { recursive: true });
            await fsPromises.writeFile(filePath, file.content);
        }
        console.log(`[${projectId}] Finished writing files.`);

        console.log(`[${projectId}] Creating ZIP archive at ${zipPath}...`);
        await new Promise<void>((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver("zip", { zlib: { level: 9 } });
            output.on("close", () => {
                console.log(`[${projectId}] ZIP archive created successfully: ${archive.pointer()} total bytes`);
                resolve();
            });
            archive.on("warning", (err) => {
                if (err.code === "ENOENT") console.warn(`[${projectId}] Archiver warning:`, err);
                else reject(err);
            });
            archive.on("error", (err) => reject(err));
            archive.pipe(output);
            archive.directory(projectDir, false);
            archive.finalize();
        });

        try {
            console.log(`[${projectId}] Cleaning up temporary directory ${projectDir}...`);
            await fsPromises.rm(projectDir, { recursive: true, force: true });
            console.log(`[${projectId}] Temporary directory cleaned up.`);
        } catch (cleanupError) {
            console.warn(`[${projectId}] Failed to clean up temporary directory ${projectDir}:`, cleanupError);
        }

        return { success: true, zipPath: zipPath };

    } catch (error) {
        console.error(`[${projectId}] Error during file generation/zipping:`, error);
        try { await fsPromises.rm(projectDir, { recursive: true, force: true }); } catch (_) {}
        try { await fsPromises.unlink(zipPath); } catch (_) {}
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

