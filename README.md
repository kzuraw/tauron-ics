# Tauron ICS

A self-hosted Cloudflare Worker that converts Tauron Dystrybucja electricity
outages for one address into an Apple Calendar subscription.

The Worker refreshes the calendar every six hours, stores the last valid ICS
snapshot in Workers KV, and serves it through a secret URL. The first valid
subscription request initializes KV lazily, so the calendar works immediately
after deployment.

## Calendar behavior

- Timed events use Tauron's exact UTC start and end timestamps.
- The calendar is named `Wyłączenia prądu`.
- Planned events are titled `Planowane wyłączenie prądu` and alert 24 hours
  before they begin.
- Unplanned events are titled `Awaria prądu` and do not include an alert.
- Events are transparent and do not mark time as busy.
- The complete Tauron message is preserved in each event description.
- Results are restricted to messages beginning with `TAURON_MESSAGE_PREFIX`,
  compared case-insensitively as a complete place-name prefix.
- The rolling window keeps seven days of history and looks 30 days ahead.
- Stable UIDs combine Tauron's outage ID with the occurrence start time because
  Tauron can reuse one ID for multiple time slots.

The feed is rebuilt from Tauron's authoritative response. Removed or cancelled
outages disappear from the feed. If a refresh fails or returns malformed data,
the existing KV snapshot remains untouched and the next cron retries it.

## Requirements

- Node.js 24 LTS
- pnpm 12.4.2
- A Cloudflare account with Workers and Workers KV

## Local development

Install dependencies:

```sh
pnpm install
```

This repository has a gitignored `.dev.vars` configured for local development.
To recreate it, copy the example and replace every placeholder:

```sh
cp .dev.vars.example .dev.vars
```

Start the local Worker:

```sh
pnpm dev
```

Open the subscription path using the token from `.dev.vars`:

```text
http://localhost:8787/calendar/<CALENDAR_TOKEN>.ics
```

Trigger the scheduled handler locally:

```sh
curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=17+*%2F6+*+*+*&format=json"
```

## Verification

```sh
pnpm lint
pnpm test
```

Tests run inside Cloudflare's Workers runtime with synthetic Tauron fixtures;
they do not call the live API.

## Deployment

Deployment is intentionally manual.

1. Authenticate Wrangler:

   ```sh
   pnpm wrangler login
   pnpm wrangler whoami
   ```

2. Create a dedicated production KV namespace:

   ```sh
   pnpm wrangler kv namespace create CALENDAR_KV
   ```

   Replace the placeholder namespace ID in `wrangler.jsonc` with the returned
   ID.

3. Add each production value as an encrypted Worker secret:

   ```sh
   pnpm wrangler secret put CALENDAR_TOKEN
   pnpm wrangler secret put TAURON_CITY
   pnpm wrangler secret put TAURON_STREET
   pnpm wrangler secret put TAURON_HOUSE_NUMBER
   pnpm wrangler secret put TAURON_MESSAGE_PREFIX
   ```

4. Verify the project and build the exact production bundle without uploading
   it:

   ```sh
   pnpm lint
   pnpm test
   pnpm exec wrangler deploy --dry-run
   ```

5. Deploy to production:

   ```sh
   pnpm run deploy
   ```

   Use `pnpm run deploy`, not `pnpm deploy`: pnpm also has a built-in command
   named `deploy`.

6. Make one request to initialize KV:

   ```text
   https://<worker-host>/calendar/<CALENDAR_TOKEN>.ics
   ```

## Apple Calendar subscription

In Calendar on macOS, choose **File → New Calendar Subscription**, paste the
HTTPS subscription URL, and choose the desired auto-refresh interval. Ensure
**Ignore alerts** is disabled if you want the planned-outage reminder.

Treat the full subscription URL as a password. Rotate access by changing
`CALENDAR_TOKEN`; old paths then return 404.

## HTTP behavior

Only `GET` and `HEAD` requests to the exact tokenized path are accepted. Other
paths return 404. Responses support `ETag` revalidation and expose snapshot
freshness through `Last-Modified`, `X-Calendar-Last-Updated`,
`X-Calendar-Event-Count`, and `X-Tauron-Raw-Outage-Count` headers.

## Acknowledgements

The upstream API protocol implementation was developed with reference to the
[Tauron Dystrybucja Home Assistant integration](https://github.com/Eales/tauron-dystrybucja).
See [Third-party notices](THIRD_PARTY_NOTICES.md) for attribution and license
details.

This is an unofficial project. It is not affiliated with or endorsed by Tauron
Dystrybucja. The upstream API is undocumented and may change without notice.

## License

This project is available under the [MIT License](LICENSE).
