# Mail hosting on one Linux VPS

The public booking website stays on Vercel. This is a separate deployment of the mail web app, ASP.NET Core 10 API and PostgreSQL 17. A reverse proxy handles HTTPS and sends the mail hub directly to the API so WebSockets work. Only ports 80 and 443 are published. PostgreSQL and the API stay on the private container network.

## Required decisions

Choose a Linux VPS with Docker Engine and Compose v2, a hostname you control, and enough persistent disk for the complete mailbox history and attachments. Start with 2 CPU cores and 4 GB RAM, then size disk from the real mailbox usage. Point the hostname's DNS A record to the server. Do not reuse the existing `webmail` or `mail` DNS records, which serve cPanel IMAP and SMTP.

The target server, app hostname and release approval are still required. No server has been purchased or deployed by this change.

## Configure

Run from this folder on the server. Copy `.env.example` to `.env`, restrict it to the operator, replace `MAIL_HOST`, and generate two independent hexadecimal secrets with `openssl rand -hex 32` for `POSTGRES_PASSWORD` and `JWT_KEY`. Keep `.env` out of Git. Validate the configuration with `docker compose config --quiet`; do not print the expanded configuration because it contains secrets.

Before building, require at least 3 GB free disk and check that subnet `172.30.88.0/24` does not overlap an existing network. If it does, change the subnet and the explicit API/proxy addresses together, including `ReverseProxy__KnownProxies`.

Build one image at a time to limit memory and disk pressure:

```sh
docker compose build api
docker compose build web
docker compose up -d database api web
```

## Create the first administrator before publishing

The first account becomes the administrator. Keep Caddy stopped until that account exists. Prepare a private JSON file outside the checkout with the API's `RegisterRequest` fields (`email`, `password`, `displayName`, `username`). Use a real strong password and an operator-controlled email address. Send it through the private container loopback, without printing the resulting session token:

```sh
docker compose exec -T api curl --fail --silent --show-error \
  -H 'Content-Type: application/json' -H 'X-Forwarded-Proto: https' \
  --data-binary @- http://127.0.0.1:8080/api/auth/register \
  < /secure/bootstrap-admin.json > /secure/bootstrap-response.json
```

Protect and remove the temporary bootstrap files after successful administrator sign-in. Then start the proxy:

```sh
docker compose up -d caddy
docker compose ps
```

## Verify before connecting real mail

Check `https://YOUR_HOST/api/health` and `/login`, sign in as the administrator, confirm registration now requires an invitation, and verify the mail hub establishes a WebSocket. Connect one cPanel mailbox through the app, then verify sync and attachments. Then invite that same mailbox's address from People, sending from that mailbox: the email should arrive in its own inbox within a minute, its link should start with `https://YOUR_HOST/register?invite=`, and opening it should greet the person by name. Cancel that invitation afterwards. Any other outgoing-mail test needs an approved recipient. The `@admin` development shortcut must fail in Production.

Invitation links use `App__WebBaseUrl`, which Compose sets to `https://MAIL_HOST`; the API logs a warning at start if it is missing. The hub hostname is compiled into the web image. Changing `MAIL_HOST` requires rebuilding the web image. The API recognises forwarded scheme and client address only from the configured Caddy IP, preserving HTTPS redirects and rate limiting.

## Data, backup and recovery

Named volumes preserve PostgreSQL, attachment bytes, encryption keys and Caddy certificates. Back up the database, attachments and keys as one recoverable set, plus the private environment file. Keep encrypted backups off the VPS and test restoration. Never use `docker compose down --volumes` on a live deployment.

The Windows development key ring is protected with Windows DPAPI. Copying it to Linux does not make its mailbox passwords readable there. For this first deployment, create the production administrator and reconnect each mailbox; IMAP sync rebuilds history. Preserve the local database, keys and attachments until production is accepted. Local-only drafts, notes, client links, templates and users need a separate migration decision before the local installation is retired.

For releases, back up first, build both images sequentially, then run `docker compose up -d`. The API applies EF migrations at startup. If a migration fails, keep the proxy stopped and recover from the tested backup rather than deleting volumes. Check free space and volume growth regularly; mailbox history is not a disposable cache.
