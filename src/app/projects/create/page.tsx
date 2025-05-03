// src/app/projects/create/page.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
// We will create this server action later
// import { createProjectAction } from "./actions"

export default function CreateProjectPage() {
  const { status } = useSession()
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [stackDetails, setStackDetails] = useState("Next.js, MySQL, Prisma, Tailwind, NextAuth") // Default or example
  const [aiModel, setAiModel] = useState("gpt-4") // Default model
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Redirect if not authenticated
  if (status === "unauthenticated") {
    router.push("/auth/signin")
    return null // Render nothing while redirecting
  }

  // Show loading state while session is loading
  if (status === "loading") {
    return <p>Loading...</p> // Or a proper loading spinner
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    // Placeholder for calling the server action
    console.log("Submitting project:", { title, description, stackDetails, aiModel })
    // const result = await createProjectAction({ title, description, stackDetails, aiModelUsed: aiModel })

    // Mock result for now
    const result = { success: true, projectId: "mock-project-id" }

    if (result.error) {
      setError(result.error)
    } else if (result.success && result.projectId) {
      // Redirect to the project view page upon successful creation (or dashboard)
      router.push(`/projects/${result.projectId}`)
    } else {
      setError("An unexpected error occurred.")
    }

    setIsLoading(false)
  }

  return (
    <div className="flex justify-center items-start min-h-screen bg-gray-100 p-4 md:p-8">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Create New Project</CardTitle>
          <CardDescription>
            Describe your project requirements, select the stack, and choose an AI model.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="title">Project Title</Label>
              <Input
                id="title"
                placeholder="e.g., My Awesome SaaS App"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Detailed Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the features, user flows, data models, etc."
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[150px]"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="stackDetails">Stack Details (Optional)</Label>
              <Textarea
                id="stackDetails"
                placeholder="Specify frameworks, libraries, database, etc. (e.g., Next.js 14, Prisma, MySQL, Tailwind)"
                value={stackDetails}
                onChange={(e) => setStackDetails(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="aiModel">AI Model</Label>
              <Select value={aiModel} onValueChange={setAiModel}>
                <SelectTrigger id="aiModel">
                  <SelectValue placeholder="Select AI Model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4">OpenAI GPT-4</SelectItem>
                  <SelectItem value="gpt-3.5-turbo">OpenAI GPT-3.5 Turbo</SelectItem>
                  <SelectItem value="deepseek-coder">DeepSeek Coder</SelectItem>
                  {/* Add more models as needed */}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Generating..." : "Generate Project"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

