// Diagnose matching logic

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

function strongIdentityScore(input, candidate) {
  const inputStr = normalizeForMatch(input)
  const candidateStr = normalizeForMatch(candidate)
  const inputStrong = strongTokens.filter((token) => inputStr.includes(token))
  if (inputStrong.length === 0 || inputStrong.some((token) => !candidateStr.includes(token))) return 0
  const inputPresentations = presentationTokens(inputStr)
  if (inputPresentations.length === 0) return 0.8
  const candidatePresentations = new Set(presentationTokens(candidateStr))
  return inputPresentations.every((presentation) => candidatePresentations.has(presentation)) ? 0.94 : 0
}

function scoreMatch(input, candidate) {
  const normalizedInput = normalizeForMatch(input)
  const normalizedCandidate = normalizeForMatch(candidate)
  const inputNumbers = tokens(normalizedInput).filter((token) => /^\d+$/.test(token))
  const candidateNumbers = tokens(normalizedCandidate).filter((token) => /^\d+$/.test(token))
  
  if (candidateNumbers.length > 0 && inputNumbers.length === 0) return 0
  if (normalizedInput === normalizedCandidate) return 1
  
  const inputWithoutMl = normalizedInput.replace(/\bML\b/g, '').replace(/\s+/g, ' ').trim()
  const candidateWithoutMl = normalizedCandidate.replace(/\bML\b/g, '').replace(/\s+/g, ' ').trim()
  if (inputWithoutMl === candidateWithoutMl) return 0.99
  
  const wanted = tokens(inputWithoutMl).filter((token) => !['DE', 'MAS', 'AGREGA', 'AGREGAR'].includes(token))
  const actual = new Set(tokens(candidateWithoutMl))
  if (wanted.length > 0 && wanted.every((token) => actual.has(token))) return 0.93
  return 0
}

// Diagnose
const productText = 'b12b15 250'
const candidate250 = 'COMPLEJO B B12 B15 250 ML'
const candidate100 = 'COMPLEJO B B12 B15 100 ML'

console.log('=== DIAGNOSING b12b15 250 ===')
console.log('normalizeForMatch productText:', normalizeForMatch(productText))
console.log('tokens(productText):', tokens(productText))

const inputStr = normalizeForMatch(productText)
const inputStrong = strongTokens.filter((token) => inputStr.includes(token))
console.log('inputStr:', inputStr)
console.log('strongTokens found in input (via includes):', inputStrong)
console.log('B12 in inputStr:', inputStr.includes('B12'))
console.log('B15 in inputStr:', inputStr.includes('B15'))

const pTokensInput = presentationTokens(productText)
console.log('presentationTokens(input):', pTokensInput)

// B12B15 as normalized is "B12B15". 
// presentationTokens looks for \b(\d+)\s+(ML|L)\b 
// So "B12B15 250 ML" -> but B12B15 is NOT \d+ only — it has letters.
// Let's check: "250 ML" matches -> "250 ML" 
// So presentationTokens returns ["250 ML"] — this is correct.
console.log('presentationTokens(candidate250):', presentationTokens(candidate250))

// But wait — B12B15 250 has "250" as presentation token since it's after B12B15 with a space, is it ML?
// Without ML — "b12b15 250" has NO ML suffix -> pTokensInput = []!
// If inputPresentations.length === 0, score returns 0.8 (ambiguous)
// 0.8 < 0.93 -> candidate is not "certain"
// So this IS the bug: "b12b15 250" without "ml" suffix doesn't get strongIdentityScore >= 0.93!

console.log('\n=== b12b15 250ml (with ml) ===')
const productTextWithMl = 'b12b15 250ml'
const pTokensWithMl = presentationTokens(productTextWithMl)
console.log('presentationTokens:', pTokensWithMl)
console.log('strongIdentityScore:', strongIdentityScore(productTextWithMl, candidate250))
// This should be 0.94 now

console.log('\n=== Why b12b15 250 fails ===')
console.log('strongIdentityScore(b12b15 250, 250ML):', strongIdentityScore(productText, candidate250))
// pTokensInput will be [] because "250" has no ML suffix -> returns 0.8 -> not certain (< 0.93)

// The fix: treat "250" as an implicit presentation token when matching against a candidate with "250 ML"
// OR: normalize the presentation check to include bare number-only tokens when they correspond to candidate presentations

// Better fix: expand "scoreMatch" to handle the case where the input has a pure number that appears
// in the candidate's presentation tokens
console.log('\n=== scoreMatch approach ===')
console.log('scoreMatch(b12b15 250, 250ML):', scoreMatch(productText, candidate250))
// wanted = ["B12B15", "250"]
// actual = ["COMPLEJO", "B", "B12", "B15", "250", "ML"]
// B12B15 not in actual! -> returns 0
// That's the bug #2: token "B12B15" is fused but candidate has "B12" and "B15" separate
