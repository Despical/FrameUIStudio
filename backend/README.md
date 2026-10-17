# FrameUI connection relay

Connects the browser editor to Minecraft servers through an outbound HTTPS connection. Players run `/frameui editor`, open their personal link and save effects directly to their server. They do not need to configure a domain, certificate or port forwarding.

The service uses Node.js built-ins and requires no runtime dependencies or database. Its source is licensed under GPL-3.0-only, matching the repository license.

## Development

Run these commands from the repository root:

```sh
npm run relay
node --test test/relay.test.cjs
```

The default listener is on port `8094`. Check its health at `http://localhost:8094/frameui-relay/v1/health`.

| Setting | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8094` | HTTP listening port |
| `TRUST_PROXY` | Disabled | Read client IPs from a trusted proxy's `X-Relay-IP` header |

Enable `TRUST_PROXY=1` only behind a proxy that overwrites `X-Relay-IP`. Keep the application listener private when using this setting. Production connections require HTTPS; the included Docker and Nginx files provide deployment examples.

## Connection flow

The plugin generates a random channel ID and a separate secret, registers the channel and keeps an outbound long poll open. The browser receives the channel endpoint and a separate, expiring player token in the personal link's fragment. Channel secrets never reach browsers.

The relay forwards requests to the corresponding plugin. The plugin checks player permissions, online status, session expiry, import validation and effect revisions before applying changes. A new editor link revokes that player's previous link. Restarting the Minecraft server invalidates its existing links.

Generated resource packs use a separate channel URL so Minecraft clients can download them without a player token. As with ordinary resource-pack hosting, pack assets must not contain secrets.

## Protocol

All routes use the `/frameui-relay/v1/` prefix.

| Request | Purpose |
| --- | --- |
| `POST channels/{id}` | Register or reconnect with the channel secret |
| `GET channels/{id}/poll` | Receive one request; idle polls return 204 |
| `POST channels/{id}/result/{request-id}` | Return a response with the channel secret |
| `DELETE channels/{id}` | Disconnect and clear pending requests |
| `GET health` | Check service health |

Browser API requests use `servers/{id}/studio/api/` for sessions, effect lists, effect downloads, imports and deletions. They require the player's bearer token. Resource packs use `servers/{id}/pack`.

Transport fields begin with an unsigned 32-bit big-endian byte length, followed by their UTF-8 contents. The final field contains length-prefixed raw body bytes.

- Request fields: method, path, authorization, content type, `If-Match`, `If-None-Match`, body.
- Response fields: status, content type, ETag, body.

Text fields are limited to 8192 bytes. Imports are limited to 9 MiB and responses to 32 MiB. Identical versioned pack downloads share a transfer and a short-lived, bounded memory cache. Request timeouts, concurrency limits and IP rate limits protect service capacity; their values are defined in `relay.cjs`.

## Privacy and availability

Designs, tokens and packs are not written to persistent storage. Do not enable request-body or authorization-header logging. Both connections use HTTPS in production, but this is **not end-to-end encryption**: the relay operator can technically inspect forwarded traffic in memory.

Plugins reconnect automatically after an interruption. Requests in progress may fail and need to be retried. Connected saves and pack downloads require the relay and Minecraft server to be available; offline editing and ZIP exports remain independent.
