// src/app/actions/projectActions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getServerSession } from "next-auth/next";
import { getUserCreditBalance, deductCredits } from "@/lib/credits";
// Import the generation function from the create actions (or refactor it to a shared location)
// For now, let's assume it's accessible or we duplicate/refactor later.
// We need a way to call the core generation logic. Let's import the necessary parts.
import { generateCode, createProjectGenerationPrompt } from "@/lib/ai";
import fs from "fs/promises";
import path from "path";
import archiver from "archiver";

const PROJECT_REGENERATION_COST = 1; // Define credit cost for regeneration
const baseGenerationDir = "/home/ubuntu/generated_projects"; // Should match create action

// Helper function to ensure file paths are safe (duplicate from create actions - refactor needed)
function isPathSafe(filePath: string, baseDir: string): boolean {
  const resolvedPath = path.resolve(baseDir, filePath);
  return resolvedPath.startsWith(baseDir);
}

// Refactored/Duplicated generation logic - Ideally move to a shared service
async function generateProjectFilesForRegen(
    projectId: string,
    description: string,
    stackDetails: string,
    aiModelUsed: string,
    baseGenerationDir: string
): Promise<{ success: boolean; zipPath?: string; error?: string }> {
    const projectDir = path.join(baseGenerationDir, `${projectId}_regen_${Date.now()}`); // Temp dir for regen
    const zipPath = path.join(baseGenerationDir, `${projectId}.zip`); // Overwrite existing zip

    try {
        console.log(`[${projectId}-Regen] Starting AI generation...`);
        const prompt = createProjectGenerationPrompt(description, stackDetails);
        const generatedFiles = await generateCode({ prompt, model: aiModelUsed });
        console.log(`[${projectId}-Regen] AI generation completed. Received ${generatedFiles.length} files.`);

        if (generatedFiles.length === 0) {
            throw new Error("AI returned no files. Regeneration failed.");
        }

        console.log(`[${projectId}-Regen] Writing files to ${projectDir}...`);
        await fs.mkdir(projectDir, { recursive: true });

        for (const file of generatedFiles) {
            const filePath = path.join(projectDir, file.path);
            if (!isPathSafe(filePath, projectDir)) {
                console.warn(`[${projectId}-Regen] Skipping potentially unsafe file path: ${file.path}`);
                continue;
            }
            const dirName = path.dirname(filePath);
            await fs.mkdir(dirName, { recursive: true });
            await fs.writeFile(filePath, file.content);
        }
        console.log(`[${projectId}-Regen] Finished writing files.`);

        // Ensure old zip is removed before creating new one
        try { await fs.unlink(zipPath); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }

        console.log(`[${projectId}-Regen] Creating ZIP archive at ${zipPath}...`);
        await new Promise<void>((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver("zip", { zlib: { level: 9 } });
            output.on("close", () => {
                console.log(`[${projectId}-Regen] ZIP archive created successfully: ${archive.pointer()} total bytes`);
                resolve();
            });
            archive.on("warning", (err) => {
                if (err.code === "ENOENT") console.warn(`[${projectId}-Regen] Archiver warning:`, err);
                else reject(err);
            });
            archive.on("error", (err) => reject(err));
            archive.pipe(output);
            archive.directory(projectDir, false);
            archive.finalize();
        });

        try {
            console.log(`[${projectId}-Regen] Cleaning up temporary directory ${projectDir}...`);
            await fs.rm(projectDir, { recursive: true, force: true });
            console.log(`[${projectId}-Regen] Temporary directory cleaned up.`);
        } catch (cleanupError) {
            console.warn(`[${projectId}-Regen] Failed to clean up temporary directory ${projectDir}:`, cleanupError);
        }

        return { success: true, zipPath: zipPath };

    } catch (error) {
        console.error(`[${projectId}-Regen] Error during file generation/zipping:`, error);
        try { await fs.rm(projectDir, { recursive: true, force: true }); } catch (_) {}
        // Don't delete the potentially existing old zip on regen failure
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

export async function regenerateProjectAction(
  projectId: string
): Promise<{ error?: string; success?: boolean }> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return { error: "User not authenticated" };
  }

  try {
    // 1. Fetch the project and verify ownership
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return { error: "Project not found." };
    }

    if (project.userId !== userId) {
      return { error: "Forbidden: You do not own this project." };
    }

    // Optional: Check if project is already generating?
    if (project.status === 'generating') {
        return { error: "Project is already being generated or regenerated." };
    }

    // 2. Check user credit balance
    console.log(`[Credit Check - Regen] Checking balance for user ${userId}...`);
    const currentBalance = await getUserCreditBalance(userId);
    if (currentBalance < PROJECT_REGENERATION_COST) {
      console.log(`[Credit Check - Regen] User ${userId}: Insufficient credits. Required: ${PROJECT_REGENERATION_COST}, Available: ${currentBalance}`);
      return { error: `Insufficient credits for regeneration. You need ${PROJECT_REGENERATION_COST} credit(s), but only have ${currentBalance}.` };
    }
    console.log(`[Credit Check - Regen] User ${userId}: Sufficient credits (${currentBalance}). Proceeding...`);

    // 3. Update project status to 'generating'
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "generating", generatedZipUrl: null }, // Clear old zip URL immediately
    });
    console.log(`Project ${projectId} status updated to generating for regeneration.`);

    // 4. Trigger the regeneration process (asynchronously)
    // Again, ideally offloaded to a job queue.
    const generationResult = await generateProjectFilesForRegen(
        projectId,
        project.description, // Use original description
        project.stackDetails, // Use original stack details
        project.aiModelUsed, // Use original model
        baseGenerationDir
    );

    if (generationResult.success && generationResult.zipPath) {
        // 5. Deduct credits *after* successful regeneration
        console.log(`[Credit Deduction - Regen] Attempting to deduct ${PROJECT_REGENERATION_COST} credit(s) for user ${userId}, project ${projectId}...`);
        const deductionSuccess = await deductCredits(userId, projectId, PROJECT_REGENERATION_COST);
        if (!deductionSuccess) {
            console.error(`CRITICAL: Project ${projectId} regenerated successfully, but credit deduction failed for user ${userId}. Manual review required.`);
            // Proceed but log error
        } else {
             console.log(`[Credit Deduction - Regen] Successfully deducted ${PROJECT_REGENERATION_COST} credit(s) for user ${userId}, project ${projectId}.`);
        }

        // 6. Update project record with final status and new zip URL
        await prisma.project.update({
            where: { id: projectId },
            data: {
                status: "completed",
                generatedZipUrl: generationResult.zipPath,
                // Optionally update updatedAt timestamp implicitly
            },
        });
        console.log(`Project ${projectId} regeneration completed. Zip available at: ${generationResult.zipPath}`);
        return { success: true };
    } else {
        // Regeneration failed
        throw new Error(generationResult.error || "Unknown regeneration error");
    }

  } catch (error) {
    console.error(`Error during project regeneration for project ID ${projectId}:`, error);
    // Update status to failed if regeneration failed
    try {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "failed" },
      });
      console.log(`Project ${projectId} status updated to failed after regeneration error.`);
    } catch (updateError) {
      console.error(`Failed to update project ${projectId} status to failed after regeneration error:`, updateError);
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { error: errorMessage.includes("Insufficient credits") ? errorMessage : `Regeneration failed: ${errorMessage}` };
  }
}

