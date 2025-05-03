// src/app/dashboard/page.tsx
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { redirect } from "next/navigation"
import SignOutButton from "./SignOutButton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SubscriptionPlans } from "@/components/SubscriptionPlans";
import { ProjectList } from "@/components/ProjectList"; // Import ProjectList
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id;

  // If no session exists, redirect to sign-in page
  if (!userId) {
    redirect("/auth/signin")
  }

  // Fetch user subscription details
  const subscription = await prisma.subscription.findUnique({
    where: { userId: userId },
  });

  // Fetch user projects
  const projects = await prisma.project.findMany({
    where: { userId: userId },
    orderBy: {
      createdAt: "desc", // Show newest projects first
    },
  });

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-100 p-4 space-y-6">
      {/* Dashboard Info Card */}
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>Welcome back, {session?.user?.name || session?.user?.email}!</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Manage your projects and subscription.</p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <h3 className="text-lg font-semibold mb-2">Your Details:</h3>
                <p><strong>Name:</strong> {session?.user?.name || "N/A"}</p>
                <p><strong>Email:</strong> {session?.user?.email}</p>
            </div>
            <div>
                <h3 className="text-lg font-semibold mb-2">Subscription Status:</h3>
                {subscription ? (
                  <div>
                    <p><strong>Plan:</strong> {subscription.planName}</p>
                    <p><strong>Status:</strong> <span className={`font-medium ${subscription.status === 'active' ? 'text-green-600' : 'text-orange-600'}`}>{subscription.status}</span></p>
                    <p><strong>Credits Available:</strong> {subscription.currentCreditBalance ?? 0} / {subscription.creditsMonthly}</p>
                    {subscription.stripeCurrentPeriodEnd && (
                      <p><strong>Renews/Expires:</strong> {new Date(subscription.stripeCurrentPeriodEnd).toLocaleDateString()}</p>
                    )}
                  </div>
                ) : (
                  <p>No active subscription found.</p>
                )}
            </div>
          </div>
          <div className="mt-6">
             <SignOutButton />
          </div>
        </CardContent>
      </Card>

      {/* Project List Card */}
      <div className="w-full max-w-3xl">
        <ProjectList projects={projects} />
      </div>

      {/* Subscription Plans Card (conditionally rendered) */}
      {(!subscription || subscription.status !== 'active') && (
          <div className="w-full max-w-3xl">
             <SubscriptionPlans />
          </div>
      )}
      {/* TODO: Add link to Stripe Customer Portal for managing subscription */}

    </div>
  )
}

