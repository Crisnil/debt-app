import { describe, expect, it } from 'vitest'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { isoDate } from './cells'
import { parseWorkbook, SchemaError } from './workbook'

describe('parseWorkbook', () => {
  const wb = parseWorkbook('Sample', fixtureTabs, fixtureValues)

  it('reads settings and cards', () => {
    expect(wb.settings.salary_per_payday).toBe('20000')
    expect(wb.cards.map((c) => [c.cardId, c.active])).toEqual([
      ['alpha', true],
      ['beta', true],
      ['gamma', false],
    ])
  })

  it('reads statement lines from each card tab and skips empty rows', () => {
    expect(wb.lines.filter((l) => l.cardId === 'alpha')).toHaveLength(5)
    expect(wb.lines.find((l) => l.description === 'SAMPLE FRIDGE')?.amount).toBe(50050)
    expect(wb.lines.find((l) => l.type === 'payment')?.amount).toBe(-400000)
  })

  it('reads amounts as centavos', () => {
    expect(wb.snapshots.find((s) => s.asOf === '2030-01-10')?.currentDue).toBe(400075)
    expect(wb.categories.find((c) => c.category === 'Gasoline')?.weeklyBudget).toBe(0)
  })

  it('reports missing tabs', () => {
    const tabs = fixtureTabs.filter((t) => t !== 'Payments')
    expect(() => parseWorkbook('Sample', tabs, fixtureValues)).toThrow(SchemaError)
    try {
      parseWorkbook('Sample', tabs, fixtureValues)
    } catch (e) {
      expect((e as SchemaError).problems).toEqual([{ tab: 'Payments', message: 'Tab "Payments" is missing.' }])
    }
  })

  it('reports missing headers', () => {
    const values = { ...fixtureValues, Payments: [['date', 'card']] }
    expect(() => parseWorkbook('Sample', fixtureTabs, values)).toThrow('Tab "Payments" is missing column(s): card_id, amount.')
  })

  it('reports a missing card statement tab', () => {
    const tabs = fixtureTabs.filter((t) => t !== 'CC Beta')
    expect(() => parseWorkbook('Sample', tabs, fixtureValues)).toThrow('Tab "CC Beta" for card "Beta" is missing.')
  })
})

describe('isoDate', () => {
  it.each([
    ['2030-01-05', '2030-01-05'],
    ['2030-1-5', '2030-01-05'],
    ['1/5/2030', '2030-01-05'],
    ['10/09/26', '2026-10-09'],
    ['', ''],
    ['soon', ''],
  ])('normalizes %s', (input, expected) => {
    expect(isoDate(input)).toBe(expected)
  })

  it('converts Sheets serial numbers', () => {
    expect(isoDate(47484)).toBe('2030-01-01')
  })
})
