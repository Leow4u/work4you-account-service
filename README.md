# work4you-account-service

Portal NAS da Work4You — `portal.work4you.ai`.

Fatia actual (Agent / Sessões):

- UI Portal (Privy)
- `POST /api/oauth/device/code`
- `POST /api/oauth/token` (device_code + refresh_token)
- `POST /api/oauth/device/approve`
- `GET /api/oauth/sessions` / `DELETE /api/oauth/sessions/:id`
- `GET /.well-known/jwks.json`

## Local

```bash
cp .env.example .env   # preencher secrets
npm install
npx prisma db push
npm run dev
```

## Deploy

Vercel project `work4you-portal`, domínio `portal.work4you.ai`, root `.`
