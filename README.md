# AI Software Engineer SaaS Application

This project is a full-stack Next.js application designed to automatically generate code for software projects based on user descriptions, similar to Manus.ai. It includes user authentication, AI-powered code generation, Stripe subscription management with a credit system, and project management features.

## Features

*   **User Authentication:** Sign up, sign in, sign out using NextAuth.js.
*   **AI Project Generation:** Users describe project requirements, select an AI model (OpenAI GPT-4/3.5, DeepSeek Coder), and generate a complete project structure packaged as a downloadable ZIP file.
*   **Stripe Subscription & Credits:** Integrates with Stripe for monthly/yearly subscription plans. Users receive credits based on their plan, which are consumed during project generation.
    *   Stripe Checkout for secure payment processing.
    *   Stripe Webhooks to manage subscription status and credit balance automatically.
*   **Project Management:**
    *   View created projects and their generation status (pending, generating, completed, failed) on the dashboard.
    *   Download completed projects as ZIP archives.
    *   Regenerate projects using the original prompt (consumes credits).
    *   View project details (prompt, stack, model used, creation date).
*   **AI Integration:** Flexible integration with OpenAI and DeepSeek APIs, including fallback mechanisms and structured output parsing.
*   **UI:** Built with Tailwind CSS and shadcn/ui.
*   **Database:** Uses Prisma ORM. Configured for SQLite (development) and MySQL (production recommended).
*   **Testing:** Includes unit tests using Jest for core logic (AI parsing, credits, Stripe webhooks).
*   **Deployment Ready:** Includes a Dockerfile for containerized deployment and a comprehensive `.env.example` file.

## Tech Stack

*   **Framework:** Next.js (App Router)
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS, shadcn/ui
*   **Authentication:** NextAuth.js
*   **Database ORM:** Prisma
*   **Database:** SQLite (Development), MySQL (Production Recommended)
*   **AI:** OpenAI API, DeepSeek API
*   **Payments:** Stripe
*   **Testing:** Jest (Unit Testing)
*   **Containerization:** Docker

## Getting Started

### Prerequisites

*   Node.js (v20 or later recommended)
*   npm
*   Docker (Optional, for local MySQL or deployment)
*   Stripe Account (for subscription features)
*   OpenAI/DeepSeek API Keys (for AI generation)

### Installation

1.  **Clone the repository (or extract the zip archive).**
2.  **Install dependencies:** `npm install`
3.  **Set up environment variables:** Copy `.env.example` to `.env` and fill in ALL required values.
4.  **Initialize the database (SQLite):** `npx prisma migrate dev --name init`
5.  **(Development) Set up Stripe Webhook Forwarding:** Use the Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`. Copy the provided `whsec_...` secret to your `.env` file.

### Running the Development Server

```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

### Running Unit Tests

```bash
npm test
```

## Deployment

This application can be deployed using various methods. Here are instructions for two common approaches: Vercel (recommended for Next.js) and Docker.

### Option 1: Deploying to Vercel (Recommended)

Vercel is optimized for Next.js applications.

1.  **Database Setup (PlanetScale Recommended):**
    *   Sign up for a free [PlanetScale](https://planetscale.com/) account.
    *   Create a new database. Choose a region close to your users.
    *   Go to the database dashboard, click "Connect", and select "Prisma" from the dropdown.
    *   Copy the **DATABASE_URL** connection string provided (it includes the necessary Prisma flags).
2.  **Push Code:** Push your project code to a Git provider (GitHub, GitLab, Bitbucket).
3.  **Create Vercel Project:**
    *   Sign up for a [Vercel](https://vercel.com/) account.
    *   Create a new project and import your Git repository.
    *   Vercel should automatically detect it as a Next.js project.
4.  **Configure Environment Variables:**
    *   In your Vercel project settings, go to "Environment Variables".
    *   Add all the variables from your `.env` file (except `NEXTAUTH_URL`, which Vercel sets automatically). **Use the PlanetScale `DATABASE_URL` you copied earlier.**
    *   **Important:** For the Stripe public key, ensure the variable name is `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` so it's available client-side.
5.  **Configure Build Settings:**
    *   In Vercel project settings under "Build & Development Settings", override the "Build Command".
    *   Set it to: `npx prisma generate && npm run build` (This ensures Prisma Client is generated before the build).
6.  **Run Database Migrations:**
    *   You need to apply your Prisma migrations to the PlanetScale database.
    *   **Method A (Locally):** Temporarily update your local `.env` file's `DATABASE_URL` to point to your PlanetScale database. Then run: `npx prisma migrate deploy`. **Remember to change it back afterwards.**
    *   **Method B (Vercel Build Step - Advanced):** You could potentially modify the build command further to include `npx prisma migrate deploy`, but ensure this runs safely and only when needed.
7.  **Configure Stripe Webhook:**
    *   Once deployed, Vercel will provide a production URL (e.g., `your-app-name.vercel.app`).
    *   Go to your Stripe Dashboard -> Developers -> Webhooks.
    *   Add an endpoint pointing to `https://<your-vercel-app-url>/api/webhooks/stripe`.
    *   Select the required events (e.g., `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`).
    *   Reveal the **Signing secret** for this endpoint and add it as the `STRIPE_WEBHOOK_SECRET` environment variable in Vercel.
8.  **Deploy:** Trigger a deployment on Vercel (usually happens automatically on push to the main branch).

### Option 2: Deploying with Docker

This provides more control but requires managing infrastructure.

1.  **Server Setup:**
    *   Provision a Virtual Private Server (VPS) from a cloud provider (e.g., DigitalOcean, AWS EC2, Linode).
    *   Install Docker and Docker Compose on the server.
    *   Set up a firewall (e.g., `ufw`) allowing ports 80 (HTTP), 443 (HTTPS), and potentially SSH (22).
2.  **Database Setup:**
    *   Set up a production database (MySQL recommended). You can run this in a separate Docker container managed by Docker Compose, or use a managed database service.
    *   Ensure you have the database host, port, user, password, and database name.
3.  **Code Deployment:**
    *   Clone your repository onto the VPS.
4.  **Environment Configuration:**
    *   Create a `.env` file in the project root on the VPS.
    *   Fill it with your **production** environment variables (database connection string, production Stripe keys, production AI keys, `NEXTAUTH_URL` pointing to your domain, etc.).
5.  **Run Database Migrations:**
    *   Connect to your server.
    *   Navigate to the project directory.
    *   Ensure Node.js and npm are installed (or use a Node container temporarily).
    *   Run: `npm install` (to get Prisma CLI)
    *   Run: `npx prisma migrate deploy --schema=./prisma/schema.prisma` (Point to your production DB via `.env`)
6.  **Build and Run with Docker:**
    *   **Build the image:** `docker build -t ai-software-engineer .`
    *   **Run the container:**
        ```bash
        docker run -d --name ai-app -p 3000:3000 --env-file .env --restart always ai-software-engineer
        ```
        *   `-d`: Run in detached mode.
        *   `--name ai-app`: Assign a name.
        *   `-p 3000:3000`: Map host port 3000 to container port 3000.
        *   `--env-file .env`: Load environment variables from the `.env` file.
        *   `--restart always`: Automatically restart the container if it stops.
    *   **Recommendation:** Use Docker Compose to manage the application container and potentially a database container together. Create a `docker-compose.yml` file.
7.  **Set Up Reverse Proxy (Nginx/Caddy):**
    *   Install Nginx or Caddy on the VPS.
    *   Configure it to act as a reverse proxy for your application running on `localhost:3000`.
    *   Configure SSL/TLS (HTTPS) using Let's Encrypt (Caddy handles this automatically; Nginx requires Certbot).
    *   Your proxy should forward requests to `http://localhost:3000`.
8.  **Configure Stripe Webhook:**
    *   Go to your Stripe Dashboard -> Developers -> Webhooks.
    *   Add an endpoint pointing to `https://<your-domain>/api/webhooks/stripe`.
    *   Select the required events.
    *   Reveal the **Signing secret** and add it as `STRIPE_WEBHOOK_SECRET` in your `.env` file on the VPS (and restart the Docker container: `docker restart ai-app`).

## Notes

*   **Admin User:** To create an admin user, manually update the `role` field for a user in the database to `ADMIN` after they sign up.
*   **Generated Code Storage:** Generated ZIP files are stored locally in `/home/ubuntu/generated_projects` by default. For production, **strongly consider using cloud storage** (e.g., AWS S3, Google Cloud Storage) and update the storage/retrieval logic in `createProjectAction`, `regenerateProjectAction`, and the download API route.

# ai-software-enginer
