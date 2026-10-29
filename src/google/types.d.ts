// Minimal types for the Google Identity Services and Picker globals used by the app.

declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token: string
    expires_in: number
    error?: string
    error_description?: string
  }
  interface TokenClient {
    requestAccessToken(overrides?: { prompt?: '' | 'consent' | 'select_account' }): void
  }
  function initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    error_callback?: (error: { type: string; message?: string }) => void
  }): TokenClient
  function revoke(token: string, done?: () => void): void
}

declare namespace google.picker {
  enum ViewId {
    SPREADSHEETS = 'spreadsheets',
  }
  enum Action {
    PICKED = 'picked',
    CANCEL = 'cancel',
  }
  interface PickedDoc {
    id: string
    name: string
    url: string
  }
  interface ResponseObject {
    action: string
    docs?: PickedDoc[]
  }
  class DocsView {
    constructor(viewId?: ViewId)
    setMimeTypes(mimeTypes: string): DocsView
    setFileIds(ids: string): DocsView
    setMode(mode: unknown): DocsView
  }
  class PickerBuilder {
    addView(view: DocsView): PickerBuilder
    setOAuthToken(token: string): PickerBuilder
    setDeveloperKey(key: string): PickerBuilder
    setAppId(appId: string): PickerBuilder
    setTitle(title: string): PickerBuilder
    setCallback(callback: (data: ResponseObject) => void): PickerBuilder
    build(): { setVisible(visible: boolean): void }
  }
}

declare namespace gapi {
  function load(api: string, callback: () => void): void
}
