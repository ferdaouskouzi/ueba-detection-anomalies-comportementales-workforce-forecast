import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import type { Direction } from '../types'
import { buildDashboardPptx, type DashboardPptxPayload } from './exportPptx'

const direction: Direction = { id: 'D1', nom: 'Ingénierie Automobile' }

const payload: DashboardPptxPayload = {
  direction,
  kpis: { effectif: 2, tauxProd: 88, tauxBench: 0, tauxAbsence: 12, etpTotal: 1.75, etpData: [{ code: 'PRJ_A', nom: 'Projet A', client: 'ClientA', etp: 1 }] },
  deptComparison: [{ departement: 'Powertrain Systems', tauxProduction: 88 }],
  monthly: [{ mois: 'Janv 26', tauxProduction: 88 }],
  familySeries: [{ mois: 'Janv 26', Production: 75, Bench: 0, Management: 0, Formation: 0, Alternance: 0, Absence: 25 }],
  periodLabel: '12 derniers mois',
}

// pptxgenjs génère un .pptx = une archive zip OOXML. On inspecte son contenu (sans jamais
// écrire de fichier sur disque, cf. buildDashboardPptx qui sépare la construction pure de
// l'écriture) pour vérifier qu'une slide et son graphique existent réellement, pas
// seulement que l'appel n'a pas levé d'exception.
async function buildZip(pptx: ReturnType<typeof buildDashboardPptx>) {
  const buffer = await pptx.write({ outputType: 'nodebuffer' })
  return JSZip.loadAsync(buffer as Uint8Array)
}

async function slideXmls(zip: JSZip) {
  const slideFiles = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort()
  return Promise.all(slideFiles.map((f) => zip.files[f].async('string')))
}

describe('buildDashboardPptx — 6 slides (couverture dédiée + 5 slides de contenu)', () => {
  it('génère exactement 6 slides : couverture, indicateurs, évolution mensuelle, ETP par projet, répartition par famille, comparatif départements', async () => {
    const xmls = await slideXmls(await buildZip(buildDashboardPptx(payload)))
    expect(xmls.length).toBe(6)
    const hasFamilyTitle = xmls.some((xml) => xml.includes('Répartition par famille') && xml.includes('dans le temps'))
    expect(hasFamilyTitle).toBe(true)
  })

  it("la couverture affiche le titre en 2 lignes, le sous-titre, la ligne destinataire — et rien d'auto-généré", async () => {
    const xmls = await slideXmls(await buildZip(buildDashboardPptx(payload)))
    const cover = xmls[0]
    expect(cover).toContain('Tableau de bord')
    expect(cover).toContain('de pilotage')
    expect(cover).toContain('Suivi mensuel')
    expect(cover).toContain('Destiné à')
    expect(cover).toContain('Head of Direction')
    expect(cover).toContain(direction.nom)
    // Explicitement exclu par la demande : pas de mention "généré automatiquement".
    expect(cover.toLowerCase()).not.toContain('généré')
    expect(cover.toLowerCase()).not.toContain('automatique')
  })

  it("la couverture n'affiche aucun numéro de page (cercle navy en bas-droite, contraste illisible)", async () => {
    const xmls = await slideXmls(await buildZip(buildDashboardPptx(payload)))
    expect(xmls[0]).not.toMatch(/>1 \/ 6</)
    expect(xmls[0]).toContain('Workforce Forecast') // le texte de pied de page reste seul, à gauche
  })

  it('les slides de contenu (2 à 6) portent chacune leur numéro de page "X / 6"', async () => {
    const xmls = await slideXmls(await buildZip(buildDashboardPptx(payload)))
    for (let i = 1; i < 6; i++) {
      expect(xmls[i]).toContain(`${i + 1} / 6`)
    }
  })

  it("la slide Indicateurs affiche les 5 cartes KPI, le contexte de période, et plus de ligne de périmètre", async () => {
    const xmls = await slideXmls(await buildZip(buildDashboardPptx(payload)))
    const kpiSlide = xmls[1]
    expect(kpiSlide).toContain(direction.nom)
    expect(kpiSlide).toContain(payload.periodLabel)
    // Labels en petites majuscules (design) — comparaison sur la forme réellement rendue
    // (l'apostrophe est échappée en &apos; dans le XML OOXML).
    ;['EFFECTIF', 'TAUX DE PRODUCTION', 'TAUX DE BENCH', 'TAUX D&apos;ABSENCE', 'ETP TOTAL ENGAGÉ'].forEach((label) => {
      expect(kpiSlide).toContain(label)
    })
    // Retiré par la demande : la ligne de périmètre était un texte descriptif sans utilité
    // pratique immédiate (même règle que le nettoyage déjà fait sur le reste de l'app).
    expect(kpiSlide).not.toContain('Périmètre')
  })

  it('le graphique de la slide famille est un graphique natif éditable (aire empilée), pas une image', async () => {
    const zip = await buildZip(buildDashboardPptx(payload))
    const chartFiles = Object.keys(zip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))
    const chartXmls = await Promise.all(chartFiles.map((f) => zip.files[f].async('string')))

    const areaChart = chartXmls.find((xml) => xml.includes('<c:areaChart>') && xml.includes('val="stacked"'))
    expect(areaChart).toBeTruthy()
    // Les 6 familles du référentiel doivent toutes apparaître comme séries du graphique.
    ;['Production', 'Bench', 'Management', 'Formation', 'Alternance', 'Absence'].forEach((fam) => {
      expect(areaChart).toContain(fam)
    })
  })

  it('6 graphiques natifs au total (4 slides de contenu + 2 mini-graphiques dans l\'illustration de couverture) — jamais une capture d\'écran', async () => {
    const zip = await buildZip(buildDashboardPptx(payload))
    const chartFiles = Object.keys(zip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))
    expect(chartFiles.length).toBe(6)
    const chartXmls = await Promise.all(chartFiles.map((f) => zip.files[f].async('string')))
    expect(chartXmls.some((xml) => xml.includes('<c:doughnutChart>'))).toBe(true)
  })
})

describe('buildDashboardPptx — logo officiel Capgemini (src/assets/capgeminiBlue.svg)', () => {
  it('incruste le fichier officiel existant (même tracé vectoriel), jamais un placeholder généré', async () => {
    const zip = await buildZip(buildDashboardPptx(payload))
    const mediaFiles = Object.keys(zip.files).filter((f) => /^ppt\/media\/.+\.svg$/.test(f))
    expect(mediaFiles.length).toBeGreaterThan(0)
    const svgContents = await Promise.all(mediaFiles.map((f) => zip.files[f].async('string')))
    // Fragment du tracé réel du logo (src/assets/capgeminiBlue.svg) — prouve qu'il s'agit du
    // fichier officiel et non d'un logo de substitution.
    expect(svgContents.some((xml) => xml.includes('0058AB'))).toBe(true)
  })

  it('le logo apparaît sur les 6 slides (référence embarquée par relation, une par slide)', async () => {
    const zip = await buildZip(buildDashboardPptx(payload))
    const relsFiles = Object.keys(zip.files).filter((f) => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(f))
    expect(relsFiles.length).toBe(6)
    const relsXmls = await Promise.all(relsFiles.map((f) => zip.files[f].async('string')))
    relsXmls.forEach((xml) => {
      expect(xml).toMatch(/relationships\/image/)
    })
  })
})

describe('buildDashboardPptx — icônes réelles (lucide-react), jamais un glyphe texte', () => {
  it("aucun badge de section ni carte KPI n'utilise un caractère texte en guise d'icône", async () => {
    const xmls = await slideXmls(await buildZip(buildDashboardPptx(payload)))
    xmls.forEach((xml) => {
      expect(xml).not.toContain('>→<')
      expect(xml).not.toContain('>≡<')
    })
  })

  it('chaque badge est une image vectorielle embarquée (svg), pas une forme texte', async () => {
    const zip = await buildZip(buildDashboardPptx(payload))
    const mediaFiles = Object.keys(zip.files).filter((f) => /^ppt\/media\/.+\.svg$/.test(f))
    // Logo (1) + 9 icônes distinctes (dashboard, trend, list, pie, swap, users, palmtree,
    // calendarX, clock) réutilisées entre badges de section et cartes KPI.
    expect(mediaFiles.length).toBeGreaterThanOrEqual(10)
  })
})
