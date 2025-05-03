// src/middleware.ts
import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  // `withAuth` augments your `Request` with the user's token.
  function middleware(req) {
    // Check if the user is an admin trying to access admin routes
    if (req.nextUrl.pathname.startsWith("/admin") && req.nextauth.token?.role !== "ADMIN") {
      // Redirect non-admins trying to access admin pages to the dashboard
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }
    // Allow access for admins to admin routes, or for any authenticated user to other protected routes
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token, // Ensure user is logged in for any route covered by middleware
    },
  }
)

// Specify which paths the middleware should apply to
export const config = {
  matcher: [
    "/dashboard/:path*", // Protect dashboard and its sub-routes
    "/projects/:path*", // Protect project pages
    "/admin/:path*", // Protect admin pages
    // Add other paths that require authentication
  ],
}

