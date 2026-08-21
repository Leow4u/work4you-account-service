# work4you-account-service

Portal NAS da Work4You — `portal.work4you.ai`.

Fatia actual (Agent / Sessões / Cloud):

- UI Portal (Privy)
- `POST /api/oauth/device/code`
- `POST /api/oauth/token` (device_code + refresh_token)
- `POST /api/oauth/device/approve`
- `GET /api/oauth/sessions` / `DELETE /api/oauth/sessions/:id`
- `GET /.well-known/jwks.json`
- Work4You Cloud (greenfield — **não** usa o stack Wayne legado):
  - UI `/orgs/:orgId/agents`
  - `GET|POST /api/agents` (Desktop discovery + Create)
  - `GET|PATCH|DELETE /api/agents/:id`
  - `POST /api/agents/:id/start|stop`
  - Provisiona apps Fly `w4y-agent-*` a partir da imagem `work4you-cloud-runtime`

## Local

```bash
cp .env.example .env   # preencher secrets
npm install
npx prisma db push
npm run dev
```

## Deploy

Vercel project `work4you-portal`, domínio `portal.work4you.ai`, root `.`

### Cloud / Fly (Vercel env)

| Var | Uso |
|---|---|
| `FLY_API_TOKEN` | Token org Fly (Machines API) |
| `FLY_ORG` | Slug da org (`personal` por omissão) |
| `FLY_REGION` | Região das VMs (`gru` por omissão) |
| `WORK4YOU_AGENT_IMAGE` | Imagem das VMs (default: `registry.fly.io/work4you-cloud-runtime:…`) |
| `PORTAL_PUBLIC_URL` | URL pública do Portal (default `https://portal.work4you.ai`) |

A imagem golden vive no app Fly `work4you-cloud-runtime` (repo FORK `services/work4you-cloud-agent/`). Hoje é um runtime de arranque (health + `/sessions`); a imagem completa do agent Work4You substitui via `WORK4YOU_AGENT_IMAGE`.
