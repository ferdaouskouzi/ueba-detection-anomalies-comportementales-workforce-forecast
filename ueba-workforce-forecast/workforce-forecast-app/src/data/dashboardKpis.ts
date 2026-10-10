import type { ActivityCode, Department, Employee, Famille, ForecastEntry, Project } from '../types'

export interface DashboardFilters {
  departmentIds: string[] // périmètre département déjà résolu (direction + éventuel deptFilter)
  clientFilter: string
  projectFilter: string
  periodDates: Set<string>
}

export interface EtpByProject { code: string; nom: string; client: string; etp: number }

export interface DashboardKpis {
  effectif: number
  tauxProd: number
  tauxBench: number
  tauxAbsence: number
  etpTotal: number
  etpData: EtpByProject[]
}

// Seul un code à projet obligatoire (référentiel activity_code.projet_obligatoire) porte un
// projet (règle R1) : dès qu'un filtre client et/ou projet est actif, toute demi-journée qui
// n'est pas affectée au projet (et au client) visé est exclue de TOUS les calculs — cahier
// des charges §2.6, "les 4 filtres sont cumulables". Dérivé du référentiel, jamais un code
// "P" en dur : aujourd'hui seul P a projetObligatoire=true, mais rien ne doit se briser
// silencieusement si un second code obligatoire est ajouté un jour (cf. resolveActivityCode,
// déjà le point de vérité unique utilisé par ForecastGrid pour la même condition de saisie).
export function matchesClientProject(e: ForecastEntry, projects: Project[], activityCodes: ActivityCode[], clientFilter: string, projectFilter: string): boolean {
  if (!clientFilter && !projectFilter) return true
  if (!resolveActivityCode(e, activityCodes).projetObligatoire || !e.projectCode) return false
  if (projectFilter && e.projectCode !== projectFilter) return false
  if (clientFilter && projects.find((p) => p.code === e.projectCode)?.client !== clientFilter) return false
  return true
}

// Un Head of Direction reçoit du serveur un ForecastEntry dont le code a déjà été agrégé à
// la valeur littérale "Absence" (cahier des charges §4.2) — cette valeur ne correspond à
// aucun ActivityCode réel du référentiel, donc un simple activityCodes.find(...).famille
// échouerait silencieusement et sous-compterait le taux d'absence, à l'écran comme dans les
// exports. Point de vérité unique pour toute lecture de famille depuis un ForecastEntry,
// valable aussi bien pour le détail exact (EUM_EUD) que pour le code déjà masqué (HOD).
export function resolveFamille(e: ForecastEntry, activityCodes: ActivityCode[]): Famille | undefined {
  if (e.code === 'Absence') return 'Absence'
  return activityCodes.find((c) => c.code === e.code)?.famille
}

// ActivityCode "élargi" : un code déjà masqué ou réellement inconnu du référentiel n'a pas
// de famille assignable avec certitude (cf. UNKNOWN_ACTIVITY_CODE_FALLBACK ci-dessous),
// contrairement à un ActivityCode réel du référentiel où elle est toujours renseignée.
export type ResolvedActivityCode = Omit<ActivityCode, 'famille'> & { famille?: Famille }

// Repli pour le code déjà masqué "Absence" (§4.2) — état normal et attendu pour un Head of
// Direction, jamais une anomalie. Couleur neutre, libellé générique : la cellule reste
// visuellement distincte d'une case vide plutôt que de disparaître silencieusement (cf.
// resolveFamille ci-dessus pour le même problème côté taux agrégés).
const MASKED_ACTIVITY_CODE: ResolvedActivityCode = {
  code: '',
  libelle: 'Masqué',
  famille: 'Absence',
  projetObligatoire: false,
  couleur: '#9AA5B1',
}

// Repli pour un code réellement absent du référentiel, sans rapport avec le masquage RGPD
// (donnée corrompue, code retiré du référentiel, faute de saisie) — une anomalie à
// investiguer, contrairement au masquage "Absence" qui est un état normal. Couleur
// d'alerte distincte de MASKED_ACTIVITY_CODE pour que les deux cas ne se confondent
// jamais visuellement ; famille indéfinie car elle ne peut pas être déduite.
function unknownActivityCode(e: ForecastEntry): ResolvedActivityCode {
  return { code: e.code, libelle: 'Code inconnu', couleur: '#FFC107', famille: undefined, projetObligatoire: false }
}

// Même logique de résolution que resolveFamille(), pour les usages qui ont besoin de
// l'ActivityCode entier (couleur, libellé) plutôt que de la seule famille — ex. le style
// et l'infobulle d'une cellule de ForecastGrid. Distingue explicitement, comme
// resolveFamille, le code déjà masqué "Absence" (état normal) d'un code véritablement
// absent du référentiel (anomalie) : les deux cas ne doivent jamais renvoyer le même repli.
export function resolveActivityCode(e: ForecastEntry, activityCodes: ActivityCode[]): ResolvedActivityCode {
  if (e.code === 'Absence') return MASKED_ACTIVITY_CODE
  return activityCodes.find((c) => c.code === e.code) ?? unknownActivityCode(e)
}

// Point de vérité unique pour les KPI de tête, l'ETP par projet et le comparatif
// départements — fonction pure, testable sans rendre le composant React.
export function computeDashboardKpis(
  entries: Record<string, ForecastEntry>,
  employees: Employee[],
  projects: Project[],
  activityCodes: ActivityCode[],
  filters: DashboardFilters,
): DashboardKpis {
  const { departmentIds, clientFilter, projectFilter, periodDates } = filters
  const deptSet = new Set(departmentIds)
  const scopedPernrs = new Set(
    employees
      .filter((e) => e.departmentId != null && deptSet.has(e.departmentId) && (e.statut === 'Active' || e.statut === 'Unpaid Leave'))
      .map((e) => e.pernr),
  )
  const hasClientOrProject = Boolean(clientFilter || projectFilter)

  let prod = 0, bench = 0, absence = 0
  const activePernrs = new Set<string>()
  const etpByProject: Record<string, number> = {}

  Object.values(entries).forEach((e) => {
    if (!scopedPernrs.has(e.pernr)) return
    if (!periodDates.has(e.date)) return
    if (!matchesClientProject(e, projects, activityCodes, clientFilter, projectFilter)) return
    activePernrs.add(e.pernr)
    const meta = resolveActivityCode(e, activityCodes)
    if (meta.famille === 'Production') prod++
    if (meta.famille === 'Bench') bench++
    if (meta.famille === 'Absence') absence++
    if (meta.projetObligatoire && e.projectCode) etpByProject[e.projectCode] = (etpByProject[e.projectCode] ?? 0) + 1
  })

  // Avec un filtre client/projet actif, l'effectif se restreint aux collaborateurs
  // réellement staffés dessus — un effectif "département entier" n'aurait plus de sens
  // rapporté à un seul projet. Sans filtre, c'est l'effectif complet du périmètre.
  const effectif = hasClientOrProject ? activePernrs.size : scopedPernrs.size
  const periodLen = periodDates.size
  const total = effectif * periodLen * 2

  const etpData = Object.entries(etpByProject)
    .map(([code, halfDays]) => {
      const proj = projects.find((p) => p.code === code)
      return { code, nom: proj?.nom ?? code, client: proj?.client ?? '', etp: periodLen ? +(halfDays / 2 / periodLen).toFixed(2) : 0 }
    })
    .sort((a, b) => b.etp - a.etp)

  return {
    effectif,
    tauxProd: total ? Math.round((prod / total) * 100) : 0,
    tauxBench: total ? Math.round((bench / total) * 100) : 0,
    tauxAbsence: total ? Math.round((absence / total) * 100) : 0,
    etpTotal: periodLen ? +(prod / 2 / periodLen).toFixed(1) : 0,
    etpData,
  }
}

export interface EmployeeBreakdown {
  pernr: string
  nom: string
  departement: string
  tauxProd: number
  tauxBench: number
  tauxAbsence: number
  etp: number
}

// Détail par collaborateur pour la feuille "Par collaborateur" de l'export XLSX (cahier des
// charges §2.7 : une feuille par axe — collaborateur, projet, département). Mêmes filtres
// cumulables et même dénominateur que computeDashboardKpis, mais jamais de colonne
// exposant un code d'absence individuel — seulement le taux "Absence" agrégé (§4.2),
// ce qui protège aussi bien le détail exact reçu par un EUM_EUD que le code déjà masqué
// reçu par un Head of Direction (resolveFamille gère les deux cas identiquement).
export function computeEmployeeBreakdown(
  entries: Record<string, ForecastEntry>,
  employees: Employee[],
  departments: Department[],
  projects: Project[],
  activityCodes: ActivityCode[],
  filters: DashboardFilters,
): EmployeeBreakdown[] {
  const { departmentIds, clientFilter, projectFilter, periodDates } = filters
  const deptSet = new Set(departmentIds)
  const hasClientOrProject = Boolean(clientFilter || projectFilter)
  const periodLen = periodDates.size

  const scopedEmployees = employees.filter(
    (e) => e.departmentId != null && deptSet.has(e.departmentId) && (e.statut === 'Active' || e.statut === 'Unpaid Leave'),
  )
  const buckets = new Map(scopedEmployees.map((e) => [e.pernr, { prod: 0, bench: 0, absence: 0, total: 0 }]))

  Object.values(entries).forEach((e) => {
    const bucket = buckets.get(e.pernr)
    if (!bucket) return
    if (!periodDates.has(e.date)) return
    if (!matchesClientProject(e, projects, activityCodes, clientFilter, projectFilter)) return
    bucket.total++
    const fam = resolveFamille(e, activityCodes)
    if (fam === 'Production') bucket.prod++
    if (fam === 'Bench') bucket.bench++
    if (fam === 'Absence') bucket.absence++
  })

  // Avec un filtre client/projet actif, la feuille se restreint aux collaborateurs
  // réellement staffés dessus — même principe que l'effectif de computeDashboardKpis.
  return scopedEmployees
    .filter((emp) => !hasClientOrProject || (buckets.get(emp.pernr)?.total ?? 0) > 0)
    .map((emp) => {
      const b = buckets.get(emp.pernr)!
      const slots = periodLen * 2
      return {
        pernr: emp.pernr,
        nom: emp.nom,
        departement: departments.find((d) => d.id === emp.departmentId)?.nom ?? '',
        tauxProd: slots ? Math.round((b.prod / slots) * 100) : 0,
        tauxBench: slots ? Math.round((b.bench / slots) * 100) : 0,
        tauxAbsence: slots ? Math.round((b.absence / slots) * 100) : 0,
        etp: periodLen ? +(b.prod / 2 / periodLen).toFixed(2) : 0,
      }
    })
    .sort((a, b) => a.nom.localeCompare(b.nom))
}
