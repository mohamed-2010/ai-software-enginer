"use server"

import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

interface SignUpData {
  name?: string | null
  email?: string | null
  password?: string | null
}

export async function signUpAction(data: SignUpData): Promise<{ error?: string; success?: boolean }> {
  const { name, email, password } = data

  if (!email || !password || !name) {
    return { error: "Missing name, email, or password" }
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return { error: "User with this email already exists" }
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10) // 10 is the salt rounds

    // Create the user
    await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        // Initialize other fields if necessary, e.g., default subscription
      },
    })

    return { success: true }
  } catch (error) {
    console.error("Sign up error:", error)
    return { error: "An unexpected error occurred during sign up." }
  }
}

