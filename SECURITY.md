# Security policy

Report security vulnerabilities privately to **contact@despical.dev**, or use GitHub private vulnerability reporting when available. Do not open a public issue containing an exploit, session capability, server link or private effect data.

Include the affected commit or URL, browser and operating system, reproduction steps, expected impact, and a minimal sanitized example. Do not send credentials or real player data. Avoid destructive testing against live servers.

## Scope

- Unsafe rendering of imported YAML, effect names, captions or translations.
- ZIP traversal, decompression limits, image parsing and browser storage.
- Personal editor capabilities, server import authentication and revision handling.
- Cookie consent, unexpected analytics collection or disclosure of private content.
- Repository workflows, deployment artifacts and third-party assets.

The latest `main` branch and current deployment are supported. Older snapshots receive no separate maintenance. Reports will be reviewed as soon as possible; confirmed fixes will be coordinated privately before disclosure. No response deadline or bounty is promised.

Visual defects and compatibility issues belong in the normal bug tracker.
