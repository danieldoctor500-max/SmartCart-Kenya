# SmartCart Kenya frontend

The frontend is a React and TypeScript single-page application built with Vite.
It uses React Router for client-side routes and Axios for API requests.

## Requirements

- Node.js and npm versions compatible with the frontend package dependencies.
- The SmartCart backend for live catalogue, account, cart, and checkout
  functionality.

## Install and run locally

From this directory:

```sh
npm ci
npm run dev
```

Vite serves the frontend on port 5173. API requests use `/api/v1` by default
and are proxied to the local backend on port 3000. Set
`VITE_API_PROXY_TARGET` to override the local development proxy destination.

## Environment configuration

`VITE_API_BASE_URL` sets the API base URL embedded in a production build. If
unset or blank, the client uses `/api/v1`, which is appropriate for local
development with the Vite proxy or for a same-origin production API proxy.
The value is trimmed of trailing slashes before the API paths are appended.

Do not put credentials, tokens, or other secrets in frontend environment
variables. Vite variables are included in browser-delivered assets.

## Build, preview, and tests

```sh
npm run build
npm run preview
npm test
```

The build type-checks and writes static assets to `dist/`. The preview command
serves that built output locally. Frontend tests run in Vitest and do not use
the backend database.

For separate frontend and backend hosting, configure the API URL before
building and set up SPA fallback routing. See
[../docs/deployment-render-neon.md](../docs/deployment-render-neon.md).
