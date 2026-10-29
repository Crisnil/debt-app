import { describe, expect, it } from 'vitest'
import { sheetIdFromUrl } from './picker'
import { batchGetUrl } from './sheetsApi'

describe('sheetIdFromUrl', () => {
  const id = 'AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789-ab'

  it.each([
    [`https://docs.google.com/spreadsheets/d/${id}/edit?gid=0#gid=0`, id],
    [`https://docs.google.com/spreadsheets/d/${id}`, id],
    [id, id],
    ['https://example.com/not-a-sheet', null],
    ['short', null],
  ])('reads %s', (input, expected) => {
    expect(sheetIdFromUrl(input)).toBe(expected)
  })
})

describe('batchGetUrl', () => {
  it('quotes tab names with spaces and apostrophes', () => {
    const url = new URL(batchGetUrl('sheet123', ['Cards', 'CC Alpha', "Bob's"]))
    expect(url.pathname).toBe('/v4/spreadsheets/sheet123/values:batchGet')
    expect(url.searchParams.getAll('ranges')).toEqual(["'Cards'", "'CC Alpha'", "'Bob''s'"])
    expect(url.searchParams.get('valueRenderOption')).toBe('UNFORMATTED_VALUE')
  })
})
