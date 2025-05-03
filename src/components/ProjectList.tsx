// src/components/ProjectList.tsx
"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw, ChevronDown, ChevronUp } from "lucide-react"; // Icons
import { regenerateProjectAction } from "@/app/actions/projectActions"; // Assuming action is created here

type Project = {
  id: string;
  title: string;
  description: string;
  status: string;
  stackDetails: string;
  aiModelUsed: string;
  generatedZipUrl?: string | null;
  createdAt: Date;
  userId: string;
};

interface ProjectListProps {
  projects: Project[];
}

export function ProjectList({ projects }: ProjectListProps) {
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [loadingRegenerateId, setLoadingRegenerateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleExpand = (projectId: string) => {
    setExpandedProjectId(expandedProjectId === projectId ? null : projectId);
  };

  const handleDownload = (projectId: string) => {
    const downloadUrl = `/api/projects/${projectId}/download`;
    window.location.href = downloadUrl;
  };

  const handleRegenerate = async (projectId: string) => {
    setError(null);
    setLoadingRegenerateId(projectId);
    try {
      console.log(`Attempting regeneration for project ${projectId}`);
      const result = await regenerateProjectAction(projectId);
      if (result.error) {
        throw new Error(result.error);
      }
      // Optionally: Refresh the page or update the project list state to show new status
      alert("Project regeneration started successfully! The project status will update shortly."); // Simple feedback
      // Consider using toast notifications for better UX
      // router.refresh(); // If using App Router
    } catch (err) {
      console.error(`Regeneration failed for project ${projectId}:`, err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred during regeneration.");
    } finally {
      setLoadingRegenerateId(null);
    }
  };

  if (!projects || projects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <p>You haven't created any projects yet.</p>
          <Button asChild variant="link" className="p-0 h-auto mt-2">
             <a href="/projects/create">Create your first project</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Projects</CardTitle>
        <CardDescription>Manage your generated projects.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
            <div className="mb-4 text-center text-red-600 bg-red-100 p-3 rounded-md">
            Error: {error}
            </div>
        )}
        <div className="space-y-4">
          {projects.map((project) => (
            <div key={project.id} className="border rounded-md overflow-hidden">
              <div className="flex items-center justify-between p-3 bg-gray-50">
                <h4 className="font-semibold flex-1 truncate mr-2">{project.title}</h4>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <span className={`text-sm font-medium px-2 py-0.5 rounded ${project.status === 'completed' ? 'bg-green-100 text-green-700' : project.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {project.status}
                  </span>
                  {project.status === "completed" && project.generatedZipUrl && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDownload(project.id)}
                      title="Download Project ZIP"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  {/* Regenerate Button - Enable based on status? */}
                  <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleRegenerate(project.id)}
                      title="Regenerate Project (costs 1 credit)"
                      disabled={loadingRegenerateId === project.id || project.status === 'generating'}
                  >
                      {loadingRegenerateId === project.id ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleExpand(project.id)}
                    title={expandedProjectId === project.id ? "Collapse Details" : "Expand Details"}
                  >
                    {expandedProjectId === project.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              {/* Collapsible Details Section */} 
              {expandedProjectId === project.id && (
                <div className="p-3 border-t bg-white">
                  <p className="text-sm text-gray-600 mb-1"><strong>Created:</strong> {new Date(project.createdAt).toLocaleString()}</p>
                  <p className="text-sm text-gray-600 mb-1"><strong>Model Used:</strong> {project.aiModelUsed}</p>
                  <p className="text-sm text-gray-600 mb-1"><strong>Stack Details:</strong></p>
                  <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">{project.stackDetails || "Not specified"}</pre>
                  <p className="text-sm text-gray-600 mt-2 mb-1"><strong>Description/Prompt:</strong></p>
                  <pre className="text-xs bg-gray-100 p-2 rounded whitespace-pre-wrap break-words">{project.description}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
         <Button asChild variant="link" className="p-0 h-auto mt-4">
             <a href="/projects/create">Create a new project</a>
          </Button>
      </CardContent>
    </Card>
  );
}

