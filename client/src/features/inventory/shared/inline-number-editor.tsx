import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'

interface InlineNumberEditorProps {
  value: number
  onSave: (nextValue: number) => Promise<void>
  label?: string
}

export function InlineNumberEditor({
  value,
  onSave,
  label = 'cantidad',
}: InlineNumberEditorProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  useEffect(() => {
    if (editing) {
      inputRef.current?.select()
    }
  }, [editing])

  async function commit() {
    const nextValue = Number(draft)
    if (Number.isNaN(nextValue) || nextValue < 0 || nextValue === value) {
      setDraft(String(value))
      setEditing(false)
      return
    }

    setSaving(true)
    try {
      await onSave(nextValue)
    } catch {
      setDraft(String(value))
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  function cancel() {
    setDraft(String(value))
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') void commit()
    if (e.key === 'Escape') cancel()
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="number"
          min="0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => void commit()}
          disabled={saving}
          className="input-field w-24 py-1 text-sm"
          aria-label={`Editar ${label}`}
        />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            void commit()
          }}
          className="text-primary transition-colors hover:text-primary/80"
          title="Confirmar"
          aria-label={`Confirmar ${label}`}
        >
          <Check size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            cancel()
          }}
          className="text-on-surface-variant transition-colors hover:text-on-surface"
          title="Cancelar"
          aria-label={`Cancelar edición de ${label}`}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex items-center gap-2 text-left"
      title={`Editar ${label}`}
      aria-label={`Editar ${label}`}
    >
      <span className="font-body tabular-nums text-on-surface">{value}</span>
      <Pencil
        size={12}
        strokeWidth={1.5}
        className="text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  )
}
