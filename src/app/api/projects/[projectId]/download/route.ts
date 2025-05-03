// src/app/api/projects/[projectId]/download/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";

interface RouteParams {
  params: {
    projectId: string;
  };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  const userId = session?.user?.id;
  const projectId = params.projectId;

  if (!userId) {
    return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
  }

  if (!projectId) {
    return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
  }

  try {
    // 1. Fetch project details and verify ownership and status
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true, status: true, generatedZipUrl: true, title: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.userId !== userId) {
      return NextResponse.json({ error: "Forbidden: You do not own this project" }, { status: 403 });
    }

    if (project.status !== "completed" || !project.generatedZipUrl) {
      return NextResponse.json({ error: "Project generation is not complete or ZIP file is missing" }, { status: 400 });
    }

    // 2. Check if the ZIP file exists
    const zipPath = project.generatedZipUrl;
    try {
      await fs.access(zipPath);
    } catch (err) {
      console.error(`Error accessing ZIP file for project ${projectId} at path ${zipPath}:`, err);
      // Update project status if file is missing?
      await prisma.project.update({
          where: { id: projectId },
          data: { status: "failed", generatedZipUrl: null }, // Mark as failed if zip is gone
      });
      return NextResponse.json({ error: "Generated ZIP file not found. Please try regenerating." }, { status: 404 });
    }

    // 3. Read the file content
    const fileBuffer = await fs.readFile(zipPath);

    // 4. Determine filename (sanitize title)
    const sanitizedTitle = project.title.replace(/[^a-z0-9\-_\.]/gi, '_');
    const filename = `${sanitizedTitle}_${projectId.substring(0, 8)}.zip`;

    // 5. Return the file as a response
    const headers = new Headers();
    headers.set("Content-Type", "application/zip");
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: headers,
    });

  } catch (error) {
    console.error(`Error fetching or serving project ${projectId} download:`, error);
    return NextResponse.json({ error: "An unexpected error occurred while preparing the download." }, { status: 500 });
  }
}

