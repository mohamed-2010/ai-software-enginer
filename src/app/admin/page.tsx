// src/app/admin/page.tsx
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { redirect } from "next/navigation"
import { UserRole } from "@prisma/client"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

async function getUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { subscription: true },
  })
  return users
}

async function getSubscriptions() {
  const subscriptions = await prisma.subscription.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true, name: true } } }, // Include user email/name
  })
  return subscriptions
}

async function getProjects() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true, name: true } } }, // Include user email/name
  })
  return projects
}

// Basic usage stats - could be expanded
async function getUsageStats() {
    const totalProjects = await prisma.project.count();
    const totalUsers = await prisma.user.count();
    // More complex stats like total credits used, etc., could be added
    return { totalProjects, totalUsers };
}

export default async function AdminDashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== UserRole.ADMIN) {
    redirect("/dashboard")
  }

  const [users, subscriptions, projects, usageStats] = await Promise.all([
    getUsers(),
    getSubscriptions(),
    getProjects(),
    getUsageStats(),
  ])

  return (
    <div className="container mx-auto py-8 space-y-8">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>

       {/* Usage Stats */}
       <Card>
        <CardHeader>
          <CardTitle>Usage Statistics</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
            <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold">{usageStats.totalUsers}</p>
            </div>
             <div>
                <p className="text-sm text-muted-foreground">Total Projects Generated</p>
                <p className="text-2xl font-bold">{usageStats.totalProjects}</p>
            </div>
            {/* Add more stats here */}
        </CardContent>
      </Card>

      {/* User Management */}
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>View and manage registered users.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>A list of registered users.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Subscription Plan</TableHead>
                <TableHead>Subscription Status</TableHead>
                <TableHead>Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium truncate max-w-[150px]">{user.id}</TableCell>
                  <TableCell>{user.name || "N/A"}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell>{user.subscription?.planName || "None"}</TableCell>
                  <TableCell>{user.subscription?.status || "N/A"}</TableCell>
                  <TableCell>{user.createdAt.toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Subscription Management */}
      <Card>
        <CardHeader>
          <CardTitle>Subscription Management</CardTitle>
          <CardDescription>View user subscriptions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>A list of user subscriptions.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Subscription ID</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stripe Sub ID</TableHead>
                <TableHead>Period End</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell className="font-medium truncate max-w-[150px]">{sub.id}</TableCell>
                  <TableCell>{sub.user?.name || sub.user?.email || "N/A"}</TableCell>
                  <TableCell>{sub.planName}</TableCell>
                  <TableCell>{sub.status}</TableCell>
                  <TableCell className="truncate max-w-[150px]">{sub.stripeSubscriptionId || "N/A"}</TableCell>
                  <TableCell>{sub.stripeCurrentPeriodEnd?.toLocaleDateString() || "N/A"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Project Management */}
      <Card>
        <CardHeader>
          <CardTitle>Project Management</CardTitle>
          <CardDescription>View generated projects.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>A list of generated projects.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Project ID</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Model Used</TableHead>
                <TableHead>Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((proj) => (
                <TableRow key={proj.id}>
                  <TableCell className="font-medium truncate max-w-[150px]">{proj.id}</TableCell>
                  <TableCell>{proj.user?.name || proj.user?.email || "N/A"}</TableCell>
                  <TableCell>{proj.title}</TableCell>
                  <TableCell>{proj.status}</TableCell>
                  <TableCell>{proj.aiModelUsed}</TableCell>
                  <TableCell>{proj.createdAt.toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

