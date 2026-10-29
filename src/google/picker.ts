import { config } from '../config'
import { loadScript } from './loadScript'

export type PickedSheet = { id: string; name: string }

let pickerReady: Promise<void> | null = null

function loadPicker() {
  pickerReady ??= loadScript('https://apis.google.com/js/api.js').then(
    () => new Promise<void>((resolve) => gapi.load('picker', resolve)),
  )
  return pickerReady
}

/** Returns the spreadsheet ID from a Google Sheets URL or a bare ID, or null. */
export function sheetIdFromUrl(input: string): string | null {
  const trimmed = input.trim()
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/)
  if (match) return match[1]
  return /^[a-zA-Z0-9_-]{20,}$/.test(trimmed) ? trimmed : null
}

/**
 * Opens the Google Picker. With the drive.file scope, the app can open a sheet only
 * after the user selects it here. If fileId is given, the Picker shows only that file.
 */
export async function pickSheet(accessToken: string, fileId?: string): Promise<PickedSheet | null> {
  await loadPicker()
  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS).setMimeTypes(
      'application/vnd.google-apps.spreadsheet',
    )
    if (fileId) view.setFileIds(fileId)
    new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(config.googleApiKey)
      .setAppId(config.googleAppId)
      .setTitle('Select your debt sheet')
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED && data.docs?.[0]) {
          resolve({ id: data.docs[0].id, name: data.docs[0].name })
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null)
        }
      })
      .build()
      .setVisible(true)
  })
}
