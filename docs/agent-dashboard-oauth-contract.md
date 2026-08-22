# Agent dashboard OAuth contract

Work4You hosted agents authenticate dashboard users via Portal OAuth
(authorization code + PKCE). The bundled FORK plugin
`plugins/dashboard_auth/work4you` implements the agent side; this document
is the Portal (NAS) wire contract.

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/oauth/authorize` | GET | Browser consent + login |
| `/api/oauth/token` | POST | `authorization_code` and `refresh_token` grants |
| `/.well-known/jwks.json` | GET | RS256 verification keys |

## Client id

Per-instance: `agent:{agent_instance_id}` (cuid from `AgentInstance.id`).

## Scope

`agent_dashboard:access` only.

## Redirect URI

`{dashboardUrl}/auth/callback` where `dashboardUrl` is the agent's public
Fly URL (`https://w4y-agent-<slug>.fly.dev`).

## Access token claims

- `iss` — Portal base URL (`OAUTH_ISSUER`)
- `aud` — bare `client_id` (`agent:{id}`)
- `sub` — user Privy DID
- `org_id` — owning org
- `agent_instance_id` — same id as client suffix (defense in depth)
- `oauth_contract_version` — `1`
- `scope` — `agent_dashboard:access`

## Refresh tokens

Dashboard sessions use a **24h** rotating refresh token. Send
`grant_type=refresh_token` with the refresh token in the body and the
`x-work4you-refresh-token` header (same value).

## Bootstrap session (`work4you-cli-vps`)

Hosted VMs also receive `WORK4YOU_AUTH_JSON_BOOTSTRAP` at provision time
(client `work4you-cli-vps`, scope `inference:invoke agent:manage`) for
agent → Portal API calls (billing, cron, inference). This is separate from
the dashboard OAuth client.
