# FrameUI connection relay

GPL-3.0-only, matching the repository license. No runtime dependencies or database.

The plugin generates a random 256-bit channel ID and a separate 256-bit secret on startup. It registers the channel over HTTPS and keeps one outbound long poll open. The browser receives the channel endpoint and its separate expiring player capability in the URL fragment. Channel credentials never reach browsers. The plugin handles every API operation using its existing session/permission/import/revision checks; the relay cannot grant player permissions. A new command revokes the player's previous link. Server restarts generate a new channel and invalidate previous links.

Only the fixed Studio session/library/import/delete API and generated `/pack` route are transported. There is no arbitrary proxy, filesystem, console, command or socket access. Pack downloads use the random channel URL without a player token so Minecraft clients can fetch them. They expose only the generated pack, as ordinary resource-pack hosting does. Never put secrets in pack assets.

## Run and test

```sh
npm run relay
node --test test/relay.test.cjs
```

Local listener: `http://127.0.0.1:8094/frameui-relay/v1/health`. Production: `https://studio-relay.despical.dev/frameui-relay/v1/health`. The public website remains at `https://frameui.despical.dev` on GitHub Pages.

## Deploy

The service runs on the existing VDS in `/opt/frameui-studio/backend`, on Docker network `plugins-hub-edge`. The container has no published host ports, runs as the Node non-root user, has a read-only filesystem and resource limits. `studio-relay.despical.dev` has a DNS-only A record pointing at the VDS and a verified Let's Encrypt certificate; large pack transfers go directly to the relay. The existing TLS proxy routes only `/frameui-relay/` to `frameui-relay:8094`.

Install `nginx-server.conf` alongside the existing proxy server blocks, validate with `nginx -t`, then reload. The initial HTTP-only block serves ACME challenges from `/var/lib/acme-webroot`; obtain the certificate with the existing Certbot account before enabling the HTTPS block. The installed Certbot timer renews it automatically and the existing deployment hook reloads Nginx. The proxy uses Docker DNS to recover after relay container replacements. `nginx-location.conf` is an optional legacy Hub-hosted route. Do not replace unrelated Hub/proxy configuration.

From a checkout on the deployment machine:

```sh
docker compose -p frameui-studio -f backend/compose.yml up -d --build --wait
curl --fail https://studio-relay.despical.dev/frameui-relay/v1/health
```

Deployment updates disconnect channels briefly; plugins reconnect automatically, keeping their IDs/secrets until the Minecraft server restarts. Requests in flight fail visibly and must be retried. Roll back by redeploying the previous checked-out backend and reloading the validated proxy configuration. No persistent database migrations are needed.

## Protocol v1

The base path is `/frameui-relay/v1/`. Plugin control endpoints:

| Request | Purpose |
| --- | --- |
| `POST channels/{id}` | Register/reconnect using `Authorization: Bearer {channel-secret}` |
| `GET channels/{id}/poll` | Receive one binary request; idle polls return 204 after 25 seconds |
| `POST channels/{id}/result/{request-id}` | Return a bounded response using the same channel secret |
| `DELETE channels/{id}` | Disconnect and fail queued requests |
| `GET health` | Public process health, no sensitive channel details |

Public request routes: `servers/{id}/studio/api/{session,effects,effects/{effect-id},import}` and `servers/{id}/pack`. API calls require the separate player bearer token. Exact allowed browser origin: `https://frameui.despical.dev`. API bodies/authorization are forwarded only to the corresponding authenticated channel.

Each binary field has an unsigned 32-bit big-endian byte length, then UTF-8 bytes. Request fields: method, fixed path, authorization, content-type, if-match, if-none-match, then length-prefixed raw body. Response fields: decimal status, allowlisted content-type, optional quoted SHA-256 ETag, then length-prefixed raw body. Text fields are limited to 8192 bytes. No compression is used in the transport envelope.

Limits: 9 MiB imports, 32 MiB responses, 4 pending requests/channel, 32 global pending requests, bounded buffered request bytes, 4 simultaneous upload readers, 2 response readers, 1000 channels, 32 channels/IP, 30 registrations/IP/hour and 180 requests/IP/minute. Identical versioned pack downloads share one transfer (up to 128 waiting clients) and a 60-second memory cache capped at 64 MiB globally. This avoids a pack request per player during simultaneous joins. Requests time out after 45 seconds; abandoned channels expire after 3 minutes. Oversize, invalid origin, unsupported route, stale result and wrong-secret requests are rejected. Limits also bound unauthenticated abuse; they are operational limits, not an availability guarantee.

No designs, tokens or packs are persisted by the service. The proxy disables access logging for relay routes; do not enable request-body/header logging. Both browser-to-relay and plugin-to-relay connections use verified HTTPS. This is **not end-to-end encryption**: the relay operator can technically inspect traffic in memory. `TRUST_PROXY=1` is only safe behind a trusted proxy that overwrites `X-Relay-IP`; never publish the container port directly with this enabled. Existing hosting-provider/proxy security controls and IP processing still apply.
