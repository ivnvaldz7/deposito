import { apiClient, ApiError } from '@/lib/api-client'

const BASE = '/deposito'

/**
 * Wrapper de apiClient con prefijo /deposito automatico.
 *
 * Todas las rutas del módulo deposito están montadas bajo /api/deposito/* en el server,
 * pero los pages usan paths relativos al módulo (ej: /drogas, /actas).
 * Este wrapper se encarga de agregar el prefijo para que las URLs queden correctas:
 *   api.get('/drogas') → /api/deposito/drogas
 */
function dep(path: string): string {
  return `${BASE}${path}`
}

export const api = {
  get: <T>(path: string, token?: string | null): Promise<T> =>
    apiClient.get<T>(dep(path), token),

  post: <T>(path: string, body?: unknown, token?: string | null): Promise<T> =>
    apiClient.post<T>(dep(path), body, token),

  postForm: <T>(path: string, formData: FormData, token?: string | null): Promise<T> =>
    apiClient.postForm<T>(dep(path), formData, token),

  put: <T>(path: string, body?: unknown, token?: string | null): Promise<T> =>
    apiClient.put<T>(dep(path), body, token),

  patch: <T>(path: string, body?: unknown, token?: string | null): Promise<T> =>
    apiClient.patch<T>(dep(path), body, token),

  del: <T>(path: string, token?: string | null): Promise<T> =>
    apiClient.del<T>(dep(path), token),

  getBlob: (path: string): Promise<Blob> =>
    apiClient.getBlob(dep(path)),
}

export { ApiError }
