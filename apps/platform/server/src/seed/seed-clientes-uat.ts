import 'dotenv/config'
import { platformDb as prisma } from '@platform/db'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[.,;:()[\]{}!¿?"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function main() {
  const filePath = resolve(__dirname, 'data', 'clientes-raw.txt')
  const rawText = readFileSync(filePath, 'utf-8')
  
  const lines = rawText.split('\n').filter(Boolean)
  console.log(`Total recibidos: ${lines.length}`)

  let creados = 0
  let actualizados = 0
  let yaExistentes = 0
  let conflictos = 0
  
  const finalNames: string[] = []
  const createdIds: string[] = []

  const dbClientes = await prisma.cliente.findMany()
  const dbNormalized = new Map(dbClientes.map(c => [normalizeForMatch(c.nombre), c]))

  for (const line of lines) {
    const parts = line.split('|').map(p => p.trim())
    if (parts.length < 3) continue
    
    const [nombre, direccion, provincia] = parts
    const norm = normalizeForMatch(nombre)
    
    const exactMatch = dbClientes.find(c => c.nombre === nombre)
    const normMatch = dbNormalized.get(norm)
    
    const existing = exactMatch || normMatch
    
    if (existing) {
      // Existe
      let changed = false
      const updateData: any = {}
      
      if (!existing.direccion && direccion) {
        updateData.direccion = direccion
        changed = true
      }
      if (!existing.provincia && provincia) {
        updateData.provincia = provincia
        changed = true
      }
      
      if (changed) {
        await prisma.cliente.update({
          where: { id: existing.id },
          data: updateData
        })
        actualizados++
      } else {
        yaExistentes++
      }
      finalNames.push(existing.nombre)
    } else {
      // No existe, crear
      const created = await prisma.cliente.create({
        data: {
          nombre,
          direccion,
          provincia,
          estado: 'VALIDADO'
        }
      })
      creados++
      finalNames.push(created.nombre)
      createdIds.push(created.id)
    }
  }

  console.log(`---
Ya existentes: ${yaExistentes}
Creados: ${creados}
Actualizados por campos vacíos: ${actualizados}
Conflictos/dudosos: ${conflictos}
Total nombres finales: ${finalNames.length}

Listado de nombres finales:`)
  finalNames.forEach(n => console.log(` - ${n}`))
}

main().catch(console.error).finally(() => prisma.$disconnect())
