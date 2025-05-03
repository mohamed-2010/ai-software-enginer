import NextAuth, { DefaultSession, DefaultUser } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { UserRole } from "@prisma/client" // Import UserRole enum

// Extend session and JWT types to include id and role
declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: UserRole // Add role to session user
    } & DefaultSession["user"]
  }

  interface User extends DefaultUser {
    role: UserRole // Add role to user object
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: UserRole // Add role to JWT token
  }
}

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "jsmith@example.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        })

        if (!user || !user.password) {
          return null
        }

        const isValidPassword = await bcrypt.compare(credentials.password, user.password)

        if (!isValidPassword) {
          return null
        }

        // Return user object including role
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role, // Include role here
        }
      }
    })
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    // Include user id and role on JWT
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    // Include user id and role on session
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id
        session.user.role = token.role
      }
      return session
    },
  },
  pages: {
    signIn: '/auth/signin', 
  },
  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }

