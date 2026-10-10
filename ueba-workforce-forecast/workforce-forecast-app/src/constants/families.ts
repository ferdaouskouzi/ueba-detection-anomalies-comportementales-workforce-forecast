import type { Famille } from '../types'

// Source unique des libellés/couleurs par famille d'activité — remplace les
// deux copies dupliquées qui existaient dans ForecastGrid.tsx et DashboardDirection.tsx.
export const FAMILY_LABEL: Record<Famille, string> = {
  Production: 'Prod',
  Bench: 'Bench',
  Management: 'Mgmt',
  Formation: 'Form.',
  Alternance: 'Alt.',
  Absence: 'Abs.',
}

export const FAMILY_COLOR: Record<Famille, string> = {
  Production: '#0070AD',
  Bench: '#8FC7E8',
  Management: '#5B4B9C',
  Formation: '#2FA88E',
  Alternance: '#E8A33D',
  Absence: '#D9534F',
}

export const FAMILY_ORDER: Famille[] = ['Production', 'Bench', 'Management', 'Formation', 'Alternance', 'Absence']
