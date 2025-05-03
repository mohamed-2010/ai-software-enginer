// src/app/projects/[projectId]/page.tsx
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface ProjectPageProps {
  params: {
    projectId: string
  }
}

async function getProjectDetails(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: {
      id: projectId,
      // Ensure the user owns the project
      userId: userId,
    },
  })
  return project
}

export default async function ProjectViewPage({ params }: ProjectPageProps) {
  const session = await getServerSession()

  if (!session?.user?.id) {
    redirect("/auth/signin")
  }

  const project = await getProjectDetails(params.projectId, session.user.id)

  if (!project) {
    // Handle project not found or not authorized
    // You could redirect to a 404 page or the dashboard
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p>Project not found or you do not have permission to view it.</p>
        <Link href="/dashboard" className="ml-4">
          <Button variant="link">Go to Dashboard</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex justify-center items-start min-h-screen bg-gray-100 p-4 md:p-8">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>{project.title}</CardTitle>
          <CardDescription>Project ID: {project.id}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div>
            <h3 className="font-semibold mb-1">Status:</h3>
            <p className={`capitalize ${project.status === 'completed' ? 'text-green-600' : project.status === 'failed' ? 'text-red-600' : 'text-yellow-600'}`}>
              {project.status}
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">Description:</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{project.description}</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">Stack Details:</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{project.stackDetails || "Not specified"}</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">AI Model Used:</h3>
            <p className="text-sm text-gray-700">{project.aiModelUsed}</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">Created At:</h3>
            <p className="text-sm text-gray-700">{project.createdAt.toLocaleString()}</p>
          </div>
          {project.generatedZipUrl && (
            <div>
              <h3 className="font-semibold mb-1">Download Link:</h3>
              {/* In a real app, this would be a secure download link */}
              <a href={project.generatedZipUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="link">Download Project ZIP</Button>
              </a>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          {/* Placeholder buttons for future actions */}
          <Button variant="outline" disabled={project.status !== 'completed' && project.status !== 'failed'}>
            Regenerate
          </Button>
          <Button disabled={!project.generatedZipUrl}>Download ZIP</Button>
          <Button variant="secondary" disabled>Export to GitHub</Button>
        </CardFooter>
      </Card>
    </div>
  )
}

