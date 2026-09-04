// Diagnose CETRI match

function normalizeForMatch(value) {
  return value
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/(\d+)\s*(ML|LT|L)\b/g, (_match, amount, unit) => `${amount} ${unit === 'LT' ? 'L' : unit}`)
    .replace(/[.,;:()[\]{}!¿?\"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value) { return normalizeForMatch(value).split(' ').filter(Boolean) }

const strongTokens = ['B12', 'B15', 'B25', 'PLUS']

function presentationTokens(value) {
  return [...normalizeForMatch(value).matchAll(/\b(\d+)\s+(ML|L)\b/g)].map((match) => `${match[1]} ${match[2]}`)
}

function hasStrongMismatch(input, candidate) {
  const inputStr = normalizeForMatch(input)
  const candidateStr = normalizeForMatch(candidate)
  const inputTokens = new Set(tokens(inputStr))
  const candidateTokens = new Set(tokens(candidateStr))
  const inputNumbers = [...inputTokens].filter((token) => /^\d+$/.test(token))
  const candidateNumbers = [...candidateTokens].filter((token) => /^\d+$/.test(token))
  if (inputNumbers.some((number) => !candidateNumbers.includes(number))) return true
  
  for (const token of [...strongTokens, '1 L']) {
    const hasInInput = inputStr.includes(token)
    const hasInCandidate = candidateStr.includes(token)
    if (hasInInput !== hasInCandidate) return true
  }

  return false
}

// Diagnose 12 cetri 1lt → CETRI-AMON 1 L
// extractQuantityAndProduct("12 cetri 1lt") should give:
// explicitUnits = 12, productText = "cetri 1lt"
// Then we match "cetri 1lt" against "CETRI-AMON 1 L"

const productText = 'cetri 1lt'
const candidate = 'CETRI-AMON 1 L'

console.log('normalizeForMatch productText:', normalizeForMatch(productText))
console.log('normalizeForMatch candidate:', normalizeForMatch(candidate))

// hasStrongMismatch
const inputStr = normalizeForMatch(productText)
const candidateStr = normalizeForMatch(candidate)
const inputTokens = new Set(tokens(inputStr))
const candidateTokens = new Set(tokens(candidateStr))
const inputNumbers = [...inputTokens].filter((token) => /^\d+$/.test(token))
const candidateNumbers = [...candidateTokens].filter((token) => /^\d+$/.test(token))

console.log('inputNumbers:', inputNumbers)
console.log('candidateNumbers:', candidateNumbers)
// "cetri 1lt" normalizes to "CETRI 1 L" via the LT → L replace
// "CETRI-AMON 1 L" normalizes to "CETRI AMON 1 L"
// inputNumbers = ["1"]
// candidateNumbers = ["1"]
// "1" is in candidateNumbers so numeric check passes
// strongTokens: none of ['B12','B15','B25','PLUS'] are in "CETRI 1 L"
// "1 L" IS in the strongTokens check! "1 L" in inputStr = CETRI 1 L? yes
// "1 L" in candidateStr = CETRI AMON 1 L? yes
// So no mismatch

console.log('hasStrongMismatch:', hasStrongMismatch(productText, candidate))

// Now scoreMatch 
const normalizedInput = normalizeForMatch(productText)
const normalizedCandidate = normalizeForMatch(candidate)
console.log('inputWithoutMl:', normalizedInput.replace(/\bML\b/g, '').replace(/\s+/g, ' ').trim())
console.log('candidateWithoutMl:', normalizedCandidate.replace(/\bML\b/g, '').replace(/\s+/g, ' ').trim())
const inputWithoutMl = normalizedInput.replace(/\bML\b/g, '').replace(/\s+/g, ' ').trim()
const candidateWithoutMl = normalizedCandidate.replace(/\bML\b/g, '').replace(/\s+/g, ' ').trim()
const wanted = tokens(inputWithoutMl).filter((token) => !['DE', 'MAS', 'AGREGA', 'AGREGAR'].includes(token))
const actual = new Set(tokens(candidateWithoutMl))
console.log('wanted:', wanted)
console.log('actual:', [...actual])
// wanted = ["CETRI", "1", "L"]
// actual = {"CETRI", "AMON", "1", "L"}
// "CETRI" in actual? yes
// "1" in actual? yes
// "L" in actual? yes
// All wanted in actual -> should return 0.93!
console.log('all wanted in actual:', wanted.every(t => actual.has(t)))

// But wait, the issue is: "cetri 1lt" → normalizeForMatch handles LT→L
// LT→L only for patterns like (\d+)\s*(ML|LT|L)\b
// "1lt" matches as "1 LT" → "1 L" after normalize
// Let me check the exact pattern
const raw = 'cetri 1lt'
console.log('\nRaw "cetri 1lt" through normalize:', normalizeForMatch(raw))
// The pattern is /(\d+)\s*(ML|LT|L)\b/g
// "1lt" = "1" + "lt" → matches as amount="1", unit="LT" → "1 L"
// So "CETRI 1 L" - tokens = ["CETRI", "1", "L"]
// candidateNumbers = ["1"] from CETRI-AMON 1 L → "CETRI AMON 1 L" → tokens = ["CETRI","AMON","1","L"]

// The NUMBER CHECK in hasStrongMismatch:
// inputNumbers = ["1"]
// candidateNumbers = ["1"]  
// "1".includes("1") → wait, the check is: inputNumbers.some(n => !candidateNumbers.includes(n))
// "1" IS in candidateNumbers → doesn't trigger mismatch ✓
// "1 L" string includes check: inputStr.includes("1 L") → "CETRI 1 L".includes("1 L") → true
// candidateStr.includes("1 L") → "CETRI AMON 1 L".includes("1 L") → true → no mismatch ✓

// So hasStrongMismatch = false → should proceed to scoreMatch
// scoreMatch("cetri 1lt", "CETRI-AMON 1 L"):
// inputNumbers = ["1"], candidateNumbers = ["1"]
// candidateNumbers.length > 0 && inputNumbers.length === 0 → false
// exact match? no
// inputWithoutMl = "CETRI 1 L".replace(/\bML\b/g,'') = "CETRI 1 L" (no ML tokens!)
// candidateWithoutMl = "CETRI AMON 1 L".replace(/\bML\b/g,'') = "CETRI AMON 1 L"
// wanted = ["CETRI","1","L"]
// actual = {"CETRI","AMON","1","L"}
// → should be 0.93!

// But it's failing. So maybe the issue is in strongIdentityScore or something else
// Let me check if it's the SKU match that should happen

const sku = 'CETRI'
console.log('\nscoreMatch("cetri 1lt", "CETRI"):')
const normInput = normalizeForMatch('cetri 1lt')
const normSku = normalizeForMatch('CETRI')
const inNums = tokens(normInput).filter(t => /^\d+$/.test(t))
const candNums = tokens(normSku).filter(t => /^\d+$/.test(t))
console.log('inNums:', inNums, 'candNums:', candNums)
// inNums = ["1"], candNums = []
// candidateNumbers.length > 0 && inputNumbers.length === 0 → 0 > 0 = false → doesn't block
// But: candidateNumbers.length = 0, inputNumbers.length = 1
// Line 67: if (candidateNumbers.length > 0 && inputNumbers.length === 0) return 0
// This is false (candidate has 0 numbers), so we proceed
// Wait but the input has a NUMBER "1" and the candidate (SKU "CETRI") has NO numbers
// The wanted tokens would be ["CETRI","1","L"]
// actual = {"CETRI"}
// "1" not in actual → returns 0!
// So scoreMatch against SKU returns 0 ✓ (correct, SKU doesn't have the number)

// OK so the issue must be elsewhere. Let me check if the candidate has a hyphen:
// "CETRI-AMON" normalizes to... does the hyphen get replaced?
// The replace is: .replace(/[.,;:()[\]{}!¿?"']/g, ' ')
// Hyphen "-" is NOT in that list, so "CETRI-AMON" stays as "CETRI-AMON"
// tokens("CETRI-AMON 1 L") = ["CETRI-AMON", "1", "L"]
// So actual = {"CETRI-AMON", "1", "L"}
// wanted = ["CETRI", "1", "L"]
// "CETRI" NOT in actual (it's "CETRI-AMON")!
// THAT'S THE BUG for cetri!

console.log('\nCritical: tokens of "CETRI-AMON 1 L":', tokens('CETRI-AMON 1 L'))
