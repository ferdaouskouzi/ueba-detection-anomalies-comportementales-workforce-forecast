import { useEffect, useState } from 'react'
import type { AppUser, Lang, Role } from './types'
import RoleSelect from './components/RoleSelect'
import Login from './components/Login'
import ForcePasswordChange from './components/ForcePasswordChange'
import AuthenticatedApp from './components/AuthenticatedApp'
import ThemeLangToggle from './components/ThemeLangToggle'
import { ReferenceDataProvider } from './context/ReferenceDataContext'
import { fetchMe, logout as apiLogout } from './api/authApi'
import { clearToken, getToken, mapBackendUser } from './auth/session'
import { applyTheme, getInitialTheme, type Theme } from './theme'
import { ROLE_LOGIN_PATHS, roleFromPath } from './routing'

type PreAuthScreen = { step: 'select' } | { step: 'login'; role: Role }

function preAuthScreenFromLocation(): PreAuthScreen {
  const role = roleFromPath(window.location.pathname)
  return role ? { step: 'login', role } : { step: 'select' }
}

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [lang, setLang] = useState<Lang>('FR')
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme())
  const [preAuthScreen, setPreAuthScreen] = useState<PreAuthScreen>(() => preAuthScreenFromLocation())

  function handleChangeTheme(t: Theme) {
    setTheme(t)
    applyTheme(t)
  }

  // Restaure la session si un jeton d'accès valide est déjà en mémoire (recharge de page)
  useEffect(() => {
    const token = getToken()
    if (!token) {
      setCheckingSession(false)
      return
    }
    fetchMe(token)
      .then((backendUser) => setUser(mapBackendUser(backendUser)))
      .catch(() => clearToken())
      .finally(() => setCheckingSession(false))
  }, [])

  // Navigation avant connexion : reflète le profil choisi dans l'URL (ex. /login/admin) et
  // suit le bouton précédent/suivant du navigateur, sans dépendance à un routeur externe.
  useEffect(() => {
    function onPopState() {
      setPreAuthScreen(preAuthScreenFromLocation())
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function goToRoleSelect() {
    setPreAuthScreen({ step: 'select' })
    window.history.pushState(null, '', '/')
  }

  function goToRoleLogin(role: Role) {
    setPreAuthScreen({ step: 'login', role })
    window.history.pushState(null, '', ROLE_LOGIN_PATHS[role])
  }

  // Issue de secours depuis l'écran de changement de mot de passe forcé (must_change_password)
  // — un utilisateur qui ne peut/veut pas le compléter tout de suite ne doit jamais rester
  // bloqué sans recours. Invalide la session en cours (comme une déconnexion normale) et
  // renvoie à la sélection de rôle : ne contourne PAS l'obligation, l'utilisateur retombera
  // sur ce même écran forcé à sa prochaine connexion tant qu'il n'a pas changé son mot de passe.
  function handleCancelForcedPasswordChange() {
    const token = getToken()
    if (token) apiLogout(token).catch(() => void 0)
    clearToken()
    setUser(null)
    goToRoleSelect()
  }

  if (checkingSession) {
    return <div className="app-shell" />
  }

  if (!user) {
    if (preAuthScreen.step === 'select') {
      return (
        <div className="app-shell">
          <ThemeLangToggle theme={theme} onChangeTheme={handleChangeTheme} lang={lang} onChangeLang={setLang} />
          <RoleSelect lang={lang} onSelect={goToRoleLogin} />
        </div>
      )
    }
    return (
      <div className="app-shell">
        <ThemeLangToggle theme={theme} onChangeTheme={handleChangeTheme} lang={lang} onChangeLang={setLang} />
        <Login
          role={preAuthScreen.role}
          lang={lang}
          onBack={goToRoleSelect}
          onLogin={(loggedInUser) => {
            setUser(loggedInUser)
            window.history.pushState(null, '', '/')
          }}
        />
      </div>
    )
  }

  if (user.mustChangePassword) {
    return (
      <div className="app-shell">
        <ThemeLangToggle theme={theme} onChangeTheme={handleChangeTheme} lang={lang} onChangeLang={setLang} />
        <ForcePasswordChange
          lang={lang}
          onChanged={() => setUser({ ...user, mustChangePassword: false })}
          onCancel={handleCancelForcedPasswordChange}
        />
      </div>
    )
  }

  return (
    <ReferenceDataProvider>
      <AuthenticatedApp
        user={user}
        lang={lang}
        onChangeLang={setLang}
        theme={theme}
        onChangeTheme={handleChangeTheme}
        onLogout={() => {
          setUser(null)
          goToRoleSelect()
        }}
      />
    </ReferenceDataProvider>
  )
}
