# Copyright (C) 2026 Berke Akçen
# SPDX-License-Identifier: GPL-3.0-only
FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
WORKDIR /app
COPY --chown=node:node relay.cjs ./
USER node
EXPOSE 8094
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8094/frameui-relay/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "relay.cjs"]
