export const AUTOMATION_WORK_STORAGE_KEY = 'ale-bet:automation:work:v1'

export interface AutomationWorkState {
  originalText: string
  draftId: string | null
}

const EMPTY_AUTOMATION_WORK: AutomationWorkState = { originalText: '', draftId: null }

export function readAutomationWork(): AutomationWorkState {
  try {
    const raw = localStorage.getItem(AUTOMATION_WORK_STORAGE_KEY)
    if (!raw) return EMPTY_AUTOMATION_WORK

    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return EMPTY_AUTOMATION_WORK

    const stored = value as Record<string, unknown>
    if (stored.version !== 1 || typeof stored.originalText !== 'string') return EMPTY_AUTOMATION_WORK
    if (stored.draftId !== null && typeof stored.draftId !== 'string') return EMPTY_AUTOMATION_WORK

    return { originalText: stored.originalText, draftId: stored.draftId }
  } catch {
    return EMPTY_AUTOMATION_WORK
  }
}

export function persistAutomationWork(work: AutomationWorkState): void {
  try {
    if (!work.originalText && !work.draftId) {
      localStorage.removeItem(AUTOMATION_WORK_STORAGE_KEY)
      return
    }
    localStorage.setItem(AUTOMATION_WORK_STORAGE_KEY, JSON.stringify({ version: 1, ...work }))
  } catch {
    // Browser-local persistence is best effort; Automation remains usable.
  }
}

export function clearAutomationWork(): void {
  try {
    localStorage.removeItem(AUTOMATION_WORK_STORAGE_KEY)
  } catch {
    // Browser-local persistence is best effort; Automation remains usable.
  }
}
