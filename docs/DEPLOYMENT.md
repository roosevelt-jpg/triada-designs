# Deployment

## Frontend (Vercel)

- Root directory: `apps/web`
- Build: `npm run build`
- Env: `NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api`
- Do not put Laravel DB or provider secrets in `NEXT_PUBLIC_*`.

## Backend (AWS outline)

- ECS Fargate for API + queue workers
- RDS MySQL, ElastiCache Redis, S3 media
- Secrets Manager for production credentials
- ALB + ACM TLS

## Local Docker

```bash
docker compose -f infrastructure/compose.yaml up --build
```

## CI

GitHub Actions workflow lints/tests web and API on pull requests.
