import { PrismaClient, Mercado, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

// ─── Helper ───────────────────────────────────────────────────────────────────

function normalizeForMatch(str: string): string {
  return str.replace(/\s+/g, '').toUpperCase()
}

const EXPECTED_CATALOG_COUNTS = {
  droga: 51,
  estuche: 47,
  etiqueta: 55,
  frasco: 21,
} as const

// Aliases legacy detectados en inventario actual. No crean productos nuevos;
// solo redirigen nombres históricos al catálogo canónico.
const LEGACY_PRODUCT_ALIASES: Record<string, string> = {
  [normalizeForMatch('AMANTINA PREMIUM 500 ML NR')]: 'AMANTINA PREMIUM 500 ML',
}

function parsarProducto(
  nombreCompleto: string,
  categoria: 'droga' | 'estuche' | 'etiqueta' | 'frasco'
): { nombreBase: string; volumen: Prisma.Decimal | null; unidad: string | null; variante: string | null } {
  if (categoria === 'droga') {
    return { nombreBase: nombreCompleto, volumen: null, unidad: null, variante: null }
  }
  const partes = nombreCompleto.split(' ')
  const UNIDADES = ['ML', 'L', 'GR', 'G', 'KG']
  const last = partes[partes.length - 1]
  if (!UNIDADES.includes(last)) {
    return { nombreBase: nombreCompleto, volumen: null, unidad: null, variante: null }
  }
  const unidad = last
  const vol = parseFloat(partes[partes.length - 2] ?? '')
  if (isNaN(vol)) {
    return { nombreBase: nombreCompleto, volumen: null, unidad: null, variante: null }
  }
  const resto = partes.slice(0, partes.length - 2)
  const nombreBase = resto[0] ?? nombreCompleto
  const variante = resto.length > 1 ? resto.slice(1).join(' ') : null
  return { nombreBase, volumen: new Prisma.Decimal(vol), unidad, variante }
}

// ─── Catálogo ─────────────────────────────────────────────────────────────────

const DROGAS_CATALOGO = [
  'ACIDO CITRICO', 'ACIDO OLEICO', 'ALCOHOL BENCILICO', 'ARGININA', 'ATP',
  'ASPARTATO DE MAGNESIO', 'ASPARTATO DE POTASIO', 'CITRATO DE SODIO',
  'CLORURO CUPRICO', 'CLORURO DE BENZALCONIO', 'CLORURO DE CALCIO',
  'CLORURO DE MAGNESIO', 'CLORURO DE SODIO', 'CLORURO DE ZINC', 'DEXTROSA',
  'DIISOPROPILAMINA DICLOROACETATO', 'EDETATO DE COBRE Y ZINC', 'EDETATO DE ZINC',
  'EDTA', 'FENOL', 'FOSFATO DE SODIO', 'GLICERINA', 'GLICEROFORMAL',
  'GLUCONATO DE ZINC', 'GLUCONATO DE CALCIO', 'HIERRO CITRATO', 'HIERRO CITRATO 50%',
  'IODURO DE SODIO', 'ISOLEUCINA', 'LECHE CONDENSADA', 'LEUCINA', 'LEVAMISOL',
  'LISINA', 'NICOTINAMIDA', 'NITRITO DE SODIO', 'PANTOTENATO DE CALCIO',
  'PROPILENGLICOL', 'PROPILPARABENO', 'SELENITO DE SODIO', 'SODA CAUSTICA',
  'SORBITOL', 'TIMILCOSIN FOSFATO', 'TWEEN', 'VAINILLA AROMATICA',
  'VITAMINA A', 'VITAMINA B1', 'VITAMINA B12', 'VITAMINA B6',
  'VITAMINA C', 'VITAMINA D2', 'VITAMINA E',
]

const ESTUCHES_CATALOGO = [
  'AMANTINA 500 ML', 'AMANTINA PREMIUM 100 ML', 'AMANTINA PREMIUM 250 ML',
  'AMANTINA PREMIUM 500 ML', 'AMINOACIDOS 100 ML',
  'AMINOACIDOS 20 ML', 'AMINOACIDOS 250 ML', 'AMINOACIDOS AVES 50 ML',
  'AMINOACIDOS MASCOTA 50 ML', 'AMINOACIDOS VIT ORAL 50 ML', 'ATP ENERGIA 35 GR',
  'CAJUELA BLANCA 25 ML', 'CALCITROVIT 500 ML', 'COMPLEFOSEL 100 ML',
  'COMPLEFOSEL 500 ML', 'COMPLEJO B B12 B15 100 ML', 'COMPLEJO B B12 B15 250 ML',
  'COMPLEJO B B12 B15 X12 20 ML', 'COMPLEJO B HIERRO CERDO 100 ML',
  'COMPLEJO B HIERRO EQUINO 100 ML', 'ENERGIZANTE 100 ML', 'ENERGIZANTE NR 100 ML',
  'ENERGIZANTE 25 ML', 'ENERGIZANTE 250 ML', 'ENERGIZANTE 500 ML',
  'IMIDOSAN B12 100 ML', 'IMIDOSAN B12 250 ML', 'IMIDOSAN B12 25 ML',
  'IVERSAN 500 ML', 'JERINGA 35 GR', 'OLIFAMISOL 500 ML', 'OLIVITASAN 100 ML',
  'OLIVITASAN 25 ML', 'OLIVITASAN 300 ML', 'OLIVITASAN NR 300 ML',
  'OLIVITASAN 500 ML', 'OLIVITASAN PLUS 250 ML', 'OLIVITASAN PLUS 50 ML',
  'OLIVITASAN PLUS NR 50 ML', 'OLIVITASAN PLUS 500 ML', 'OLIVITASAN PREMIUM 250 ML',
  'OLIVITASAN PREMIUM 50 ML', 'OLIVITASAN PREMIUM 500 ML', 'SUPEROLI 500 ML',
  'TILCOSAN 100 ML', 'TILCOSAN 250 ML', 'VITAMINA B12 100 ML',
]

const ETIQUETAS_CATALOGO = [
  'AMANTINA 250 ML', 'AMANTINA 500 ML', 'AMANTINA PREMIUM 100 ML',
  'AMANTINA PREMIUM 250 ML', 'AMANTINA PREMIUM 500 ML', 'AMINOACIDOS 1 L',
  'AMINOACIDOS 20 ML', 'AMINOACIDOS 5 L', 'AMINOACIDOS 50 ML',
  'AMINOACIDOS AVES 1 L', 'AMINOACIDOS AVES 50 ML', 'AMINOACIDOS MASCOTA 50 ML',
  'AMINOACIDOS VIT ORAL 50 ML', 'ANTITERMICO 1 L', 'ATP 35 GR',
  'CALCITROVIT 500 ML', 'CETRI-AMON 1 L', 'CETRI-AMON 50 ML', 'CETRI-AMON 5 L',
  'COMPLEFOSEL 100 ML', 'COMPLEFOSEL 25 ML', 'COMPLEFOSEL 500 ML',
  'COMPLEJO B B12 B15 100 ML', 'COMPLEJO B B12 B15 20 ML', 'COMPLEJO B B12 B15 250 ML',
  'COMPLEJO B HIERRO CERDO 100 ML', 'COMPLEJO B HIERRO CERDO 25 ML',
  'COMPLEJO B HIERRO EQUINO 100 ML', 'COMPLEJO B HIERRO EQUINO 25 ML',
  'ENERGIZANTE 100 ML', 'ENERGIZANTE 25 ML', 'ENERGIZANTE 250 ML',
  'ENERGIZANTE 500 ML', 'IMIDOSAN B12 100 ML', 'IMIDOSAN B12 250 ML',
  'IMIDOSAN B12 25 ML', 'JERINGA ATP 35 GR', 'OLIVITASAN 100 ML',
  'OLIVITASAN 25 ML', 'OLIVITASAN 300 ML', 'OLIVITASAN 500 ML',
  'OLIVITASAN PLUS 250 ML', 'OLIVITASAN PLUS 50 ML', 'OLIVITASAN PLUS 500 ML',
  'OLIVITASAN PREMIUM 50 ML', 'OLIVITASAN PREMIUM 250 ML', 'OLIVITASAN PREMIUM 500 ML',
  'SUPERCOMPLEJO B 1 L', 'SUPERCOMPLEJO B AVES 1 L', 'SUPERCOMPLEJO B EQUINO 1 L',
  'TILCOSAN 100 ML', 'TILCOSAN 250 ML', 'VITAMINA B1 100 ML',
  'VITAMINA B12 50 ML', 'VITAMINA B12 100 ML',
]

const FRASCOS_CATALOGO = [
  'AGROPECUARIO 25 ML', 'AGROPECUARIO 100 ML', 'AGROPECUARIO 500 ML',
  'AMBAR 100 ML', 'BIDON 500 ML', 'BIDON BLANCO 1 L', 'BIDON BLANCO 5 L',
  'BLANCO 500 ML', 'DORADO 50 ML', 'DORADO 250 ML', 'DORADO 500 ML',
  'GOTERO 60 ML', 'IVERSAN 50 ML', 'TRANSPARENTE 500 ML', 'JERINGA 35 GR',
  'MARRON 300 ML', 'MARRON 500 ML', 'PVC 100 ML', 'PVC 200 ML',
  'PVC 500 ML', 'VETERINARIO 250 ML',
]

export function buildCatalogoCanonico(): { nombre: string; categoria: 'droga' | 'estuche' | 'etiqueta' | 'frasco' }[] {
  const allCatalogo = [
    ...DROGAS_CATALOGO.map((nombre) => ({ nombre, categoria: 'droga' as const })),
    ...ESTUCHES_CATALOGO.map((nombre) => ({ nombre, categoria: 'estuche' as const })),
    ...ETIQUETAS_CATALOGO.map((nombre) => ({ nombre, categoria: 'etiqueta' as const })),
    ...FRASCOS_CATALOGO.map((nombre) => ({ nombre, categoria: 'frasco' as const })),
  ]

  const counts = new Map<string, number>()
  for (const producto of allCatalogo) {
    const key = `${producto.categoria}::${producto.nombre}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const duplicados = [...counts.entries()].filter(([, count]) => count > 1)
  if (duplicados.length > 0) {
    throw new Error(
      `Catálogo inválido: hay duplicados por categoría (${duplicados
        .map(([key, count]) => `${key} x${count}`)
        .join(', ')})`
    )
  }

  const countsByCategoria = {
    droga: DROGAS_CATALOGO.length,
    estuche: ESTUCHES_CATALOGO.length,
    etiqueta: ETIQUETAS_CATALOGO.length,
    frasco: FRASCOS_CATALOGO.length,
  } as const

  for (const categoria of Object.keys(EXPECTED_CATALOG_COUNTS) as Array<keyof typeof EXPECTED_CATALOG_COUNTS>) {
    if (countsByCategoria[categoria] !== EXPECTED_CATALOG_COUNTS[categoria]) {
      throw new Error(
        `Catálogo inválido en ${categoria}: total ${countsByCategoria[categoria]}, esperado ${EXPECTED_CATALOG_COUNTS[categoria]}`
      )
    }
  }

  return allCatalogo
}

// ─── Inventario (idéntico al seed original, con cantidades reales) ────────────

const drogas = [
  'ACIDO CITRICO', 'ACIDO OLEICO', 'ALCOHOL BENCILICO', 'ARGININA', 'ATP',
  'ASPARTATO DE MAGNESIO', 'ASPARTATO DE POTASIO', 'CITRATO DE SODIO',
  'CLORURO CUPRICO', 'CLORURO DE BENZALCONIO', 'CLORURO DE CALCIO',
  'CLORURO DE MAGNESIO', 'CLORURO DE SODIO', 'CLORURO DE ZINC', 'DEXTROSA',
  'DIISOPROPILAMINA DICLOROACETATO', 'EDETATO DE COBRE Y ZINC', 'EDETATO DE ZINC',
  'EDTA', 'FENOL', 'FOSFATO DE SODIO', 'GLICERINA', 'GLICEROFORMAL',
  'GLUCONATO DE ZINC', 'GLUCONATO DE CALCIO', 'HIERRO CITRATO', 'HIERRO CITRATO 50%',
  'IODURO DE SODIO', 'ISOLEUCINA', 'LECHE CONDENSADA', 'LEUCINA', 'LEVAMISOL',
  'LISINA', 'NICOTINAMIDA', 'NITRITO DE SODIO', 'PANTOTENATO DE CALCIO',
  'PROPILENGLICOL', 'PROPILPARABENO', 'SELENITO DE SODIO', 'SODA CAUSTICA',
  'SORBITOL', 'TIMILCOSIN FOSFATO', 'TWEEN', 'VAINILLA AROMATICA',
  'VITAMINA A', 'VITAMINA B1', 'VITAMINA B12', 'VITAMINA B6',
  'VITAMINA C', 'VITAMINA D2', 'VITAMINA E',
]

const DROGAS_CANTIDADES_REALES: Record<string, number> = {
  'ACIDO CITRICO': 0,
  'ACIDO OLEICO': 0,
  'ALCOHOL BENCILICO': 0,
  ARGININA: 0,
  ATP: 25,
  'ASPARTATO DE MAGNESIO': 25,
  'ASPARTATO DE POTASIO': 0,
  'CITRATO DE SODIO': 0,
  'CLORURO CUPRICO': 40,
  'CLORURO DE BENZALCONIO': 0,
  'CLORURO DE CALCIO': 25,
  'CLORURO DE MAGNESIO': 25,
  'CLORURO DE SODIO': 25,
  'CLORURO DE ZINC': 0,
  DEXTROSA: 50,
  'DIISOPROPILAMINA DICLOROACETATO': 25,
  'EDETATO DE COBRE Y ZINC': 250,
  'EDETATO DE ZINC': 175,
  EDTA: 0,
  FENOL: 200,
  'FOSFATO DE SODIO': 0,
  GLICERINA: 175,
  GLICEROFORMAL: 0,
  'GLUCONATO DE ZINC': 8,
  'GLUCONATO DE CALCIO': 160,
  'HIERRO CITRATO': 75,
  'HIERRO CITRATO 50%': 40,
  'IODURO DE SODIO': 5,
  ISOLEUCINA: 0,
  'LECHE CONDENSADA': 20,
  LEUCINA: 25,
  LEVAMISOL: 0,
  LISINA: 25,
  NICOTINAMIDA: 250,
  'NITRITO DE SODIO': 0,
  'PANTOTENATO DE CALCIO': 25,
  PROPILENGLICOL: 100,
  PROPILPARABENO: 1,
  'SELENITO DE SODIO': 25,
  'SODA CAUSTICA': 25,
  SORBITOL: 150,
  'TIMILCOSIN FOSFATO': 400,
  TWEEN: 0,
  'VAINILLA AROMATICA': 0,
  'VITAMINA A': 340,
  'VITAMINA B1': 25,
  'VITAMINA B12': 1,
  'VITAMINA B6': 0,
  'VITAMINA C': 50,
  'VITAMINA D2': 0,
  'VITAMINA E': 235,
}

const estuches: { articulo: string; mercado: Mercado; cantidad: number }[] = [
  // Argentina (40)
  { articulo: 'AMANTINA PREMIUM 100 ML',       mercado: 'argentina',     cantidad: 0     },
  { articulo: 'AMANTINA PREMIUM 250 ML',       mercado: 'argentina',     cantidad: 1800  },
  { articulo: 'AMANTINA PREMIUM 500 ML NR',    mercado: 'argentina',     cantidad: 6800  },
  { articulo: 'AMANTINA 500 ML',               mercado: 'argentina',     cantidad: 1500  },
  { articulo: 'AMINOACIDOS 20 ML',             mercado: 'argentina',     cantidad: 500   },
  { articulo: 'AMINOACIDOS 100 ML',            mercado: 'argentina',     cantidad: 1000  },
  { articulo: 'AMINOACIDOS 250 ML',            mercado: 'argentina',     cantidad: 640   },
  { articulo: 'AMINOACIDOS AVES 50 ML',        mercado: 'argentina',     cantidad: 2500  },
  { articulo: 'AMINOACIDOS MASCOTA 50 ML',     mercado: 'argentina',     cantidad: 2800  },
  { articulo: 'CALCITROVIT 500 ML',            mercado: 'argentina',     cantidad: 0     },
  { articulo: 'COMPLEJO B B12 B15 X12 20 ML',  mercado: 'argentina',     cantidad: 250   },
  { articulo: 'COMPLEJO B B12 B15 100 ML',     mercado: 'argentina',     cantidad: 3200  },
  { articulo: 'COMPLEJO B B12 B15 250 ML',     mercado: 'argentina',     cantidad: 1100  },
  { articulo: 'COMPLEJO B HIERRO CERDO 100 ML', mercado: 'argentina',    cantidad: 1800  },
  { articulo: 'COMPLEJO B HIERRO EQUINO 100 ML', mercado: 'argentina',   cantidad: 900   },
  { articulo: 'CAJUELA BLANCA 25 ML',          mercado: 'argentina',     cantidad: 110   },
  { articulo: 'ENERGIZANTE 25 ML',             mercado: 'argentina',     cantidad: 2000  },
  { articulo: 'ENERGIZANTE 100 ML',            mercado: 'argentina',     cantidad: 900   },
  { articulo: 'ENERGIZANTE NR 100 ML',         mercado: 'argentina',     cantidad: 7200  },
  { articulo: 'ENERGIZANTE 250 ML',            mercado: 'argentina',     cantidad: 300   },
  { articulo: 'ENERGIZANTE 500 ML',            mercado: 'argentina',     cantidad: 300   },
  { articulo: 'IMIDOSAN B12 25 ML',            mercado: 'argentina',     cantidad: 1900  },
  { articulo: 'IMIDOSAN B12 100 ML',           mercado: 'argentina',     cantidad: 1400  },
  { articulo: 'IMIDOSAN B12 250 ML',           mercado: 'argentina',     cantidad: 1500  },
  { articulo: 'IVERSAN 500 ML',                mercado: 'argentina',     cantidad: 1750  },
  { articulo: 'JERINGA 35 GR',                 mercado: 'argentina',     cantidad: 2000  },
  { articulo: 'OLIFAMISOL 500 ML',             mercado: 'argentina',     cantidad: 1500  },
  { articulo: 'OLIVITASAN 25 ML',              mercado: 'argentina',     cantidad: 7000  },
  { articulo: 'OLIVITASAN 100 ML',             mercado: 'argentina',     cantidad: 5400  },
  { articulo: 'OLIVITASAN 300 ML',             mercado: 'argentina',     cantidad: 200   },
  { articulo: 'OLIVITASAN NR 300 ML',          mercado: 'argentina',     cantidad: 4800  },
  { articulo: 'OLIVITASAN 500 ML',             mercado: 'argentina',     cantidad: 18600 },
  { articulo: 'OLIVITASAN PLUS 50 ML',         mercado: 'argentina',     cantidad: 3600  },
  { articulo: 'OLIVITASAN PLUS NR 50 ML',      mercado: 'argentina',     cantidad: 6600  },
  { articulo: 'OLIVITASAN PLUS 250 ML',        mercado: 'argentina',     cantidad: 5000  },
  { articulo: 'OLIVITASAN PLUS 500 ML',        mercado: 'argentina',     cantidad: 6300  },
  { articulo: 'TILCOSAN 100 ML',               mercado: 'argentina',     cantidad: 2200  },
  { articulo: 'TILCOSAN 250 ML',               mercado: 'argentina',     cantidad: 1100  },
  { articulo: 'VITAMINA B12 100 ML',           mercado: 'argentina',     cantidad: 1100  },
  // Colombia (10)
  { articulo: 'AMINOACIDOS AVES 50 ML',        mercado: 'colombia',      cantidad: 3500  },
  { articulo: 'AMINOACIDOS VIT ORAL 50 ML',    mercado: 'colombia',      cantidad: 500   },
  { articulo: 'ATP ENERGIA 35 GR',             mercado: 'colombia',      cantidad: 100   },
  { articulo: 'COMPLEFOSEL 100 ML',            mercado: 'colombia',      cantidad: 2400  },
  { articulo: 'COMPLEFOSEL 500 ML',            mercado: 'colombia',      cantidad: 800   },
  { articulo: 'OLIVITASAN 25 ML',              mercado: 'colombia',      cantidad: 400   },
  { articulo: 'OLIVITASAN 100 ML',             mercado: 'colombia',      cantidad: 0     },
  { articulo: 'OLIVITASAN 500 ML',             mercado: 'colombia',      cantidad: 4920  },
  { articulo: 'OLIVITASAN PREMIUM 50 ML',      mercado: 'colombia',      cantidad: 300   },
  { articulo: 'OLIVITASAN PREMIUM 500 ML',     mercado: 'colombia',      cantidad: 2200  },
  // México (12)
  { articulo: 'AMANTINA PREMIUM 250 ML',       mercado: 'mexico',        cantidad: 0     },
  { articulo: 'AMANTINA PREMIUM 500 ML',       mercado: 'mexico',        cantidad: 1000  },
  { articulo: 'COMPLEJO B B12 B15 100 ML',     mercado: 'mexico',        cantidad: 0     },
  { articulo: 'ENERGIZANTE 25 ML',             mercado: 'mexico',        cantidad: 0     },
  { articulo: 'ENERGIZANTE 100 ML',            mercado: 'mexico',        cantidad: 1500  },
  { articulo: 'ENERGIZANTE 250 ML',            mercado: 'mexico',        cantidad: 500   },
  { articulo: 'ENERGIZANTE 500 ML',            mercado: 'mexico',        cantidad: 3200  },
  { articulo: 'OLIVITASAN 100 ML',             mercado: 'mexico',        cantidad: 0     },
  { articulo: 'OLIVITASAN 300 ML',             mercado: 'mexico',        cantidad: 0     },
  { articulo: 'OLIVITASAN 500 ML',             mercado: 'mexico',        cantidad: 3600  },
  { articulo: 'OLIVITASAN PLUS 250 ML',        mercado: 'mexico',        cantidad: 1200  },
  { articulo: 'OLIVITASAN PLUS 500 ML',        mercado: 'mexico',        cantidad: 3000  },
  // Ecuador (2)
  { articulo: 'OLIVITASAN PREMIUM 250 ML',     mercado: 'ecuador',       cantidad: 700   },
  { articulo: 'OLIVITASAN PREMIUM 50 ML',      mercado: 'ecuador',       cantidad: 3300  },
  // Bolivia (2)
  { articulo: 'OLIVITASAN 500 ML',             mercado: 'bolivia',       cantidad: 3100  },
  { articulo: 'OLIVITASAN PLUS 500 ML',        mercado: 'bolivia',       cantidad: 6000  },
  // Paraguay (2)
  { articulo: 'COMPLEFOSEL 500 ML',            mercado: 'paraguay',      cantidad: 800   },
  { articulo: 'SUPEROLI 500 ML',               mercado: 'paraguay',      cantidad: 250   },
  // No exportable (3)
  { articulo: 'AMINOACIDOS MASCOTA 50 ML',     mercado: 'no_exportable', cantidad: 2000  },
  { articulo: 'ENERGIZANTE 25 ML',             mercado: 'no_exportable', cantidad: 1500  },
  { articulo: 'OLIVITASAN 100 ML',             mercado: 'no_exportable', cantidad: 3200  },
]

const etiquetas: { articulo: string; mercado: Mercado; cantidad: number }[] = [
  // Argentina (48)
  { articulo: 'AMANTINA 250 ML',               mercado: 'argentina', cantidad: 800   },
  { articulo: 'AMANTINA 500 ML',               mercado: 'argentina', cantidad: 3300  },
  { articulo: 'AMANTINA PREMIUM 100 ML',       mercado: 'argentina', cantidad: 210   },
  { articulo: 'AMANTINA PREMIUM 250 ML',       mercado: 'argentina', cantidad: 1200  },
  { articulo: 'AMANTINA PREMIUM 500 ML',       mercado: 'argentina', cantidad: 2200  },
  { articulo: 'AMINOACIDOS 20 ML',             mercado: 'argentina', cantidad: 200   },
  { articulo: 'AMINOACIDOS AVES 50 ML',        mercado: 'argentina', cantidad: 3300  },
  { articulo: 'AMINOACIDOS MASCOTA 50 ML',     mercado: 'argentina', cantidad: 6875  },
  { articulo: 'AMINOACIDOS 1 L',               mercado: 'argentina', cantidad: 1500  },
  { articulo: 'AMINOACIDOS AVES 1 L',          mercado: 'argentina', cantidad: 500   },
  { articulo: 'AMINOACIDOS 5 L',               mercado: 'argentina', cantidad: 500   },
  { articulo: 'ANTITERMICO 1 L',               mercado: 'argentina', cantidad: 2100  },
  { articulo: 'CALCITROVIT 500 ML',            mercado: 'argentina', cantidad: 1000  },
  { articulo: 'CETRI-AMON 50 ML',              mercado: 'argentina', cantidad: 1000  },
  { articulo: 'CETRI-AMON 1 L',               mercado: 'argentina', cantidad: 1500  },
  { articulo: 'CETRI-AMON 5 L',               mercado: 'argentina', cantidad: 1200  },
  { articulo: 'COMPLEJO B B12 B15 20 ML',      mercado: 'argentina', cantidad: 1000  },
  { articulo: 'COMPLEJO B B12 B15 100 ML',     mercado: 'argentina', cantidad: 7000  },
  { articulo: 'COMPLEJO B B12 B15 250 ML',     mercado: 'argentina', cantidad: 2200  },
  { articulo: 'COMPLEJO B HIERRO CERDO 25 ML', mercado: 'argentina', cantidad: 1100  },
  { articulo: 'COMPLEJO B HIERRO CERDO 100 ML', mercado: 'argentina', cantidad: 0    },
  { articulo: 'COMPLEJO B HIERRO EQUINO 25 ML', mercado: 'argentina', cantidad: 1000 },
  { articulo: 'COMPLEJO B HIERRO EQUINO 100 ML', mercado: 'argentina', cantidad: 0   },
  { articulo: 'ENERGIZANTE 25 ML',             mercado: 'argentina', cantidad: 5000  },
  { articulo: 'ENERGIZANTE 100 ML',            mercado: 'argentina', cantidad: 6600  },
  { articulo: 'ENERGIZANTE 250 ML',            mercado: 'argentina', cantidad: 2200  },
  { articulo: 'ENERGIZANTE 500 ML',            mercado: 'argentina', cantidad: 750   },
  { articulo: 'IMIDOSAN B12 25 ML',            mercado: 'argentina', cantidad: 50    },
  { articulo: 'IMIDOSAN B12 100 ML',           mercado: 'argentina', cantidad: 2500  },
  { articulo: 'IMIDOSAN B12 250 ML',           mercado: 'argentina', cantidad: 2000  },
  { articulo: 'JERINGA ATP 35 GR',             mercado: 'argentina', cantidad: 1000  },
  { articulo: 'OLIVITASAN 25 ML',              mercado: 'argentina', cantidad: 0     },
  { articulo: 'OLIVITASAN 100 ML',             mercado: 'argentina', cantidad: 5500  },
  { articulo: 'OLIVITASAN 300 ML',             mercado: 'argentina', cantidad: 5000  },
  { articulo: 'OLIVITASAN 500 ML',             mercado: 'argentina', cantidad: 30800 },
  { articulo: 'OLIVITASAN PLUS 50 ML',         mercado: 'argentina', cantidad: 300   },
  { articulo: 'OLIVITASAN PLUS 250 ML',        mercado: 'argentina', cantidad: 5000  },
  { articulo: 'OLIVITASAN PLUS 500 ML',        mercado: 'argentina', cantidad: 44000 },
  { articulo: 'SUPERCOMPLEJO B 1 L',           mercado: 'argentina', cantidad: 200   },
  { articulo: 'SUPERCOMPLEJO B AVES 1 L',      mercado: 'argentina', cantidad: 350   },
  { articulo: 'SUPERCOMPLEJO B EQUINO 1 L',    mercado: 'argentina', cantidad: 195   },
  { articulo: 'TILCOSAN 100 ML',               mercado: 'argentina', cantidad: 3300  },
  { articulo: 'TILCOSAN 250 ML',               mercado: 'argentina', cantidad: 5500  },
  { articulo: 'VITAMINA B1 100 ML',            mercado: 'argentina', cantidad: 2200  },
  { articulo: 'VITAMINA B12 50 ML',            mercado: 'argentina', cantidad: 1000  },
  { articulo: 'VITAMINA B12 100 ML',           mercado: 'argentina', cantidad: 0     },
  // Colombia (15)
  { articulo: 'AMINOACIDOS 20 ML',             mercado: 'colombia',  cantidad: 1400  },
  { articulo: 'AMINOACIDOS VIT ORAL 50 ML',    mercado: 'colombia',  cantidad: 600   },
  { articulo: 'AMINOACIDOS 50 ML',             mercado: 'colombia',  cantidad: 4200  },
  { articulo: 'AMINOACIDOS 1 L',               mercado: 'colombia',  cantidad: 120   },
  { articulo: 'AMINOACIDOS 5 L',               mercado: 'colombia',  cantidad: 150   },
  { articulo: 'ATP 35 GR',                     mercado: 'colombia',  cantidad: 500   },
  { articulo: 'COMPLEFOSEL 25 ML',             mercado: 'colombia',  cantidad: 0     },
  { articulo: 'COMPLEFOSEL 100 ML',            mercado: 'colombia',  cantidad: 1600  },
  { articulo: 'COMPLEFOSEL 500 ML',            mercado: 'colombia',  cantidad: 1650  },
  { articulo: 'OLIVITASAN 25 ML',              mercado: 'colombia',  cantidad: 1600  },
  { articulo: 'OLIVITASAN 100 ML',             mercado: 'colombia',  cantidad: 3800  },
  { articulo: 'OLIVITASAN 500 ML',             mercado: 'colombia',  cantidad: 10500 },
  { articulo: 'OLIVITASAN PREMIUM 50 ML',      mercado: 'colombia',  cantidad: 1000  },
  { articulo: 'OLIVITASAN PREMIUM 500 ML',     mercado: 'colombia',  cantidad: 14500 },
  // México (16)
  { articulo: 'AMANTINA PREMIUM 100 ML',       mercado: 'mexico',    cantidad: 440   },
  { articulo: 'AMANTINA PREMIUM 250 ML',       mercado: 'mexico',    cantidad: 200   },
  { articulo: 'AMANTINA PREMIUM 500 ML',       mercado: 'mexico',    cantidad: 1000  },
  { articulo: 'ENERGIZANTE 100 ML',            mercado: 'mexico',    cantidad: 2000  },
  { articulo: 'ENERGIZANTE 250 ML',            mercado: 'mexico',    cantidad: 3500  },
  { articulo: 'ENERGIZANTE 500 ML',            mercado: 'mexico',    cantidad: 0     },
  { articulo: 'OLIVITASAN 100 ML',             mercado: 'mexico',    cantidad: 0     },
  { articulo: 'OLIVITASAN 300 ML',             mercado: 'mexico',    cantidad: 100   },
  { articulo: 'OLIVITASAN 500 ML',             mercado: 'mexico',    cantidad: 2200  },
  { articulo: 'OLIVITASAN PLUS 250 ML',        mercado: 'mexico',    cantidad: 0     },
  { articulo: 'OLIVITASAN PLUS 500 ML',        mercado: 'mexico',    cantidad: 2500  },
  { articulo: 'COMPLEJO B B12 B15 20 ML',      mercado: 'mexico',    cantidad: 0     },
  // Bolivia (4)
  { articulo: 'OLIVITASAN 500 ML',             mercado: 'bolivia',   cantidad: 600   },
  { articulo: 'OLIVITASAN PLUS 500 ML',        mercado: 'bolivia',   cantidad: 2300  },
  // Ecuador (5)
  { articulo: 'AMANTINA PREMIUM 100 ML',       mercado: 'ecuador',   cantidad: 0     },
  { articulo: 'AMANTINA PREMIUM 250 ML',       mercado: 'ecuador',   cantidad: 0     },
  { articulo: 'AMINOACIDOS AVES 1 L',          mercado: 'ecuador',   cantidad: 50    },
  { articulo: 'OLIVITASAN PREMIUM 50 ML',      mercado: 'ecuador',   cantidad: 450   },
  { articulo: 'OLIVITASAN PREMIUM 250 ML',     mercado: 'ecuador',   cantidad: 2800  },
  // Paraguay (4)
  { articulo: 'COMPLEFOSEL 500 ML',            mercado: 'paraguay',  cantidad: 300   },
]

const frascos: { articulo: string; unidadesPorCaja: number; cantidadCajas: number; total: number }[] = [
  { articulo: 'AGROPECUARIO 25 ML',   unidadesPorCaja: 110, cantidadCajas:  71, total:  7810 },
  { articulo: 'AGROPECUARIO 100 ML',  unidadesPorCaja:  42, cantidadCajas: 180, total:  7560 },
  { articulo: 'AGROPECUARIO 500 ML',  unidadesPorCaja:  20, cantidadCajas: 130, total:  2600 },
  { articulo: 'AMBAR 100 ML',         unidadesPorCaja:  72, cantidadCajas:   2, total:   144 },
  { articulo: 'BIDON 500 ML',         unidadesPorCaja: 115, cantidadCajas:   6, total:   690 },
  { articulo: 'BIDON BLANCO 1 L',     unidadesPorCaja:  60, cantidadCajas:  19, total:  1140 },
  { articulo: 'BIDON BLANCO 5 L',     unidadesPorCaja:  20, cantidadCajas:   8, total:   160 },
  { articulo: 'BLANCO 500 ML',        unidadesPorCaja:  80, cantidadCajas:   5, total:   400 },
  { articulo: 'DORADO 50 ML',         unidadesPorCaja: 484, cantidadCajas:  16, total:  7744 },
  { articulo: 'DORADO 250 ML',        unidadesPorCaja: 240, cantidadCajas:  31, total:  7440 },
  { articulo: 'DORADO 500 ML',        unidadesPorCaja:  80, cantidadCajas: 160, total: 12800 },
  { articulo: 'GOTERO 60 ML',         unidadesPorCaja: 450, cantidadCajas:  17, total:  7650 },
  { articulo: 'IVERSAN 50 ML',        unidadesPorCaja: 484, cantidadCajas:   8, total:  3872 },
  { articulo: 'TRANSPARENTE 500 ML',  unidadesPorCaja:  80, cantidadCajas:  11, total:   880 },
  { articulo: 'JERINGA 35 GR',        unidadesPorCaja: 700, cantidadCajas:   7, total:  4900 },
  { articulo: 'MARRON 300 ML',        unidadesPorCaja: 130, cantidadCajas:  29, total:  3770 },
  { articulo: 'MARRON 500 ML',        unidadesPorCaja:  80, cantidadCajas: 118, total:  9440 },
  { articulo: 'PVC 100 ML',           unidadesPorCaja: 384, cantidadCajas:   4, total:  1536 },
  { articulo: 'PVC 200 ML',           unidadesPorCaja: 234, cantidadCajas:   8, total:  1872 },
  { articulo: 'PVC 500 ML',           unidadesPorCaja:  80, cantidadCajas:  15, total:  1200 },
  { articulo: 'VETERINARIO 250 ML',   unidadesPorCaja:  30, cantidadCajas:  50, total:  1500 },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function main() {
  // 1. Seed catálogo de productos
  console.log('Seeding catálogo de productos...')
  const catalogoMap = new Map<string, string>() // normalizeForMatch(nombreCompleto) → productoId

  const allCatalogo = buildCatalogoCanonico()
  const countsByCategoria = {
    droga: DROGAS_CATALOGO.length,
    estuche: ESTUCHES_CATALOGO.length,
    etiqueta: ETIQUETAS_CATALOGO.length,
    frasco: FRASCOS_CATALOGO.length,
  }
  console.log(
    `Catálogo validado: total ${allCatalogo.length} productos (${countsByCategoria.droga} drogas, ${countsByCategoria.estuche} estuches, ${countsByCategoria.etiqueta} etiquetas, ${countsByCategoria.frasco} frascos)`
  )
  console.log(
    `Aliases legacy detectados: ${Object.entries(LEGACY_PRODUCT_ALIASES)
      .map(([legacy, canonico]) => `${legacy} -> ${canonico}`)
      .join(', ')}`
  )

  for (const { nombre, categoria } of allCatalogo) {
    const { nombreBase, volumen, unidad, variante } = parsarProducto(nombre, categoria)
    const p = await prisma.producto.upsert({
      where: { nombreCompleto_categoria: { nombreCompleto: nombre, categoria } },
      update: {},
      create: { nombreCompleto: nombre, nombreBase, volumen, unidad, variante, categoria },
    })
    catalogoMap.set(`${categoria}::${normalizeForMatch(nombre)}`, p.id)
  }
  console.log(`✅ ${catalogoMap.size} productos en catálogo`)

  // Helper: busca productoId por nombreCompleto normalizado
  function getProductoId(
    nombre: string,
    categoria: 'droga' | 'estuche' | 'etiqueta' | 'frasco'
  ): string | null {
    const normalized = normalizeForMatch(nombre)
    const canonico = LEGACY_PRODUCT_ALIASES[normalized] ?? nombre
    return catalogoMap.get(`${categoria}::${normalizeForMatch(canonico)}`) ?? null
  }

  // 2. Seed inventario drogas
  console.log('Seeding drogas...')
  for (const nombre of drogas) {
    const productoId = getProductoId(nombre, 'droga')
    const cantidad = DROGAS_CANTIDADES_REALES[nombre] ?? 0
    const existing = await prisma.inventarioDroga.findFirst({
      where: { nombre, lote: null },
    })

    if (existing) {
      await prisma.inventarioDroga.update({
        where: { id: existing.id },
        data: { productoId, cantidad },
      })
    } else {
      await prisma.inventarioDroga.create({
        data: { nombre, lote: null, vencimiento: null, cantidad, productoId },
      })
    }
  }
  console.log(`✅ ${drogas.length} drogas cargadas`)

  // 3. Seed inventario estuches
  console.log('Seeding estuches...')
  for (const e of estuches) {
    const productoId = getProductoId(e.articulo, 'estuche')
    await prisma.inventarioEstuche.upsert({
      where: { articulo_mercado: { articulo: e.articulo, mercado: e.mercado } },
      update: { productoId },
      create: { ...e, productoId },
    })
  }
  console.log(`✅ ${estuches.length} estuches cargados`)

  // 4. Seed inventario etiquetas
  console.log('Seeding etiquetas...')
  for (const e of etiquetas) {
    const productoId = getProductoId(e.articulo, 'etiqueta')
    await prisma.inventarioEtiqueta.upsert({
      where: { articulo_mercado: { articulo: e.articulo, mercado: e.mercado } },
      update: { productoId },
      create: { ...e, productoId },
    })
  }
  console.log(`✅ ${etiquetas.length} etiquetas cargadas`)

  // 5. Seed inventario frascos
  console.log('Seeding frascos...')
  for (const f of frascos) {
    const productoId = getProductoId(f.articulo, 'frasco')
    await prisma.inventarioFrasco.upsert({
      where: { articulo: f.articulo },
      update: { productoId },
      create: { ...f, productoId },
    })
  }
  console.log(`✅ ${frascos.length} frascos cargados`)
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
