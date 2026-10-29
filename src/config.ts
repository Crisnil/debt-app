// Public Google IDs. Google Cloud restricts them to this site's origin.
export const config = {
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  googleApiKey: import.meta.env.VITE_GOOGLE_API_KEY ?? '',
  googleAppId: import.meta.env.VITE_GOOGLE_APP_ID ?? '',
}

export const isGoogleConfigured = Boolean(config.googleClientId && config.googleApiKey && config.googleAppId)
