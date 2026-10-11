import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyTheme, getInitialTheme } from './theme'
import './styles.css'

applyTheme(getInitialTheme()) // avant le premier rendu, pour éviter un flash de thème

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
