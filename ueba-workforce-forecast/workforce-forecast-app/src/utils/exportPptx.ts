import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import pptxgen from 'pptxgenjs'
import {
  LayoutDashboard, TrendingUp, List, PieChart, ArrowLeftRight,
  Users, Palmtree, CalendarX, Clock, type LucideIcon,
} from 'lucide-react'
import type { Direction } from '../types'
import { FAMILY_COLOR, FAMILY_ORDER } from '../constants/families'
import capgeminiLogoSvg from '../assets/capgeminiBlue.svg?raw'

// Dérivé mécaniquement de la signature réelle d'addSlide plutôt que d'un chemin d'import de
// type incertain (`PptxGenJS.Slide` dépend de la façon dont pptxgenjs fusionne classe/espace
// de noms dans ses .d.ts) — garanti correct quelle que soit cette organisation interne.
type PptxSlide = ReturnType<InstanceType<typeof pptxgen>['addSlide']>

// --- Palette — reprise strictement de la validation design (FAMILY_COLOR réservé au seul
// graphique de répartition par famille, jamais utilisé ailleurs). ---
const CAP_BLUE = '0070AD'
const CAP_BLUE_LIGHT = '8FC7E8'
const NAVY = '0B3D66'
const DARK_TEXT = '1A1A1A' // première ligne du titre de couverture
const PAGE_BG = 'F7FAFD' // fond légèrement teinté bleu, sur toutes les slides
const CARD_WHITE = 'FFFFFF' // cartes KPI et cartes graphique, pour se détacher du fond
const CARD_TINT = 'EAF3FA' // fond des badges d'icône
const GREY_TEXT = '6B7280'
const GREY_LINE = 'E4E8EE' // grille des graphiques + séparateur fin des cartes KPI
const CARD_SHADOW = '9AA5B1'

const FONT_DISPLAY = 'Cambria'
const FONT_BODY = 'Calibri'

const SLIDE_W = 13.33
const SLIDE_H = 7.5
const MARGIN_X = 0.5
const FOOTER_Y = 7.08
const TOTAL_SLIDES = 6

// `btoa` est global aussi bien dans le navigateur (environnement réel d'exécution) que sous
// Node ≥ 16 (environnement des tests Vitest) — un seul chemin d'encodage suffit.
function toBase64(input: string): string {
  return btoa(unescape(encodeURIComponent(input)))
}
function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${toBase64(svg)}`
}

// Logo officiel Capgemini déjà présent dans le projet (src/assets/capgeminiBlue.svg, utilisé
// par le header web via components/Logo.tsx) — jamais régénéré ni remplacé par un placeholder.
const LOGO_DATA_URI = svgDataUri(capgeminiLogoSvg)
const LOGO_H = 0.34
const LOGO_W = LOGO_H * (285 / 65) // ratio natif du viewBox du fichier (285x65)

// --- Icônes réelles (lucide-react, déjà une dépendance du projet) — rendues en SVG statique
// via React (même technique que le logo) plutôt que recopiées à la main : garanti identique
// à la bibliothèque installée, jamais un glyphe texte ("→", "≡"...) en guise d'icône. ---
type IconKey = 'dashboard' | 'trend' | 'list' | 'pie' | 'swap' | 'users' | 'palmtree' | 'calendarX' | 'clock'
const ICON_COMPONENTS: Record<IconKey, LucideIcon> = {
  dashboard: LayoutDashboard, trend: TrendingUp, list: List, pie: PieChart, swap: ArrowLeftRight,
  users: Users, palmtree: Palmtree, calendarX: CalendarX, clock: Clock,
}
function iconDataUri(Icon: LucideIcon, colorHex: string): string {
  return svgDataUri(renderToStaticMarkup(createElement(Icon, { color: `#${colorHex}`, strokeWidth: 2, size: 24 })))
}
const ICON_DATA_URI = Object.fromEntries(
  (Object.keys(ICON_COMPONENTS) as IconKey[]).map((key) => [key, iconDataUri(ICON_COMPONENTS[key], CAP_BLUE)]),
) as Record<IconKey, string>

const BADGE_SIZE = 0.46

// --- Ossature répétée sur chaque slide ---

function addLogo(slide: PptxSlide, position: 'left' | 'right') {
  const x = position === 'left' ? MARGIN_X : SLIDE_W - 0.3 - LOGO_W
  slide.addImage({ data: LOGO_DATA_URI, x, y: 0.3, w: LOGO_W, h: LOGO_H })
}

// `pageNum` omis = pas de numéro (couverture uniquement — cf. cercle navy en bas-droite,
// contraste illisible pour un numéro de page à cet endroit).
function addFooter(slide: PptxSlide, pageNum?: number) {
  slide.addText('Workforce Forecast — Capgemini Engineering · Usage interne', {
    x: MARGIN_X, y: FOOTER_Y, w: 8, h: 0.3, fontSize: 8.5, color: GREY_TEXT, fontFace: FONT_BODY,
  })
  if (pageNum !== undefined) {
    slide.addText(`${pageNum} / ${TOTAL_SLIDES}`, {
      x: SLIDE_W - MARGIN_X - 0.8, y: FOOTER_Y, w: 0.8, h: 0.3, fontSize: 8.5, color: GREY_TEXT,
      fontFace: FONT_BODY, align: 'right',
    })
  }
}

// Deux cercles superposés (bleu clair derrière, navy devant), petits et discrets — le motif
// « allégé » des slides de contenu (2 à 6), toujours à des coordonnées différentes d'une
// slide à l'autre, jamais dans le coin bas-droit (y tombe le numéro de page).
function addWatermarkPair(slide: PptxSlide, back: { cx: number; cy: number; r: number }, front: { cx: number; cy: number; r: number }) {
  slide.addShape('ellipse', {
    x: back.cx - back.r, y: back.cy - back.r, w: back.r * 2, h: back.r * 2,
    fill: { color: CAP_BLUE_LIGHT, transparency: 55 }, line: { type: 'none' },
  })
  slide.addShape('ellipse', {
    x: front.cx - front.r, y: front.cy - front.r, w: front.r * 2, h: front.r * 2,
    fill: { color: NAVY, transparency: 62 }, line: { type: 'none' },
  })
}

function addWhiteCard(slide: PptxSlide, box: { x: number; y: number; w: number; h: number }) {
  slide.addShape('roundRect', {
    ...box, rectRadius: 0.08, fill: { color: CARD_WHITE }, line: { type: 'none' },
    shadow: { type: 'outer', color: CARD_SHADOW, opacity: 0.22, blur: 6, angle: 90, offset: 2 },
  })
}

function addBadge(slide: PptxSlide, x: number, y: number, size: number, icon: IconKey) {
  slide.addShape('ellipse', { x, y, w: size, h: size, fill: { color: CARD_TINT }, line: { color: CAP_BLUE, width: 1 } })
  const iconSize = size * 0.46
  slide.addImage({ data: ICON_DATA_URI[icon], x: x + (size - iconSize) / 2, y: y + (size - iconSize) / 2, w: iconSize, h: iconSize })
}

// Bandeau eyebrow + titre + badge d'icône, identique en position sur les slides de contenu.
function addSectionHeader(slide: PptxSlide, opts: { eyebrow: string; title: string; icon: IconKey }) {
  addBadge(slide, MARGIN_X, 0.32, BADGE_SIZE, opts.icon)
  const textX = MARGIN_X + BADGE_SIZE + 0.18
  slide.addText(opts.eyebrow.toUpperCase(), {
    x: textX, y: 0.28, w: SLIDE_W - textX - 1.6, h: 0.28, fontSize: 11, bold: true,
    color: CAP_BLUE, fontFace: FONT_BODY, charSpacing: 1.5,
  })
  slide.addText(opts.title, {
    x: textX, y: 0.55, w: SLIDE_W - textX - 1.6, h: 0.5, fontSize: 24, bold: true,
    color: NAVY, fontFace: FONT_DISPLAY,
  })
}

// Style commun aux 4 graphiques natifs (slides 3-6) : grille horizontale fine uniquement,
// axes gris, jamais de titre de graphique dupliqué (le titre de la slide suffit déjà).
// ATTENTION : la grille "horizontale" est portée par l'axe des VALEURS pour un axe de valeurs
// vertical (ligne, aire, colonnes) mais par l'axe des CATÉGORIES pour des barres horizontales
// (barDir:'bar', ETP par projet) — l'orientation physique de chaque axe s'inverse avec
// barDir, pas son rôle sémantique dans l'API (vérifié au contrôle visuel).
const AXIS_STYLE_VERTICAL_VALUES = {
  catAxisLineColor: GREY_TEXT, catAxisLabelColor: GREY_TEXT, catGridLine: { style: 'none' as const },
  valAxisLineColor: GREY_TEXT, valAxisLabelColor: GREY_TEXT, valGridLine: { color: GREY_LINE, size: 0.75 },
  showTitle: false,
}
const AXIS_STYLE_HORIZONTAL_BARS = {
  catAxisLineColor: GREY_TEXT, catAxisLabelColor: GREY_TEXT, catGridLine: { color: GREY_LINE, size: 0.75 },
  valAxisLineColor: GREY_TEXT, valAxisLabelColor: GREY_TEXT, valGridLine: { style: 'none' as const },
  showTitle: false,
}

// Carte blanche commune aux 4 slides graphique (cahier des charges : jamais un graphique posé
// directement sur le fond teinté) — le graphique est inset à l'intérieur, jamais collé au bord.
const CHART_CARD_BOX = { x: MARGIN_X, y: 1.55, w: SLIDE_W - 2 * MARGIN_X, h: 5.15 }
const CHART_INSET = 0.24
const CHART_AREA = {
  x: CHART_CARD_BOX.x + CHART_INSET, y: CHART_CARD_BOX.y + CHART_INSET,
  w: CHART_CARD_BOX.w - 2 * CHART_INSET, h: CHART_CARD_BOX.h - 2 * CHART_INSET,
}
function addChartCard(slide: PptxSlide) {
  addWhiteCard(slide, CHART_CARD_BOX)
}

// --- Illustration originale de la couverture (formes vectorielles + 2 mini-graphiques
// natifs éditables — jamais une image bitmap) : un écran avec un graphique à barres, une
// carte flottante "donut" en haut-gauche, une carte flottante "tendance" en haut-droite, une
// loupe navy qui survole le coin bas-droit de l'écran. ---
function addCoverIllustration(slide: PptxSlide) {
  // Écran (moniteur) avec graphique à barres bleu/bleu clair alterné
  const screenX = 7.5, screenY = 2.15, screenW = 4.9, screenH = 3.3
  addWhiteCard(slide, { x: screenX, y: screenY, w: screenW, h: screenH })
  const barBaseline = screenY + screenH - 0.28
  const barHeights = [0.85, 1.5, 1.05, 1.95, 1.3]
  const barW = 0.42, barGap = 0.22
  const barsTotalW = barHeights.length * barW + (barHeights.length - 1) * barGap
  const barsX0 = screenX + (screenW - barsTotalW) / 2
  barHeights.forEach((h, i) => {
    slide.addShape('roundRect', {
      x: barsX0 + i * (barW + barGap), y: barBaseline - h, w: barW, h, rectRadius: 0.04,
      fill: { color: i % 2 === 0 ? CAP_BLUE : CAP_BLUE_LIGHT }, line: { type: 'none' },
    })
  })
  // Pied du moniteur
  slide.addShape('rect', { x: screenX + screenW / 2 - 0.11, y: screenY + screenH, w: 0.22, h: 0.2, fill: { color: GREY_TEXT }, line: { type: 'none' } })
  slide.addShape('roundRect', { x: screenX + screenW / 2 - 0.42, y: screenY + screenH + 0.2, w: 0.84, h: 0.08, rectRadius: 0.03, fill: { color: GREY_TEXT }, line: { type: 'none' } })

  // Carte flottante — mini donut chart natif, en haut-gauche de l'écran
  const donutCard = { x: 6.85, y: 1.55, w: 1.65, h: 1.4 }
  addWhiteCard(slide, donutCard)
  slide.addChart('doughnut', [
    { name: 'Répartition', labels: ['Production', 'Bench', 'Autres'], values: [45, 30, 25] },
  ], {
    x: donutCard.x + 0.18, y: donutCard.y + 0.15, w: donutCard.w - 0.36, h: donutCard.h - 0.3,
    chartColors: [CAP_BLUE, CAP_BLUE_LIGHT, 'D6E6F5'], showLegend: false, showValue: false, showTitle: false,
    dataBorder: { pt: 1, color: 'FFFFFF' }, holeSize: 55,
  })

  // Carte flottante — mini graphique de tendance natif, en haut-droite de l'écran
  const trendCard = { x: 11.45, y: 1.65, w: 1.55, h: 1.05 }
  addWhiteCard(slide, trendCard)
  slide.addChart('line', [
    { name: 'Tendance', labels: ['1', '2', '3', '4', '5', '6'], values: [3, 5, 4, 6, 5, 7] },
  ], {
    x: trendCard.x + 0.12, y: trendCard.y + 0.15, w: trendCard.w - 0.24, h: trendCard.h - 0.3,
    chartColors: [CAP_BLUE], showLegend: false, showTitle: false, catAxisHidden: true, valAxisHidden: true,
    lineSize: 2.25, lineDataSymbol: 'none',
  })

  // Loupe (cercle + poignée, navy) survolant le coin bas-droit de l'écran
  const lensCx = 12.05, lensCy = 5.05, lensR = 0.4
  slide.addShape('ellipse', {
    x: lensCx - lensR, y: lensCy - lensR, w: lensR * 2, h: lensR * 2,
    fill: { color: CARD_WHITE }, line: { color: NAVY, width: 2.75 },
  })
  slide.addShape('line', {
    x: lensCx + lensR * 0.62, y: lensCy + lensR * 0.62, w: 0.42, h: 0.38,
    line: { color: NAVY, width: 5 },
  })
}

export interface DashboardPptxPayload {
  direction: Direction
  kpis: { effectif: number; tauxProd: number; tauxBench: number; tauxAbsence: number; etpTotal: number; etpData: { code: string; nom: string; client: string; etp: number }[] }
  deptComparison: { departement: string; tauxProduction: number }[]
  monthly: { mois: string; tauxProduction: number }[]
  familySeries: { mois: string; Production: number; Bench: number; Management: number; Formation: number; Alternance: number; Absence: number }[]
  periodLabel: string // ex. "12 derniers mois" — voir data/dashboardPeriod.ts::periodLabel
}

// Construction pure de la présentation, séparée de l'écriture sur disque — testable sans
// déclencher un téléchargement (cf. exportDashboardPptx ci-dessous, qui l'enveloppe).
export function buildDashboardPptx(payload: DashboardPptxPayload): pptxgen {
  const pptx = new pptxgen()
  pptx.defineLayout({ name: 'CAP', width: SLIDE_W, height: SLIDE_H })
  pptx.layout = 'CAP'

  // ================= Slide 1 : couverture =================
  const cover = pptx.addSlide()
  cover.background = { color: PAGE_BG }

  // Motif de cercles décoratifs (dessinés en premier, donc derrière tout le reste)
  cover.addShape('ellipse', { x: -1.4, y: -1.4, w: 1.8, h: 1.8, fill: { color: CAP_BLUE }, line: { type: 'none' } }) // fragment plein, haut-gauche
  cover.addShape('ellipse', { x: 11.9, y: -1.4, w: 2.2, h: 2.2, fill: { type: 'none' }, line: { color: CAP_BLUE, width: 1.25 } }) // anneau fin, haut-droite
  // anneau fin pâle, bas-gauche — un rayon de 0.7 centré à (-0.5, 8.0) passe presque pile par
  // le coin de la slide (0, 7.5) : le fragment réellement visible était un pixel ou deux,
  // invisible au rendu quelle que soit la couleur (vérifié au contrôle visuel). Rayon plus
  // généreux, mêmes proportions que le fragment plein du coin haut-gauche.
  cover.addShape('ellipse', { x: -1.6, y: 7.0, w: 2.1, h: 2.1, fill: { type: 'none' }, line: { color: GREY_TEXT, width: 1.25, transparency: 55 } })
  cover.addShape('ellipse', { x: 11.7, y: 6.6, w: 2.6, h: 2.6, fill: { color: CAP_BLUE_LIGHT, transparency: 25 }, line: { type: 'none' } }) // bas-droite : bleu clair derrière
  cover.addShape('ellipse', { x: 11.6, y: 6.5, w: 1.8, h: 1.8, fill: { color: NAVY, transparency: 15 }, line: { type: 'none' } }) // bas-droite : navy devant

  addLogo(cover, 'left')
  cover.addText([
    { text: 'Tableau de bord', options: { color: DARK_TEXT, breakLine: true } },
    { text: 'de pilotage', options: { color: CAP_BLUE } },
  ], { x: MARGIN_X, y: 1.5, w: 6.2, h: 1.7, fontSize: 40, bold: true, fontFace: FONT_BODY, lineSpacing: 42 })
  cover.addText('Suivi mensuel de la production, du bench et des effectifs engagés.', {
    x: MARGIN_X, y: 3.25, w: 6.0, h: 0.5, fontSize: 14, italic: true, color: GREY_TEXT, fontFace: FONT_BODY,
  })
  cover.addText([
    { text: 'Destiné à : ', options: { color: GREY_TEXT } },
    { text: 'Head of Direction', options: { color: NAVY, bold: true } },
    { text: ` — ${payload.direction.nom}`, options: { color: GREY_TEXT } },
  ], { x: MARGIN_X, y: 3.85, w: 6.0, h: 0.4, fontSize: 13, fontFace: FONT_BODY })

  addCoverIllustration(cover)
  addFooter(cover) // pas de numéro de page sur la couverture

  // ================= Slide 2 : indicateurs clés =================
  const kpiSlide = pptx.addSlide()
  kpiSlide.background = { color: PAGE_BG }
  addWatermarkPair(kpiSlide, { cx: -0.4, cy: -0.4, r: 1.1 }, { cx: 0.05, cy: 0.05, r: 0.65 })
  addSectionHeader(kpiSlide, { eyebrow: 'Indicateurs', title: payload.direction.nom, icon: 'dashboard' })
  kpiSlide.addText(`Rapport de pilotage · ${payload.periodLabel}`, {
    x: MARGIN_X + BADGE_SIZE + 0.18, y: 1.08, w: 10, h: 0.35, fontSize: 13, italic: true,
    color: GREY_TEXT, fontFace: FONT_BODY,
  })

  const kpiCards: { icon: IconKey; label: string; value: string; suffix?: string }[] = [
    { icon: 'users', label: 'Effectif', value: String(payload.kpis.effectif) },
    { icon: 'trend', label: 'Taux de production', value: String(payload.kpis.tauxProd), suffix: '%' },
    { icon: 'palmtree', label: 'Taux de bench', value: String(payload.kpis.tauxBench), suffix: '%' },
    { icon: 'calendarX', label: "Taux d'absence", value: String(payload.kpis.tauxAbsence), suffix: '%' },
    { icon: 'clock', label: 'ETP total engagé', value: String(payload.kpis.etpTotal) },
  ]
  const cardY = 1.55, cardW = 2.3, cardH = 1.7, cardGap = 0.2
  kpiCards.forEach((k, i) => {
    const x = MARGIN_X + i * (cardW + cardGap)
    addWhiteCard(kpiSlide, { x, y: cardY, w: cardW, h: cardH })
    addBadge(kpiSlide, x + cardW / 2 - 0.19, cardY + 0.16, 0.38, k.icon)
    const valueRuns: pptxgen.TextProps[] = [{ text: k.value, options: { fontSize: 30, bold: true, color: NAVY } }]
    if (k.suffix) valueRuns.push({ text: k.suffix, options: { fontSize: 17, bold: true, color: CAP_BLUE } })
    kpiSlide.addText(valueRuns, { x, y: cardY + 0.62, w: cardW, h: 0.5, align: 'center', valign: 'middle', fontFace: FONT_DISPLAY })
    kpiSlide.addShape('line', { x: x + 0.4, y: cardY + 1.2, w: cardW - 0.8, h: 0.01, line: { color: GREY_LINE, width: 1 } })
    kpiSlide.addText(k.label.toUpperCase(), {
      x, y: cardY + 1.3, w: cardW, h: 0.32, align: 'center', fontSize: 10, bold: true,
      color: GREY_TEXT, fontFace: FONT_BODY, charSpacing: 0.5,
    })
  })
  addLogo(kpiSlide, 'right')
  addFooter(kpiSlide, 2)

  // ================= Slide 3 : évolution mensuelle =================
  const lineSlide = pptx.addSlide()
  lineSlide.background = { color: PAGE_BG }
  addWatermarkPair(lineSlide, { cx: -0.35, cy: 7.85, r: 1.05 }, { cx: 0.05, cy: 7.55, r: 0.6 })
  addSectionHeader(lineSlide, { eyebrow: 'Tendance', title: 'Évolution mensuelle du taux de production', icon: 'trend' })
  addChartCard(lineSlide)
  lineSlide.addChart('line', [
    { name: 'Taux de production (%)', labels: payload.monthly.map((m) => m.mois), values: payload.monthly.map((m) => m.tauxProduction) },
  ], {
    ...CHART_AREA, ...AXIS_STYLE_VERTICAL_VALUES,
    chartColors: [CAP_BLUE], showLegend: false, valAxisTitle: '%', catAxisLabelFontSize: 10,
    lineSize: 2.5, lineDataSymbol: 'none',
  })
  addLogo(lineSlide, 'right')
  addFooter(lineSlide, 3)

  // ================= Slide 4 : ETP par projet =================
  const etpSlide = pptx.addSlide()
  etpSlide.background = { color: PAGE_BG }
  addWatermarkPair(etpSlide, { cx: 13.55, cy: 3.75, r: 1.0 }, { cx: 13.2, cy: 3.45, r: 0.58 })
  addSectionHeader(etpSlide, { eyebrow: 'Projets', title: 'ETP par projet', icon: 'list' })
  addChartCard(etpSlide)
  etpSlide.addChart('bar', [
    { name: 'ETP', labels: payload.kpis.etpData.map((p) => p.code), values: payload.kpis.etpData.map((p) => p.etp) },
  ], {
    ...CHART_AREA, ...AXIS_STYLE_HORIZONTAL_BARS,
    barDir: 'bar', chartColors: [CAP_BLUE], showLegend: false,
    showValue: true, dataLabelPosition: 'outEnd', dataLabelColor: NAVY, dataLabelFontSize: 10,
    dataLabelFontFace: FONT_BODY, dataLabelFormatCode: '0.0',
  })
  addLogo(etpSlide, 'right')
  addFooter(etpSlide, 4)

  // ================= Slide 5 : répartition par famille d'activité =================
  const familySlide = pptx.addSlide()
  familySlide.background = { color: PAGE_BG }
  addWatermarkPair(familySlide, { cx: 13.6, cy: 1.95, r: 0.95 }, { cx: 13.25, cy: 2.2, r: 0.55 })
  addSectionHeader(familySlide, { eyebrow: 'Activité', title: "Répartition par famille d'activité dans le temps", icon: 'pie' })
  addChartCard(familySlide)
  familySlide.addChart(
    'area',
    FAMILY_ORDER.map((fam) => ({
      name: fam,
      labels: payload.familySeries.map((m) => m.mois),
      values: payload.familySeries.map((m) => m[fam]),
    })),
    {
      ...CHART_AREA, ...AXIS_STYLE_VERTICAL_VALUES,
      barGrouping: 'stacked', showLegend: true, legendPos: 'b',
      valAxisTitle: '%', catAxisLabelFontSize: 10, chartColors: FAMILY_ORDER.map((fam) => FAMILY_COLOR[fam].replace('#', '')),
    },
  )
  addLogo(familySlide, 'right')
  addFooter(familySlide, 5)

  // ================= Slide 6 : comparatif entre départements =================
  const deptSlide = pptx.addSlide()
  deptSlide.background = { color: PAGE_BG }
  addWatermarkPair(deptSlide, { cx: -0.35, cy: 4.6, r: 1.0 }, { cx: 0.0, cy: 4.3, r: 0.58 })
  addSectionHeader(deptSlide, { eyebrow: 'Comparatif', title: 'Comparatif entre départements — taux de production', icon: 'swap' })
  addChartCard(deptSlide)
  deptSlide.addChart('bar', [
    { name: 'Taux de production (%)', labels: payload.deptComparison.map((d) => d.departement), values: payload.deptComparison.map((d) => d.tauxProduction) },
  ], {
    ...CHART_AREA, ...AXIS_STYLE_VERTICAL_VALUES,
    chartColors: [NAVY], showLegend: false, valAxisTitle: '%',
    showValue: true, dataLabelPosition: 'outEnd', dataLabelColor: NAVY, dataLabelFontSize: 10,
    dataLabelFontFace: FONT_BODY, dataLabelFormatCode: '0"%"',
  })
  addLogo(deptSlide, 'right')
  addFooter(deptSlide, 6)

  return pptx
}

export async function exportDashboardPptx(payload: DashboardPptxPayload) {
  const pptx = buildDashboardPptx(payload)
  const filename = `Workforce-Forecast_${payload.direction.nom.replace(/\s+/g, '-')}_${new Date().toISOString().slice(0, 10)}.pptx`
  await pptx.writeFile({ fileName: filename })
}
