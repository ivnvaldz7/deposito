import 'dotenv/config'
import { prisma } from '../lib/prisma'

const clientes = [
  { nombre: 'ZENON', direccion: 'CORRIENTES 1165, GOYA', contacto: 'CORRIENTES' },
  { nombre: 'NORTE CORPORACION', direccion: 'SANTIAGO MORALES 453', contacto: 'SALTA' },
  { nombre: 'DROVET', direccion: 'GUTENBERG 1557, ROSARIO', contacto: 'SANTA FÉ' },
  { nombre: 'LA RED COMERCIAL SRL', direccion: 'URQUIZA 3050, ESPERANZA', contacto: 'SANTA FÉ' },
  { nombre: 'DISTRIBUIDORA TAURO', direccion: 'LIENCURA 8450 B° UOCRA, ARGUELLO', contacto: 'CORDOBA' },
  { nombre: 'PASINATO, HERNAN', direccion: 'PERON 640, MACIA', contacto: 'ENTRE RIOS' },
  { nombre: 'VET STORE', direccion: 'PASTEUR 289, BARRIO LAMADRID', contacto: 'CORDOBA' },
  { nombre: 'OLIVERA, LUCAS DARÍO', direccion: 'LA LAJA 2118, ALBARDÓN', contacto: 'SAN JUAN' },
  { nombre: 'BALBUENA, ROSA MANUELA', direccion: 'CONCEPCIÓN DEL URUGUAY 2793, OBERÁ', contacto: 'MISIONES' },
  { nombre: 'YUQUERY', direccion: 'RIVADAVIA 673, ESQUINA', contacto: 'CORRIENTES' },
  { nombre: 'SCHANG', direccion: 'SALCEDA 1502, TANDIL', contacto: 'BUENOS AIRES' },
  { nombre: 'REPISO, GUIDO RAFAEL', direccion: 'AVENIDA MADARIAGA 12, GOYA', contacto: 'CORRIENTES' },
  { nombre: 'ROSARIO INSUMOS AGROPECUARIOS S.A.', direccion: 'AV. GRAL PERON 3697, ROSARIO', contacto: 'SANTA FÉ' },
  { nombre: 'ARIEL JAUREGUIBERRY', direccion: 'BARRIO PARANA CASA 46, AV. RAMIREZ 4000', contacto: 'ENTRE RIOS' },
  { nombre: 'MOLINA, MARIANO-AVELINO, GIACOPUZZI', direccion: '25 DE MAYO 131, VILLAGUAY', contacto: 'ENTRE RIOS' },
  { nombre: 'TRT CHACO', direccion: 'SALTA 985, RESISTENCIA', contacto: 'CHACO' },
  { nombre: 'DOMVIL S.A.', direccion: 'CALLE 130, ACCESO RUTA 11', contacto: 'ENTRE RIOS' },
  { nombre: 'OTERO, JUSTO ROBERTO', direccion: 'AV. DE LOS INMIGRANTES, ALDEA SAN ANTONIO', contacto: 'ENTRE RIOS' },
  { nombre: 'VETERINARIA NORTE MIRANDA', direccion: '9 DE JULIO 788, AMEGHINO', contacto: 'BUENOS AIRES' },
  { nombre: 'VOCOS, ROMAN EZEQUIEL', direccion: 'PEAJE ANTONIO SAENZ, RIO CUARTO', contacto: 'CORDOBA' },
  { nombre: 'RENIERO, HUGO RAMON', direccion: 'BELGRANO 1805, CHAJARÍ', contacto: 'ENTRE RIOS' },
  { nombre: 'BARRIOS, MARIANELA', direccion: 'SARMIENTO 610, SAN LUIS DEL PALMAR', contacto: 'CORRIENTES' },
  { nombre: 'WIRTH, ALEXIS', direccion: 'RUTA 16 ENTRE 12 Y 14, ROQUE SAENZ PEÑA', contacto: 'CHACO' },
  { nombre: 'PIETRAGALLO, JUAN BAUTISTA', direccion: 'AVENIDA FERRÉ 2074', contacto: 'CORRIENTES' },
  { nombre: 'AGROVETERINARIA MI QUERENCIA', direccion: 'SARMIENTO 802, MERCEDES', contacto: 'CORRIENTES' },
  { nombre: 'BORDERES, GERMAN', direccion: 'GDOR. GOMEZ 767, CURUZÚ CUATIA', contacto: 'CORRIENTES' },
  { nombre: 'PICOLINI, JOSE', direccion: 'PAGO LARGO 1261, PASO DE LOS LIBRE', contacto: 'CORRIENTES' },
  { nombre: 'ALLEKOTE, ROMAN', direccion: 'CALLE 1 ESQUINA 6, CEIBAS', contacto: 'ENTRE RIOS' },
  { nombre: 'EDUARDO STERTZ E HIJOS', direccion: 'MARTIN PANUTTO 1167, VIALE', contacto: 'ENTRE RIOS' },
  { nombre: 'MAGLIETTI, GUSTAVO RAUL', direccion: 'SAAVEDRA 515, EL COLORADO', contacto: 'FORMOSA' },
  { nombre: 'LOS CHARABONES', direccion: 'URQUIZA 907, CONCORDIA', contacto: 'ENTRE RIOS' },
  { nombre: 'TRT SANTA FE', direccion: 'SAN JUAN 2430', contacto: 'SANTA FE' },
  { nombre: 'TRT MAR DEL PLATA', direccion: 'AVENIDA COLON 3725', contacto: 'BUENOS AIRES' },
  { nombre: 'OCAMPO, NICOLAS RUFINO', direccion: 'JUNIN 1269', contacto: 'SALTA' },
  { nombre: 'AMICO S.A.', direccion: 'HUIDOBRO 1064, GODOY CRUZ', contacto: 'MENDOZA' },
  { nombre: 'NATALIA YAFAR', direccion: 'LAVALLE 2594, ROSARIO', contacto: 'SANTA FE' },
  { nombre: 'DAROCA VICCO Y VERON S.A.', direccion: '25 DE MAYO 651, GUALEGUAYCHU', contacto: 'ENTRE RIOS' },
  { nombre: 'EL PRONUNCIAMIENTO', direccion: 'BERNARDO UCHITEL 399, BASAVILBASO', contacto: 'ENTRE RIOS' },
  { nombre: 'CORDERO, JOSE LUIS', direccion: 'SAN MARTIN 460, SANTA LUCIA', contacto: 'CORRIENTES' },
]

async function main(): Promise<void> {
  for (const cliente of clientes) {
    await prisma.cliente.upsert({
      where: { nombre: cliente.nombre },
      update: {},
      create: { ...cliente, activo: true },
    })
  }

  const total = await prisma.cliente.count()
  console.log(`Seed de clientes completado: ${clientes.length} procesados, ${total} en base`)
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
