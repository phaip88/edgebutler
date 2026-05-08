# EdgeButler

EdgeButler is an AI-assisted VPS operations console built on Cloudflare Workers,
Cloudflare Agents, Durable Objects, Workers AI, and a lightweight Linux agent.

The project is moving from a single-VPS Telegram assistant to a multi-VPS
operations platform.

## Current Capabilities

- Web operations console for VPS fleet management.
- One-time install token generation.
- One-click Linux agent install command generation.
- Agent self-registration.
- Default server naming from username, location, and IP suffix.
- Server rename, location update, and delete actions from the web console.
- Per-VPS agent token after registration.
- On-demand single VPS refresh.
- On-demand all VPS refresh.
- AI command endpoint for natural-language operations.
- Pending confirmation queue for mutating operations.
- Telegram webhook entrypoint.
- Notification channel configuration for Enterprise WeChat, Telegram, and
  generic webhooks.
- Operation audit log stored in the controller Agent state.
- D1 schema draft in `migrations/0001_initial.sql` for the next persistence step.

## Architecture

```text
Web Console / Telegram
  -> Cloudflare Worker API
  -> EdgeButler Durable Object Agent
  -> Workers AI for intent parsing and summaries
  -> VPS Agent HTTP API
  -> Linux command output
```

Realtime monitoring is intentionally pull-based for now. The page shows the last
known state and only refreshes a VPS when the operator clicks a button.

## Development

```bash
npm install
npm run check
npx vite build
npx wrangler dev
```

Regenerate Cloudflare types after changing bindings:

```bash
npm run types
```

## Deployment

```bash
npm run deploy
```

Optional Telegram secret:

```bash
npx wrangler secret put ADMIN_PASSWORD
# or
npx wrangler secret put ADMIN_TOKEN

npx wrangler secret put TELEGRAM_BOT_TOKEN
```

`ADMIN_PASSWORD` or `ADMIN_TOKEN` protects the web operations API. If neither is
configured, local development is allowed but production deployment is not
recommended.

Set the Telegram webhook after deployment:

```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<worker-host>/telegram
```

## Adding a VPS

1. Open the web console.
2. Fill in optional name, username, and location.
3. Generate a one-time install command.
4. Run the command on a test VPS as root.
5. The agent registers itself and receives a per-VPS token.

The generated command looks like:

```bash
curl -fsSL "https://<worker-host>/install.sh?token=<install-token>" | sudo bash
```

The installer starts the agent with systemd when available. In lightweight VPS,
container, or chroot environments without systemd, it falls back to a background
runner and writes `/opt/edgebutler/agent.pid` and `/opt/edgebutler/agent.log`.

The current refresh path requires the Cloudflare Worker to reach the agent's
HTTP port from the public internet. VPS environments that block inbound ports
can still register through outbound HTTPS, but on-demand refresh needs an
allowed inbound port, a tunnel, or a future reverse-polling agent mode.

## Supported Actions

- `server_summary`
- `check_memory`
- `check_disk`
- `check_cpu`
- `check_os_version`
- `check_network`
- `check_docker`
- `check_logs`
- `check_top_processes`
- `check_port`
- `check_process`
- `service_health`
- `restart_service`
- `shell`

Mutating operations such as `restart_service` and `shell` are designed to require
explicit confirmation. The AI command flow creates a pending operation, and the
web console must confirm it before execution.

## Notes

This is still an early platform refactor. The next important steps are page
Cloudflare deployment, D1-backed persistence, token hashing/encryption at rest,
and staging deployment against a disposable test VPS.
