export type ThemeMode = 'light' | 'dark'

const THEME_KEY = 'theme'

export function getStoredTheme(): ThemeMode | null {
  if (typeof window === 'undefined') return null

  const value = window.localStorage.getItem(THEME_KEY)
  return value === 'light' || value === 'dark' ? value : null
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
}

export function applyStoredTheme(): ThemeMode | null {
  const theme = getStoredTheme()
  if (theme) applyTheme(theme)
  return theme
}

export function setTheme(theme: ThemeMode): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_KEY, theme)
  }
  applyTheme(theme)
}

