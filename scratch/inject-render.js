import fs from 'fs'

const targetPath = 'apps/platform/client/src/modules/ale-bet/pages/PedidoDetailPage.tsx'
const newRenderPath = 'scratch/new-render.tsx'

const content = fs.readFileSync(targetPath, 'utf8')
const newRender = fs.readFileSync(newRenderPath, 'utf8')

const startStr = "  return (\n    <div className={cn('space-y-5', barraArmadorVisible && 'pb-[calc(env(safe-area-inset-bottom)+7rem)] lg:pb-0')}>\n      <header className=\"flex flex-wrap items-start justify-between gap-3\">"
const endStr = "      <CambiarClienteSheet"

const startIndex = content.indexOf(startStr)
const endIndex = content.indexOf(endStr, startIndex)

if (startIndex === -1) {
  console.error("Start string not found")
  process.exit(1)
}

if (endIndex === -1) {
  console.error("End string not found")
  process.exit(1)
}

const finalContent = content.substring(0, startIndex) + newRender + "\n" + content.substring(endIndex)
fs.writeFileSync(targetPath, finalContent)
console.log("Replacement successful!")
