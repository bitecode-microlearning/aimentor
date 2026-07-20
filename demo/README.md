# BiteCode AI Mentor demo administration

This Worker is a protected scenario builder for the existing BiteCode AI Mentor application. It does not implement a replacement mentor.

## Trust boundaries

- A command-line client requests a short-lived, single-use administrator link.
- Only the Worker holds `DEMO_URL_SIGNING_SECRET_CURRENT`.
- The admin configures a scenario and receives a signed AI Mentor demo URL.
- The AI Mentor Worker validates demo payloads through a Cloudflare service binding.
- Demo mode bypasses product user, subscription, daily-usage, learning-history, and notification-history writes.
- The tester must accept the in-app explanation before `/agent`, microphone, or ElevenLabs startup.
- Verified ElevenLabs demo callbacks are forwarded here, stored idempotently, and emailed to the privately configured administrator address.

## Required secrets

Demo Worker `bitecode-ai-mentor-demo`:

```text
DEMO_URL_SIGNING_SECRET_CURRENT
DEMO_ADMIN_CLI_TOKEN
DEMO_COMPLETION_TOKEN
DEMO_ADMIN_NOTIFICATION_EMAIL
```

Backend Workers `bitecode-backend-orchestrator-dev` and `bitecode-backend-orchestrator`:

```text
DEMO_COMPLETION_TOKEN
ELEVENLABS_WEBHOOK_SECRET
```

`DEMO_COMPLETION_TOKEN` must have the same value on the demo and backend Workers. Never commit these values.

## Generate an administration URL

In PowerShell, set the CLI token for the current terminal and run:

```powershell
$env:DEMO_ADMIN_CLI_TOKEN = "<the configured CLI token>"
npm.cmd run admin-link
```

The CLI calls the Worker; it does not calculate HMAC locally. The printed URL is single-use and defaults to a 15-minute lifetime.

## Local verification

```powershell
npm.cmd install
npm.cmd test
npx.cmd wrangler deploy --dry-run
```

The production participant scenario lifetime is 90 days. Administrator result links default to 24 hours.
