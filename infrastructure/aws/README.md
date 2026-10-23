# AWS backend (IaC outline)

This folder ships **production-ready scaffolding** for the Laravel API. It does **not** require cloud account credentials to validate locally — use `scripts/verify-aws-dry-run.sh`.

## Target topology

| Component | Service |
|---|---|
| API + queue workers | ECS Fargate (2 services) behind ALB |
| Database | RDS MySQL 8 |
| Cache / queues | ElastiCache Redis |
| Media | S3 + IAM task role |
| Secrets | Secrets Manager / SSM Parameter Store |
| TLS | ACM on ALB |
| Observability | CloudWatch logs + alarms |

## Files

- `ecs-task-definition.api.json` — API task shape
- `ecs-task-definition.worker.json` — queue worker task shape
- `cloudformation-skeleton.yaml` — nested stack sketch (VPC/ALB/ECS/RDS placeholders)
- `env.production.example` — required runtime secrets/keys (never commit real values)

## Local verify (no AWS account)

```bash
./scripts/verify-aws-dry-run.sh
./scripts/verify-local.sh
```

## Deploy notes (when accounts exist)

1. Create Secrets Manager entries for `APP_KEY`, DB, Redis, Meta/Shopify/LLM tokens.
2. Set `INTEGRATION_MODE=live` only after tokens are present.
3. Point `FRONTEND_URL` at the Vercel ops subdomain.
4. Register webhook URLs on Meta / Shopify / Telegram once DNS is live.
