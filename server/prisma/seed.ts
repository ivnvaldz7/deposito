import { PrismaClient, Mercado } from '@prisma/client'

const prisma = new PrismaClient()

const drogas = [
  'ACIDO CITRICO',
  'ACIDO OLEICO',
  'ALCOHOL BENCILICO',
  'ARGININA',
  'ATP',
  'ASPARTATO DE MAGNESIO',
  'ASPARTATO DE POTASIO',
  'CITRATO DE SODIO',
  'CLORURO CÚPRICO',
  'CLORURO DE BENZALCONIO',
  'CLORURO DE CALCIO',
  'CLORURO DE MAGNESIO',
  'CLORURO DE SODIO',
  'CLORURO DE ZINC',
  'DEXTROSA',
  'DIISOPROPILAMINA DICLOROACETATO',
  'EDETATO DE COBRE Y ZINC',
  'EDETATO DE ZINC',
  'EDTA',
  'FENOL',
  'FOSFATO DE SODIO',
  'GLICERINA',
  'GLICEROFORMAL',
  'GLUCONATO DE ZINC',
  'GLUCONATO DE CALCIO',
  'HIERRO CITRATO',
  'HIERRO CITRATO 50%',
  'IODURO DE SODIO',
  'ISOLEUCINA',
  'LECHE CONDENSADA',
  'LEUCINA',
  'LEVAMISOL',
  'LISINA',
  'NICOTINAMIDA',
  'NITRITO DE SODIO',
  'PANTOTENATO DE CALCIO',
  'PROPILENGLICOL',
  'PROPILPARABENO',
  'SELENITO DE SODIO',
  'SODA CAUSTICA',
  'SORBITOL',
  'TIMILCOSIN FOSFATO',
  'TWEEN',
  'VAINILLA AROMATICA',
  'VITAMINA A',
  'VITAMINA B1',
  'VITAMINA B12',
  'VITAMINA B6',
  'VITAMINA C',
  'VITAMINA D2',
  'VITAMINA E',
]

const estuches: { articulo: string; mercado: Mercado; cantidad: number }[] = [
  // Argentina (40)
  { articulo: 'AMANTINA PREMIUM 100 ML',       mercado: 'argentina',     cantidad: 0     },
  { articulo: 'AMANTINA PREMIUM 250 ML',       mercado: 'argentina',     cantidad: 1800  },
  { articulo: 'AMANTINA PREMIUM 500 ML NR',    mercado: 'argentina',     cantidad: 6800  },
  { articulo: 'AMANTINA 500 ML',               mercado: 'argentina',     cantidad: 1500  },
  { articulo: 'AMINOÁCIDOS 20ML',              mercado: 'argentina',     cantidad: 500   },
  { articulo: 'AMINOÁCIDO 100ML',              mercado: 'argentina',     cantidad: 1000  },
  { articulo: 'AMINOÁCIDO 250ML',              mercado: 'argentina',     cantidad: 640   },
  { articulo: 'AMINOÁCIDOS 50 ML AVES',        mercado: 'argentina',     cantidad: 2500  },
  { articulo: 'AMINOÁCIDOS 50 ML MASCOTA',     mercado: 'argentina',     cantidad: 2800  },
  { articulo: 'AMINOÁCIDOS 250 ML',            mercado: 'argentina',     cantidad: 1000  },
  { articulo: 'CALCITROVIT 500 ML',            mercado: 'argentina',     cantidad: 0     },
  { articulo: 'COMPLEJO B B12 B15 20 ML X12',  mercado: 'argentina',     cantidad: 250   },
  { articulo: 'COMPLEJO B B12 B15 100 ML',     mercado: 'argentina',     cantidad: 3200  },
  { articulo: 'COMPLEJO B B12 B15 250 ML',     mercado: 'argentina',     cantidad: 1100  },
  { articulo: 'COMPLEJO B HIERRO CERDOS 100 ML', mercado: 'argentina',   cantidad: 1800  },
  { articulo: 'COMPLEJO B HIERRO EQUINOS 100 ML', mercado: 'argentina',  cantidad: 900   },
  { articulo: 'CONTENEDOR BLANCO 25 ML',       mercado: 'argentina',     cantidad: 110   },
  { articulo: 'ENERGIZANTE 25 ML',             mercado: 'argentina',     cantidad: 2000  },
  { articulo: 'ENERGIZANTE 100 ML',            mercado: 'argentina',     cantidad: 900   },
  { articulo: 'ENERGIZANTE 100 ML NR',         mercado: 'argentina',     cantidad: 7200  },
  { articulo: 'ENERGIZANTE 250 ML',            mercado: 'argentina',     cantidad: 300   },
  { articulo: 'ENERGIZANTE 500 ML',            mercado: 'argentina',     cantidad: 300   },
  { articulo: 'IMIDOSAN B12 25ML',             mercado: 'argentina',     cantidad: 1900  },
  { articulo: 'IMIDOSAN B12 100ML',            mercado: 'argentina',     cantidad: 1400  },
  { articulo: 'IMIDOSAN B12 250ML',            mercado: 'argentina',     cantidad: 1500  },
  { articulo: 'IVERSAN 500 ML',                mercado: 'argentina',     cantidad: 1750  },
  { articulo: 'JERINGA 35 GR',                 mercado: 'argentina',     cantidad: 2000  },
  { articulo: 'OLIFAMISOL 500ML',              mercado: 'argentina',     cantidad: 1500  },
  { articulo: 'OLIVITASAN 25 ML',              mercado: 'argentina',     cantidad: 7000  },
  { articulo: 'OLIVITASAN 100 ML',             mercado: 'argentina',     cantidad: 5400  },
  { articulo: 'OLIVITASAN 300 ML',             mercado: 'argentina',     cantidad: 200   },
  { articulo: 'OLIVITASAN 300 ML NR',          mercado: 'argentina',     cantidad: 4800  },
  { articulo: 'OLIVITASAN 500 ML',             mercado: 'argentina',     cantidad: 18600 },
  { articulo: 'OLIVITASAN PLUS 50 ML',         mercado: 'argentina',     cantidad: 3600  },
  { articulo: 'OLIVITASAN PLUS 50 ML NR',      mercado: 'argentina',     cantidad: 6600  },
  { articulo: 'OLIVITASAN PLUS 250 ML',        mercado: 'argentina',     cantidad: 5000  },
  { articulo: 'OLIVITASAN PLUS 500 ML',        mercado: 'argentina',     cantidad: 6300  },
  { articulo: 'TILCOSAN 100 ML',               mercado: 'argentina',     cantidad: 2200  },
  { articulo: 'TILCOSAN 250 ML',               mercado: 'argentina',     cantidad: 1100  },
  { articulo: 'VITAMINA B12 100ML',            mercado: 'argentina',     cantidad: 1100  },
  // Colombia (10)
  { articulo: 'AMINOACIDOS 50 ML AVES',        mercado: 'colombia',      cantidad: 3500  },
  { articulo: 'AMINOACIDOS VIT ORAL 50 ML',    mercado: 'colombia',      cantidad: 500   },
  { articulo: 'ATP ENERGÍA 35 GR',             mercado: 'colombia',      cantidad: 100   },
  { articulo: 'COMPLEFOSEL 100 ML',            mercado: 'colombia',      cantidad: 2400  },
  { articulo: 'COMPLEFOSEL 500 ML',            mercado: 'colombia',      cantidad: 800   },
  { articulo: 'OLIVITASAN 25 ML',              mercado: 'colombia',      cantidad: 400   },
  { articulo: 'OLIVITASAN 100ML',              mercado: 'colombia',      cantidad: 0     },
  { articulo: 'OLIVITASAN 500 ML',             mercado: 'colombia',      cantidad: 4920  },
  { articulo: 'OLIVITASAN PREMIUM 50 ML',      mercado: 'colombia',      cantidad: 300   },
  { articulo: 'OLIVITASAN PREMIUM 500 ML',     mercado: 'colombia',      cantidad: 2200  },
  // México (12)
  { articulo: 'AMANTINA PREMIUM 250ML',        mercado: 'mexico',        cantidad: 0     },
  { articulo: 'AMANTINA PREMIUM 500 ML',       mercado: 'mexico',        cantidad: 1000  },
  { articulo: 'COMPLEJO B B12 B15 100 ML',     mercado: 'mexico',        cantidad: 0     },
  { articulo: 'ENERGIZANTE 25 ML',             mercado: 'mexico',        cantidad: 0     },
  { articulo: 'ENERGIZANTE 100ML',             mercado: 'mexico',        cantidad: 1500  },
  { articulo: 'ENERGIZANTE 250 ML',            mercado: 'mexico',        cantidad: 500   },
  { articulo: 'ENERGIZANTE 500 ML',            mercado: 'mexico',        cantidad: 3200  },
  { articulo: 'OLIVITASAN 100ML',              mercado: 'mexico',        cantidad: 0     },
  { articulo: 'OLIVITASAN 300ML',              mercado: 'mexico',        cantidad: 0     },
  { articulo: 'OLIVITASAN 500ML',              mercado: 'mexico',        cantidad: 3600  },
  { articulo: 'OLIVITASAN PLUS 250ML',         mercado: 'mexico',        cantidad: 1200  },
  { articulo: 'OLIVITASAN PLUS 500ML',         mercado: 'mexico',        cantidad: 3000  },
  // Ecuador (2)
  { articulo: 'OLIVITASAN PREMIUM 250ML',      mercado: 'ecuador',       cantidad: 700   },
  { articulo: 'OLIVITASAN PREMIUM 50ML',       mercado: 'ecuador',       cantidad: 3300  },
  // Bolivia (2)
  { articulo: 'OLIVITASAN 500ML',              mercado: 'bolivia',       cantidad: 3100  },
  { articulo: 'OLIVITASAN PLUS 500ML',         mercado: 'bolivia',       cantidad: 6000  },
  // Paraguay (2)
  { articulo: 'COMPLEFOSEL 500ML',             mercado: 'paraguay',      cantidad: 800   },
  { articulo: 'SUPEROLI 500ML',                mercado: 'paraguay',      cantidad: 250   },
  // No exportable (3)
  { articulo: 'AMINOÁCIDOS 50 ML MASCOTA',     mercado: 'no_exportable', cantidad: 2000  },
  { articulo: 'ENERGIZANTE 25 ML',             mercado: 'no_exportable', cantidad: 1500  },
  { articulo: 'OLIVITASAN 100 ML',             mercado: 'no_exportable', cantidad: 3200  },
]

const etiquetas: { articulo: string; mercado: Mercado; cantidad: number }[] = [
  // Argentina (48)
  { articulo: 'AMANTINA 250ML',                  mercado: 'argentina', cantidad: 800   },
  { articulo: 'AMANTINA 500ML',                  mercado: 'argentina', cantidad: 3300  },
  { articulo: 'AMANTINA PREMIUM 100ML',          mercado: 'argentina', cantidad: 210   },
  { articulo: 'AMANTINA PREMIUM 250ML',          mercado: 'argentina', cantidad: 1200  },
  { articulo: 'AMANTINA PREMIUM 500ML',          mercado: 'argentina', cantidad: 2200  },
  { articulo: 'AMINOÁCIDO 20ML',                 mercado: 'argentina', cantidad: 200   },
  { articulo: 'AMINOÁCIDO 50 ML AVES',           mercado: 'argentina', cantidad: 3300  },
  { articulo: 'AMINOÁCIDO 50 ML MASCOTA',        mercado: 'argentina', cantidad: 6875  },
  { articulo: 'AMINOÁCIDO 1L',                   mercado: 'argentina', cantidad: 1500  },
  { articulo: 'AMINOÁCIDO 1L AVES',              mercado: 'argentina', cantidad: 500   },
  { articulo: 'AMINOÁCIDO 5L',                   mercado: 'argentina', cantidad: 500   },
  { articulo: 'ANTITERMICO 1L',                  mercado: 'argentina', cantidad: 2100  },
  { articulo: 'CALCITROVIT 500 ML',              mercado: 'argentina', cantidad: 1000  },
  { articulo: 'CETRI-AMON 50ML',                 mercado: 'argentina', cantidad: 1000  },
  { articulo: 'CETRI-AMON 1L',                   mercado: 'argentina', cantidad: 1500  },
  { articulo: 'CETRI-AMON 5L',                   mercado: 'argentina', cantidad: 1200  },
  { articulo: 'COMPLEJO B B12 B15 20ML',         mercado: 'argentina', cantidad: 1000  },
  { articulo: 'COMPLEJO B B12 B15 100ML',        mercado: 'argentina', cantidad: 7000  },
  { articulo: 'COMPLEJO B B12 B15 250ML',        mercado: 'argentina', cantidad: 2200  },
  { articulo: 'COMPLEJO B HIERRO CERDO 25ML',    mercado: 'argentina', cantidad: 1100  },
  { articulo: 'COMPLEJO B HIERRO CERDO 100ML',   mercado: 'argentina', cantidad: 0     },
  { articulo: 'COMPLEJO B HIERRO EQUINO 25ML',   mercado: 'argentina', cantidad: 1000  },
  { articulo: 'COMPLEJO B HIERRO EQUINO 100ML',  mercado: 'argentina', cantidad: 0     },
  { articulo: 'ENERGIZANTE 25ML',                mercado: 'argentina', cantidad: 5000  },
  { articulo: 'ENERGIZANTE 100ML',               mercado: 'argentina', cantidad: 6600  },
  { articulo: 'ENERGIZANTE 250ML',               mercado: 'argentina', cantidad: 2200  },
  { articulo: 'ENERGIZANTE 250ML MANUAL',        mercado: 'argentina', cantidad: 1000  },
  { articulo: 'ENERGIZANTE 500ML',               mercado: 'argentina', cantidad: 0     },
  { articulo: 'ENERGIZANTE 500ML MANUAL',        mercado: 'argentina', cantidad: 750   },
  { articulo: 'IMIDOSAN B12 25ML',               mercado: 'argentina', cantidad: 50    },
  { articulo: 'IMIDOSAN B12 100ML',              mercado: 'argentina', cantidad: 2500  },
  { articulo: 'IMIDOSAN B12 250ML',              mercado: 'argentina', cantidad: 2000  },
  { articulo: 'JERINGA ATP 35GR',                mercado: 'argentina', cantidad: 1000  },
  { articulo: 'OLIVITASAN 25ML',                 mercado: 'argentina', cantidad: 0     },
  { articulo: 'OLIVITASAN 100ML',                mercado: 'argentina', cantidad: 5500  },
  { articulo: 'OLIVITASAN 300ML',                mercado: 'argentina', cantidad: 5000  },
  { articulo: 'OLIVITASAN 500ML',                mercado: 'argentina', cantidad: 30800 },
  { articulo: 'OLIVITASAN PLUS 50ML',            mercado: 'argentina', cantidad: 300   },
  { articulo: 'OLIVITASAN PLUS 250ML',           mercado: 'argentina', cantidad: 5000  },
  { articulo: 'OLIVITASAN PLUS 500ML',           mercado: 'argentina', cantidad: 44000 },
  { articulo: 'SUPERCOMPLEJO B 1L',              mercado: 'argentina', cantidad: 200   },
  { articulo: 'SUPERCOMPLEJO B 1L AVES',         mercado: 'argentina', cantidad: 350   },
  { articulo: 'SUPERCOMPLEJO B 1L EQUINOS',      mercado: 'argentina', cantidad: 195   },
  { articulo: 'TILCOSAN 100ML',                  mercado: 'argentina', cantidad: 3300  },
  { articulo: 'TILCOSAN 250ML',                  mercado: 'argentina', cantidad: 5500  },
  { articulo: 'VITAMINA B1 100ML',               mercado: 'argentina', cantidad: 2200  },
  { articulo: 'VITAMINA B12 50ML',               mercado: 'argentina', cantidad: 1000  },
  { articulo: 'VITAMINA B12 100ML',              mercado: 'argentina', cantidad: 0     },
  // Colombia (15)
  { articulo: 'AMINOÁCIDOS 20ML',                mercado: 'colombia',  cantidad: 1400  },
  { articulo: 'AMINOÁCIDOS VIT 50ML MANUAL',     mercado: 'colombia',  cantidad: 600   },
  { articulo: 'AMINOÁCIDOS 50ML',                mercado: 'colombia',  cantidad: 4200  },
  { articulo: 'AMINOÁCIDOS 1L',                  mercado: 'colombia',  cantidad: 120   },
  { articulo: 'AMINOÁCIDOS 5L',                  mercado: 'colombia',  cantidad: 150   },
  { articulo: 'ATP 35GR',                        mercado: 'colombia',  cantidad: 500   },
  { articulo: 'COMPLEFOSEL 25ML',                mercado: 'colombia',  cantidad: 0     },
  { articulo: 'COMPLEFOSEL 100ML',               mercado: 'colombia',  cantidad: 1600  },
  { articulo: 'COMPLEFOSEL 500ML',               mercado: 'colombia',  cantidad: 1650  },
  { articulo: 'OLIVITASAN 25ML',                 mercado: 'colombia',  cantidad: 1600  },
  { articulo: 'OLIVITASAN 100ML',                mercado: 'colombia',  cantidad: 3800  },
  { articulo: 'OLIVITASAN 500ML',                mercado: 'colombia',  cantidad: 10500 },
  { articulo: 'OLIVITASAN 500ML MANUAL',         mercado: 'colombia',  cantidad: 800   },
  { articulo: 'OLIVITASAN PREMIUM 50ML',         mercado: 'colombia',  cantidad: 1000  },
  { articulo: 'OLIVITASAN PREMIUM 500ML',        mercado: 'colombia',  cantidad: 14500 },
  // México (16)
  { articulo: 'AMANTINA PREMIUM 100ML',          mercado: 'mexico',    cantidad: 440   },
  { articulo: 'AMANTINA PREMIUM 250ML',          mercado: 'mexico',    cantidad: 200   },
  { articulo: 'AMANTINA PREMIUM 500ML',          mercado: 'mexico',    cantidad: 1000  },
  { articulo: 'ENERGIZANTE 100ML',               mercado: 'mexico',    cantidad: 2000  },
  { articulo: 'ENERGIZANTE 250ML',               mercado: 'mexico',    cantidad: 3500  },
  { articulo: 'ENERGIZANTE 500ML',               mercado: 'mexico',    cantidad: 0     },
  { articulo: 'ENERGIZANTE 500ML MANUAL',        mercado: 'mexico',    cantidad: 0     },
  { articulo: 'OLIVITASAN 100ML',                mercado: 'mexico',    cantidad: 0     },
  { articulo: 'OLIVITASAN 300ML',                mercado: 'mexico',    cantidad: 100   },
  { articulo: 'OLIVITASAN 500ML',                mercado: 'mexico',    cantidad: 2200  },
  { articulo: 'OLIVITASAN PLUS 50ML MANUAL',     mercado: 'mexico',    cantidad: 1000  },
  { articulo: 'OLIVITASAN 500ML MANUAL',         mercado: 'mexico',    cantidad: 0     },
  { articulo: 'OLIVITASAN PLUS 250ML',           mercado: 'mexico',    cantidad: 0     },
  { articulo: 'OLIVITASAN PLUS 500ML',           mercado: 'mexico',    cantidad: 2500  },
  { articulo: 'OLIVITASAN PLUS 500ML MANUAL',    mercado: 'mexico',    cantidad: 1000  },
  { articulo: 'COMPLEJO B B12B15 20ML',          mercado: 'mexico',    cantidad: 0     },
  // Bolivia (4)
  { articulo: 'OLIVITASAN 500ML',                mercado: 'bolivia',   cantidad: 600   },
  { articulo: 'OLIVITASAN 500ML MANUAL',         mercado: 'bolivia',   cantidad: 400   },
  { articulo: 'OLIVITASAN PLUS 500ML',           mercado: 'bolivia',   cantidad: 2300  },
  { articulo: 'OLIVITASAN PLUS 500ML MANUAL',    mercado: 'bolivia',   cantidad: 600   },
  // Ecuador (5)
  { articulo: 'AMANTINA PREMIUM 100ML',          mercado: 'ecuador',   cantidad: 0     },
  { articulo: 'AMANTINA PREMIUM 250ML',          mercado: 'ecuador',   cantidad: 0     },
  { articulo: 'AMINOÁCIDOS 1L AVES',             mercado: 'ecuador',   cantidad: 50    },
  { articulo: 'OLIVITASAN PREMIUM 50ML',         mercado: 'ecuador',   cantidad: 450   },
  { articulo: 'OLIVITASAN PREMIUM 250ML',        mercado: 'ecuador',   cantidad: 2800  },
  // Paraguay (4)
  { articulo: 'SUPEROLI 50ML',                   mercado: 'paraguay',  cantidad: 0     },
  { articulo: 'SUPEROLI 250ML',                  mercado: 'paraguay',  cantidad: 500   },
  { articulo: 'SUPEROLI 500ML',                  mercado: 'paraguay',  cantidad: 0     },
  { articulo: 'COMPLEFOSEL 500ML',               mercado: 'paraguay',  cantidad: 300   },
]

const frascos: { articulo: string; unidadesPorCaja: number; cantidadCajas: number; total: number }[] = [
  { articulo: 'AGROPECUARIO 25 ML',   unidadesPorCaja: 110, cantidadCajas:  71, total:  7810 },
  { articulo: 'AGROPECUARIO 100 ML',  unidadesPorCaja:  42, cantidadCajas: 180, total:  7560 },
  { articulo: 'AGROPECUARIO 500 ML',  unidadesPorCaja:  20, cantidadCajas: 130, total:  2600 },
  { articulo: 'AMBAR 100 ML',         unidadesPorCaja:  72, cantidadCajas:   2, total:   144 },
  { articulo: 'BIDÓN 500 ML',         unidadesPorCaja: 115, cantidadCajas:   6, total:   690 },
  { articulo: 'BIDÓN BLANCO 1L',      unidadesPorCaja:  60, cantidadCajas:  19, total:  1140 },
  { articulo: 'BIDÓN BLANCO 5L',      unidadesPorCaja:  20, cantidadCajas:   8, total:   160 },
  { articulo: 'BLANCO 500 ML',        unidadesPorCaja:  80, cantidadCajas:   5, total:   400 },
  { articulo: 'DORADO 50 ML',         unidadesPorCaja: 484, cantidadCajas:  16, total:  7744 },
  { articulo: 'DORADO 250 ML',        unidadesPorCaja: 240, cantidadCajas:  31, total:  7440 },
  { articulo: 'DORADO 500 ML',        unidadesPorCaja:  80, cantidadCajas: 160, total: 12800 },
  { articulo: 'GOTERO 60 ML',         unidadesPorCaja: 450, cantidadCajas:  17, total:  7650 },
  { articulo: 'IVERSAN 50 ML',        unidadesPorCaja: 484, cantidadCajas:   8, total:  3872 },
  { articulo: 'TRANSPARENTE 500 ML',  unidadesPorCaja:  80, cantidadCajas:  11, total:   880 },
  { articulo: 'JERINGA 35GR',         unidadesPorCaja: 700, cantidadCajas:   7, total:  4900 },
  { articulo: 'MARRÓN 300 ML',        unidadesPorCaja: 130, cantidadCajas:  29, total:  3770 },
  { articulo: 'MARRÓN 500 ML',        unidadesPorCaja:  80, cantidadCajas: 118, total:  9440 },
  { articulo: 'PVC 100 ML',           unidadesPorCaja: 384, cantidadCajas:   4, total:  1536 },
  { articulo: 'PVC 200',              unidadesPorCaja: 234, cantidadCajas:   8, total:  1872 },
  { articulo: 'PVC 500 ML',           unidadesPorCaja:  80, cantidadCajas:  15, total:  1200 },
  { articulo: 'VETERINARIO 250 ML',   unidadesPorCaja:  30, cantidadCajas:  50, total:  1500 },
]

async function main() {
  console.log('Seeding drogas...')
  for (const nombre of drogas) {
    await prisma.inventarioDroga.upsert({
      where: { nombre },
      update: {},
      create: { nombre, cantidad: 0 },
    })
  }
  console.log(`✅ ${drogas.length} drogas cargadas`)

  console.log('Seeding estuches...')
  for (const e of estuches) {
    await prisma.inventarioEstuche.upsert({
      where: { articulo_mercado: { articulo: e.articulo, mercado: e.mercado } },
      update: {},
      create: e,
    })
  }
  console.log(`✅ ${estuches.length} estuches cargados`)

  console.log('Seeding etiquetas...')
  for (const e of etiquetas) {
    await prisma.inventarioEtiqueta.upsert({
      where: { articulo_mercado: { articulo: e.articulo, mercado: e.mercado } },
      update: {},
      create: e,
    })
  }
  console.log(`✅ ${etiquetas.length} etiquetas cargadas`)

  console.log('Seeding frascos...')
  for (const f of frascos) {
    await prisma.inventarioFrasco.upsert({
      where: { articulo: f.articulo },
      update: {},
      create: f,
    })
  }
  console.log(`✅ ${frascos.length} frascos cargados`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
