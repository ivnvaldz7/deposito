import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { aleBetApi } from '../lib/api'

export const automationKeys = {
  all: ['automation'] as const,
  aliases: () => [...automationKeys.all, 'aliases'] as const,
  drafts: () => [...automationKeys.all, 'drafts'] as const,
  draft: (id: string) => [...automationKeys.drafts(), id] as const,
}

export function useCreateDraft() {
  return useMutation({
    mutationFn: (originalText: string) => aleBetApi.automation.createDraft({ originalText }),
  })
}

export function useDraft(id: string | null) {
  return useQuery({
    queryKey: automationKeys.draft(id!),
    queryFn: () => aleBetApi.automation.getDraft(id!),
    enabled: !!id,
  })
}

export function useUpdateDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => aleBetApi.automation.updateDraft(id, data),
    onSuccess: (data, variables) => {
      return queryClient.invalidateQueries({ queryKey: automationKeys.draft(variables.id) })
    },
  })
}

export function useConfirmDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, expectedVersion, idempotencyKey }: { id: string; expectedVersion: number; idempotencyKey: string }) =>
      aleBetApi.automation.confirmDraft(id, { expectedVersion }, { idempotencyKey }),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      queryClient.invalidateQueries({ queryKey: automationKeys.draft(variables.id) })
    },
  })
}

export function useAutomationAliases() {
  return useQuery({
    queryKey: automationKeys.aliases(),
    queryFn: () => aleBetApi.automation.getAliases(),
  })
}

export function useDeleteAutomationAlias() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ type, id }: { type: 'product' | 'client'; id: string }) =>
      type === 'product' ? aleBetApi.automation.deleteProductAlias(id) : aleBetApi.automation.deleteClientAlias(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: automationKeys.aliases() }),
  })
}
