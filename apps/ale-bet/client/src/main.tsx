import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('No se encontró el elemento root')
}

const saved = localStorage.getItem('theme')
if (saved === 'light' || saved === 'dark') {
  document.documentElement.setAttribute('data-theme', saved)
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
