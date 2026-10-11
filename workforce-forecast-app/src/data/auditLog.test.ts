import { describe, expect, it } from 'vitest'
import type { ForecastAuditEntry } from '../api/auditApi'
import {
  auditEntryTime,
  groupAuditEntriesByDay,
  recentAuditWindow,
  shiftAuditAnchor,
} from './auditLog'

function entry(quand: string, over: Partial<ForecastAuditEntry> = {}): ForecastAuditEntry {
  return { quand, qui: 'LEAD1', pernr: '0010001', date: '2026-09-01', demi: 'AM', avant: '—', apres: 'P/PRJ-001', ...over }
}

describe('recentAuditWindow — fenêtre glissante -> bornes serveur', () => {
  it('couvre les 7 jours calendaires se terminant à l\'ancre (bornes incluses)', () => {
    expect(recentAuditWindow('2026-08-27')).toEqual({ start: '2026-08-21', end: '2026-08-27' })
  })

  it('gère un changement de mois', () => {
    expect(recentAuditWindow('2026-09-03')).toEqual({ start: '2026-08-28', end: '2026-09-03' })
  })
})

describe('shiftAuditAnchor — prev/next, borné au présent', () => {
  it('recule de 7 jours', () => {
    expect(shiftAuditAnchor('2026-08-27', -7, '2026-08-28')).toBe('2026-08-20')
  })

  it('avance de 7 jours quand la marge le permet', () => {
    expect(shiftAuditAnchor('2026-08-10', 7, '2026-08-28')).toBe('2026-08-17')
  })

  it('ne dépasse jamais l\'ancre maximale (aujourd\'hui)', () => {
    expect(shiftAuditAnchor('2026-08-27', 7, '2026-08-28')).toBe('2026-08-28')
  })
})

describe('groupAuditEntriesByDay — regroupement par jour de `quand`', () => {
  it('groupe sur `quand` (heure réelle de l\'écriture), pas sur `date` (jour du créneau)', () => {
    const rows = [
      entry('2026-08-24T09:00:00', { apres: 'A' }),
      entry('2026-08-25T08:00:00', { apres: 'B' }),
      entry('2026-08-24T17:30:00', { apres: 'C' }),
    ]
    const groups = groupAuditEntriesByDay(rows)

    // 2 jours, le plus récent d'abord
    expect(groups.map((g) => g.day)).toEqual(['2026-08-25', '2026-08-24'])
    // à l'intérieur d'un jour : écriture la plus récente d'abord
    expect(groups[1].entries.map((e) => e.apres)).toEqual(['C', 'A'])
    // toutes les lignes ont le même `date` (2026-09-01) : n'a joué aucun rôle
    expect(new Set(rows.map((r) => r.date))).toEqual(new Set(['2026-09-01']))
  })

  it('un seul jour -> un seul groupe', () => {
    expect(groupAuditEntriesByDay([entry('2026-08-24T09:00:00')])).toHaveLength(1)
  })
})

describe('auditEntryTime', () => {
  it('rend HH:MM sans conversion de fuseau', () => {
    expect(auditEntryTime('2026-08-24T17:30:00')).toBe('17:30')
  })
})
