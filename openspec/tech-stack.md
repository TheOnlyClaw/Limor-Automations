# Tech Stack

## Purpose & Scope

This doc pins the stack so we stay minimal and consistent.

## Languages & Runtime

- **Primary language**: TypeScript
- **Runtime**: Node.js (LTS)
- **Module system**: ESM

## Package Management

- **Package manager**: npm
- **Lock file**: package-lock.json
- **Workspaces**: npm workspaces (`apps/*`)

## Frontend

- **Framework**: React (Vite)
- **Styling**: Tailwind CSS
- **State mgmt**: keep it simple (React state/hooks). Add Zustand only if needed.

## Backend

- **Framework**: Fastify
- **API style**: REST
- **API specification**: OpenAPI (served via Fastify Swagger plugin)

## Database

Not chosen yet.

## Infrastructure

Not chosen yet.

## Development Tools

- TypeScript
- (Later) ESLint + Prettier
