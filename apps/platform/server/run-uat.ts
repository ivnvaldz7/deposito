import { platformDb } from '@platform/db'

const API = 'http://localhost:3000/api'
let adminToken = ''
let userToken = ''
let refreshToken = ''
let tempPassword = ''
const testEmail = `uat-test-${Date.now()}@deposito.com`
let userId = ''

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log('--- STARTING UAT ---')

  // 0. Login as admin
  console.log('0. Logging in as admin')
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'dev-admin-password' })
  })
  const loginData = await loginRes.json()
  adminToken = loginData.token
  
  // 1. Crear usuario
  console.log('1. Crear usuario')
  const createRes = await fetch(`${API}/admin/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({
      email: testEmail,
      nombre: 'Usuario UAT',
      appAccess: [{ app: 'deposito', rol: 'encargado' }]
    })
  })
  
  const createData = await createRes.json()
  if (!createRes.ok) throw new Error(`Create failed: ${JSON.stringify(createData)}`)
  
  userId = createData.user.id
  tempPassword = createData.temporaryPassword
  console.log(`Created user ${userId} with temp pass ${tempPassword}, mustChangePassword=${createData.user.mustChangePassword}`)

  // 2. Primer login
  console.log('2. Primer login')
  const userLoginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: tempPassword })
  })
  const userLoginData = await userLoginRes.json()
  if (!userLoginRes.ok) throw new Error('First login failed')
  userToken = userLoginData.token
  const cookies = userLoginRes.headers.get('set-cookie') || ''
  refreshToken = cookies.split(';')[0]
  
  console.log(`First login success: mustChangePassword=${userLoginData.user.mustChangePassword}`)

  // 3. Cambio obligatorio (rechazos)
  console.log('3. Validaciones cambio password')
  const chgFail1 = await fetch(`${API}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
    body: JSON.stringify({ currentPassword: tempPassword, newPassword: 'short' })
  })
  console.log(`Short password check: ${chgFail1.status}`)

  const chgFail2 = await fetch(`${API}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
    body: JSON.stringify({ currentPassword: tempPassword, newPassword: tempPassword })
  })
  console.log(`Same password check: ${chgFail2.status}`)

  // 3. Cambio obligatorio (exitoso)
  console.log('3. Cambio exitoso')
  const chgOk = await fetch(`${API}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
    body: JSON.stringify({ currentPassword: tempPassword, newPassword: 'SuperNewPassword123!' })
  })
  const chgOkData = await chgOk.json()
  if (!chgOk.ok) throw new Error('Change password failed')
  userToken = chgOkData.token
  const newCookies = chgOk.headers.get('set-cookie') || ''
  refreshToken = newCookies.split(';')[0]
  console.log(`Change OK: mustChangePassword=${chgOkData.user.mustChangePassword}`)

  // 4. Refresh
  console.log('4. Refresh')
  const refreshRes = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    headers: { 'Cookie': refreshToken }
  })
  const refreshData = await refreshRes.json()
  if (!refreshRes.ok) throw new Error('Refresh failed')
  userToken = refreshData.token
  refreshToken = (refreshRes.headers.get('set-cookie') || '').split(';')[0]
  console.log('Refresh OK')

  // 5. Reset por Admin
  console.log('5. Reset por Admin')
  const resetRes = await fetch(`${API}/admin/${userId}/reset-password`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  })
  const resetData = await resetRes.json()
  if (!resetRes.ok) throw new Error('Reset failed')
  tempPassword = resetData.temporaryPassword
  console.log(`Reset OK: new temp pass: ${tempPassword}`)

  // 6. Revocacion
  console.log('6. Revocacion de refresh anterior')
  const oldRefreshRes = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    headers: { 'Cookie': refreshToken }
  })
  console.log(`Old refresh status after reset: ${oldRefreshRes.status}`) // Should be 401

  // 7. Login Post-Reset
  console.log('7. Login Post-Reset')
  const postResetLogin = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: tempPassword })
  })
  const postResetData = await postResetLogin.json()
  if (!postResetLogin.ok) throw new Error('Post reset login failed')
  userToken = postResetData.token
  refreshToken = (postResetLogin.headers.get('set-cookie') || '').split(';')[0]
  console.log(`Post reset login OK: mustChangePassword=${postResetData.user.mustChangePassword}`)
  
  // change password again to be fully operational
  const chgOk2 = await fetch(`${API}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
    body: JSON.stringify({ currentPassword: tempPassword, newPassword: 'SuperNewPassword123!' })
  })
  const chgOk2Data = await chgOk2.json()
  userToken = chgOk2Data.token
  refreshToken = (chgOk2.headers.get('set-cookie') || '').split(';')[0]

  // 8. Desactivar
  console.log('8. Desactivar usuario')
  const deactivateRes = await fetch(`${API}/admin/${userId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ activo: false, estado: 'disabled' })
  })
  if (!deactivateRes.ok) throw new Error('Deactivate failed')
  console.log('Deactivated OK')

  // Check refresh fails
  const deactivatedRefreshRes = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    headers: { 'Cookie': refreshToken }
  })
  console.log(`Refresh after deactivate status: ${deactivatedRefreshRes.status}`) // Should be 401
  
  // Check login fails
  const deactivatedLoginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'SuperNewPassword123!' })
  })
  console.log(`Login after deactivate status: ${deactivatedLoginRes.status}`) // Should be 401

  // 9. Reactivar
  console.log('9. Reactivar')
  const reactivateRes = await fetch(`${API}/admin/${userId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ activo: true, estado: 'active' })
  })
  if (!reactivateRes.ok) throw new Error('Reactivate failed')
  console.log('Reactivated OK')

  const reactivatedLoginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'SuperNewPassword123!' })
  })
  console.log(`Login after reactivate status: ${reactivatedLoginRes.status}`) // Should be 200

  // 10. Auditoria
  console.log('10. Auditoria check')
  const audits = await platformDb.platformAuditoria.findMany({
    where: { targetUserId: userId },
    orderBy: { createdAt: 'asc' }
  })
  
  console.log(`Total audits for user: ${audits.length}`)
  const actions = audits.map(a => a.action)
  console.log(`Actions recorded:`, new Set(actions))
  
  const anySensitive = audits.some(a => {
    const s = JSON.stringify(a)
    return s.includes('password') || s.includes('token') || s.includes(tempPassword) || s.includes('SuperNewPassword')
  })
  console.log(`Any sensitive data exposed? ${anySensitive}`)

  // 11. Limpieza
  console.log('11. Limpieza (leaving disabled)')
  await fetch(`${API}/admin/${userId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ activo: false, estado: 'disabled' })
  })
  console.log('UAT DONE')
}

main().catch(console.error).finally(() => platformDb.$disconnect())
