import { useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { getStoredTheme, setTheme, type ThemeMode } from '@/lib/theme'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 mt-10 border-b border-outline-variant pb-2 font-heading text-xl font-bold text-on-surface first:mt-0">
      {children}
    </h2>
  )
}

function SubSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 mt-6 font-heading text-base font-semibold text-on-surface-variant">
      {children}
    </h3>
  )
}

function Swatch({ name, color }: { name: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-10 w-10 shrink-0 rounded border border-outline-variant"
        style={{ backgroundColor: color }}
      />
      <div className="min-w-0">
        <p className="font-body text-sm font-medium text-on-surface">{name}</p>
        <p className="font-body text-xs text-on-surface-variant">{color}</p>
      </div>
    </div>
  )
}

export default function DesignPreviewPage() {
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(
    () => getStoredTheme() ?? 'dark',
  )
  const [inputValue, setInputValue] = useState('')
  const [inputError, setInputError] = useState('')
  const [selectValue, setSelectValue] = useState('')

  function handleToggleTheme() {
    const next: ThemeMode = currentTheme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setCurrentTheme(next)
  }

  const selectOptions = [
    { value: 'option-1', label: 'Opción 1' },
    { value: 'option-2', label: 'Opción 2' },
    { value: 'option-3', label: 'Opción 3' },
  ]

  return (
    <div className="min-h-screen bg-surface-lowest">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-outline-variant bg-surface-lowest/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="font-heading text-2xl font-bold text-on-surface">
            Sistema de Diseño
          </h1>
          <button
            type="button"
            onClick={handleToggleTheme}
            className="flex items-center gap-2 rounded bg-surface-high px-3 py-2 font-heading text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-highest hover:text-on-surface"
          >
            {currentTheme === 'dark' ? (
              <>
                <Sun size={16} strokeWidth={1.5} />
                Modo claro
              </>
            ) : (
              <>
                <Moon size={16} strokeWidth={1.5} />
                Modo oscuro
              </>
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* ===== Paleta de Colores ===== */}
        <SectionTitle>Paleta de Colores</SectionTitle>

        <SubSectionTitle>Superficies</SubSectionTitle>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
          <Swatch name="surface-lowest" color="var(--color-surface-lowest, #0a0f0b)" />
          <Swatch name="surface-low" color="var(--color-surface-low, #181d18)" />
          <Swatch name="surface-container" color="var(--color-surface-container, #1e231e)" />
          <Swatch name="surface-high" color="var(--color-surface-high, #262b27)" />
          <Swatch name="surface-highest" color="var(--color-surface-highest, #313631)" />
          <Swatch name="surface-bright" color="var(--color-surface-bright, #353b35)" />
        </div>

        <SubSectionTitle>Primario</SubSectionTitle>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Swatch name="primary" color="var(--color-primary, #54e16d)" />
          <Swatch name="primary-container" color="var(--color-primary-container, #00ae42)" />
          <Swatch name="on-primary" color="var(--color-on-primary, #003918)" />
          <Swatch name="on-primary-container" color="var(--color-on-primary-container, #00380f)" />
        </div>

        <SubSectionTitle>Semánticos</SubSectionTitle>
        <div className="grid grid-cols-3 gap-4">
          <Swatch name="success" color="var(--color-success, #00ae42)" />
          <Swatch name="warning" color="var(--color-warning, #ff9800)" />
          <Swatch name="error" color="var(--color-error, #cf6679)" />
        </div>

        {/* ===== Tipografía ===== */}
        <SectionTitle>Tipografía</SectionTitle>

        <SubSectionTitle>Montserrat (font-heading)</SubSectionTitle>
        <div className="space-y-2">
          <h1 className="font-heading text-4xl font-bold text-on-surface">
            h1 — Título principal (text-4xl bold)
          </h1>
          <h2 className="font-heading text-2xl font-bold text-on-surface">
            h2 — Título secundario (text-2xl bold)
          </h2>
          <h3 className="font-heading text-xl font-semibold text-on-surface">
            h3 — Título terciario (text-xl semibold)
          </h3>
          <h4 className="font-heading text-lg font-semibold text-on-surface">
            h4 — Título cuaternario (text-lg semibold)
          </h4>
          <h5 className="font-heading text-base font-semibold text-on-surface">
            h5 — Título quinto (text-base semibold)
          </h5>
          <h6 className="font-heading text-sm font-semibold text-on-surface">
            h6 — Título sexto (text-sm semibold)
          </h6>
        </div>

        <SubSectionTitle>Inter (font-body)</SubSectionTitle>
        <div className="space-y-1">
          <p className="font-body text-xs text-on-surface">text-xs — Cuerpo pequeño</p>
          <p className="font-body text-sm text-on-surface">text-sm — Cuerpo normal</p>
          <p className="font-body text-base text-on-surface">text-base — Cuerpo grande</p>
          <p className="font-body text-lg text-on-surface">text-lg — Encabezado ligero</p>
          <p className="font-body text-xl text-on-surface">text-xl — Texto destacado</p>
        </div>

        {/* ===== Botones ===== */}
        <SectionTitle>Botones</SectionTitle>

        <SubSectionTitle>Variante: primary</SubSectionTitle>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button variant="primary" size="md">
            Medium
          </Button>
          <Button variant="primary" size="lg">
            Large
          </Button>
        </div>

        <SubSectionTitle>Variante: secondary</SubSectionTitle>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm">
            Small
          </Button>
          <Button variant="secondary" size="md">
            Medium
          </Button>
          <Button variant="secondary" size="lg">
            Large
          </Button>
        </div>

        <SubSectionTitle>Variante: ghost</SubSectionTitle>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm">
            Small
          </Button>
          <Button variant="ghost" size="md">
            Medium
          </Button>
          <Button variant="ghost" size="lg">
            Large
          </Button>
        </div>

        <SubSectionTitle>Variante: outline</SubSectionTitle>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm">
            Small
          </Button>
          <Button variant="outline" size="md">
            Medium
          </Button>
          <Button variant="outline" size="lg">
            Large
          </Button>
        </div>

        <SubSectionTitle>Loading state</SubSectionTitle>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" loading size="md">
            Cargando
          </Button>
          <Button variant="secondary" loading size="md">
            Cargando
          </Button>
          <Button variant="outline" loading size="md">
            Cargando
          </Button>
        </div>

        <SubSectionTitle>Disabled state</SubSectionTitle>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled size="md">
            Disabled
          </Button>
          <Button variant="secondary" disabled size="md">
            Disabled
          </Button>
          <Button variant="ghost" disabled size="md">
            Disabled
          </Button>
          <Button variant="outline" disabled size="md">
            Disabled
          </Button>
        </div>

        {/* ===== Input ===== */}
        <SectionTitle>Input</SectionTitle>

        <SubSectionTitle>Normal</SubSectionTitle>
        <Input
          value={inputValue}
          onChange={setInputValue}
          placeholder="Escribe algo…"
          className="max-w-sm"
        />

        <SubSectionTitle>Con label</SubSectionTitle>
        <Input
          label="Nombre"
          value={inputValue}
          onChange={setInputValue}
          placeholder="Tu nombre"
          className="max-w-sm"
        />

        <SubSectionTitle>Con error</SubSectionTitle>
        <Input
          label="Email"
          value={inputError}
          onChange={(v) => {
            setInputError(v)
          }}
          placeholder="email@ejemplo.com"
          error="Este campo es obligatorio"
          className="max-w-sm"
        />

        <SubSectionTitle>Con icono</SubSectionTitle>
        <Input
          label="Buscar"
          value={inputValue}
          onChange={setInputValue}
          placeholder="Buscar…"
          className="max-w-sm"
        />

        {/* ===== Badges ===== */}
        <SectionTitle>Badges</SectionTitle>

        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="default">Default</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="error">Error</Badge>
          <Badge variant="info">Info</Badge>
        </div>

        {/* ===== Card ===== */}
        <SectionTitle>Card</SectionTitle>

        <SubSectionTitle>Con header, body y footer</SubSectionTitle>
        <Card className="max-w-md">
          <CardHeader>Título de la tarjeta</CardHeader>
          <CardBody>
            <p className="font-body text-sm text-on-surface-variant">
              Este es el contenido del cuerpo de la tarjeta. Puede contener
              cualquier elemento — texto, formularios, tablas, etc.
            </p>
          </CardBody>
          <CardFooter>
            <Button variant="primary" size="sm">
              Acción
            </Button>
          </CardFooter>
        </Card>

        <SubSectionTitle>Padding: sm</SubSectionTitle>
        <Card className="max-w-sm">
          <CardBody padding="sm">
            <p className="font-body text-sm text-on-surface-variant">
              Contenido con padding sm (p-3).
            </p>
          </CardBody>
        </Card>

        <SubSectionTitle>Padding: lg</SubSectionTitle>
        <Card className="max-w-sm">
          <CardBody padding="lg">
            <p className="font-body text-sm text-on-surface-variant">
              Contenido con padding lg (p-6).
            </p>
          </CardBody>
        </Card>

        {/* ===== Skeleton ===== */}
        <SectionTitle>Skeleton</SectionTitle>

        <SubSectionTitle>Text variant</SubSectionTitle>
        <div className="max-w-sm space-y-2">
          <Skeleton variant="text" />
          <Skeleton variant="text" width="75%" />
          <Skeleton variant="text" width="50%" />
        </div>

        <SubSectionTitle>Circle variant</SubSectionTitle>
        <div className="flex items-center gap-3">
          <Skeleton variant="circle" width={48} height={48} />
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="text" width="40%" />
          </div>
        </div>

        <SubSectionTitle>Card variant</SubSectionTitle>
        <div className="grid max-w-sm grid-cols-2 gap-3">
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>

        {/* ===== Select ===== */}
        <SectionTitle>Select</SectionTitle>

        <SubSectionTitle>Normal</SubSectionTitle>
        <Select
          options={selectOptions}
          value={selectValue}
          onChange={setSelectValue}
          placeholder="Seleccioná una opción"
          className="max-w-sm"
        />

        <SubSectionTitle>Con label</SubSectionTitle>
        <Select
          label="Categoría"
          options={selectOptions}
          value={selectValue}
          onChange={setSelectValue}
          placeholder="Seleccioná una categoría"
          className="max-w-sm"
        />

        <SubSectionTitle>Con error</SubSectionTitle>
        <Select
          label="Tipo"
          options={selectOptions}
          value={selectValue}
          onChange={setSelectValue}
          placeholder="Elegí un tipo"
          error="Seleccioná una opción válida"
          className="max-w-sm"
        />

        {/* ===== Micro-animaciones ===== */}
        <SectionTitle>Micro-animaciones</SectionTitle>

        <SubSectionTitle>Fade-in</SubSectionTitle>
        <div
          className="animate-fade-in rounded bg-surface-high px-4 py-3"
          key={currentTheme}
        >
          <p className="font-body text-sm text-on-surface">
            Este div aparece con fade-in al cambiar de tema.
          </p>
        </div>

        <SubSectionTitle>Slide-up</SubSectionTitle>
        <div
          className="animate-slide-up rounded bg-surface-high px-4 py-3"
          key={`slide-${currentTheme}`}
        >
          <p className="font-body text-sm text-on-surface">
            Este div aparece con slide-up desde abajo.
          </p>
        </div>

        <SubSectionTitle>Scale hover</SubSectionTitle>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" className="animate-scale-hover">
            Hover me
          </Button>
          <Button variant="secondary" className="animate-scale-hover">
            Hover me
          </Button>
          <Button variant="outline" className="animate-scale-hover">
            Hover me
          </Button>
        </div>

        {/* spacer */}
        <div className="h-16" />
      </main>
    </div>
  )
}
