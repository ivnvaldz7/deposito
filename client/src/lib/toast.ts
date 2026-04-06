import type { ReactNode } from 'react'
import { toast as sonnerToast, type ExternalToast } from 'sonner'

const TOAST_COLORS = {
  success: '#00AE42',
  warning: '#FF9800',
  error: '#f44336',
  info: '#2196f3',
} as const

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized
  const parsed = Number.parseInt(value, 16)

  const r = (parsed >> 16) & 255
  const g = (parsed >> 8) & 255
  const b = parsed & 255

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function withVariant(color: string, options?: ExternalToast): ExternalToast {
  return {
    ...options,
    style: {
      border: `1px solid ${hexToRgba(color, 0.18)}`,
      boxShadow: `inset 0 0 0 1px ${hexToRgba(color, 0.08)}, 0 0 24px 0 rgba(0, 0, 0, 0.15)`,
      ...(options?.style ?? {}),
    },
  }
}

export const toast = {
  success(message: ReactNode, options?: ExternalToast) {
    return sonnerToast.success(message, withVariant(TOAST_COLORS.success, options))
  },
  warning(message: ReactNode, options?: ExternalToast) {
    return sonnerToast.warning(message, withVariant(TOAST_COLORS.warning, options))
  },
  error(message: ReactNode, options?: ExternalToast) {
    return sonnerToast.error(message, withVariant(TOAST_COLORS.error, options))
  },
  info(message: ReactNode, options?: ExternalToast) {
    return sonnerToast.info(message, withVariant(TOAST_COLORS.info, options))
  },
}
