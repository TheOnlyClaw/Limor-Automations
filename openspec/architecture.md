# Architecture

## Repo layout

- `apps/api` Fastify backend
- `apps/web` React frontend
- `openspec/` spec documents (source of truth for planning)

## API

- Basic routes:
  - `GET /health`
  - `GET /api/v1/ping`

## OpenAPI

- OpenAPI is exposed from the API server.
- Swagger UI available at `/docs`.
