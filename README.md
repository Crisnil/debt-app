# Debt App

A phone app (PWA) to track credit card debt, spending, and the path to debt-free.

Your data stays in **your own Google Sheet**. You sign in with Google and select your sheet. The app does not have a server and does not keep a copy of your data.

Live app: https://crisnil.github.io/debt-app/

## Install on a phone

- **Android (Chrome):** open the link, then tap **⋮ → Install app**.
- **iPhone (Safari):** open the link, then tap **Share → Add to Home Screen**.

## Develop

Requirements: Node.js 24.

```sh
npm install
cp .env.example .env.local   # add the Google Client ID, API key, and project number
npm run dev                  # http://localhost:5173/debt-app/
```

| Command | Use |
|---|---|
| `npm run dev` | Start the dev server |
| `npm test` | Run the unit tests |
| `npm run lint` | Run oxlint |
| `npm run build` | Type-check and build to `dist/` |

## Deploy

Each push to `main` runs lint, tests, and build, then publishes to GitHub Pages.

The workflow reads these **repository variables** (Settings → Secrets and variables → Actions → Variables):

| Variable | Value |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | OAuth client ID (`…apps.googleusercontent.com`) |
| `VITE_GOOGLE_API_KEY` | API key, restricted to the Picker API and this site |
| `VITE_GOOGLE_APP_ID` | Google Cloud project number |

These values are public by design. Google Cloud restricts them to this site's address.

## Privacy

- The app asks only for the `drive.file` permission: it can open only the sheet you create or select in it.
- Do not commit real balances, names, or sheet IDs. Test data uses made-up numbers.
