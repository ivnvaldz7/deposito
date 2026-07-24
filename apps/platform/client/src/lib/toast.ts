import { toast as sonnerToast } from 'sonner'

const TOAST_COLORS = {
  success: { style: 'border: 1px solid var(--color-success, #22c55e); background: var(--color-surface-container-high, #1e1e2a); color: var(--color-on-surface, #e4e4ec);' },
  warning: { style: 'border: 1px solid var(--color-warning, #eab308); background: var(--color-surface-container-high, #1e1e2a); color: var(--color-on-surface, #e4e4ec);' },
  error: { style: 'border: 1px solid var(--color-error, #ef4444); background: var(--color-surface-container-high, #1e1e2a); color: var(--color-on-surface, #e4e4ec);' },
  info: { style: 'border: 1px solid var(--color-outline, #6b7280); background: var(--color-surface-container-high, #1e1e2a); color: var(--color-on-surface, #e4e4ec);' },
} as const

export const toast = {
  success: (message: string) => sonnerToast.success(message, TOAST_COLORS.success),
  warning: (message: string) => sonnerToast.warning(message, TOAST_COLORS.warning),
  error: (message: string) => sonnerToast.error(message, TOAST_COLORS.error),
  info: (message: string) => sonnerToast.info(message, TOAST_COLORS.info),
}
