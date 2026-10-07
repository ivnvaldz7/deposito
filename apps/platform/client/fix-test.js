const fs = require('fs')
const file = 'src/modules/admin/__tests__/UsersPage.test.tsx'
let content = fs.readFileSync(file, 'utf8')

// Add resetPassword to mock
content = content.replace(
  'deleteAccess: vi.fn(),\n  },',
  'deleteAccess: vi.fn(),\n    resetPassword: vi.fn(),\n  },'
)

// Fix Ale-Bet selector
content = content.replace(
  `    const aleBetSection = screen\n      .getByRole('heading', { name: 'Ale-Bet' })\n      .closest('section')\n    expect(aleBetSection).not.toBeNull()\n\n    const section = aleBetSection as HTMLElement`,
  `    const aleBetTitle = screen.getByText('Ale-Bet / Logística')\n    const section = aleBetTitle.closest('.rounded-xl.border') as HTMLElement\n    expect(section).not.toBeNull()`
)

// Fix Depósito selector
content = content.replace(
  `    const depositoSection = screen\n      .getByRole('heading', { name: 'Depósito' })\n      .closest('section') as HTMLElement\n    await user.click(\n      within(depositoSection).getByRole('button', { name: /quitar acceso/i }),\n    )\n\n    await waitFor(() => {`,
  `    const depositoTitle = screen.getByText('Depósito')\n    const depositoSection = depositoTitle.closest('.rounded-xl.border') as HTMLElement\n    await user.click(\n      within(depositoSection).getByRole('button', { name: /quitar acceso/i }),\n    )\n\n    // Wait for the confirmation modal\n    const modalTitle = await screen.findByText('Quitar acceso a Depósito')\n    const modalContainer = modalTitle.closest('.fixed') as HTMLElement\n\n    // Confirm deletion\n    await user.click(\n      within(modalContainer).getByRole('button', { name: 'Quitar acceso' }),\n    )\n\n    await waitFor(() => {`
)

content = content.replace('describe(\'UsersPage\', () => {', 'describe(\'UsersPage\', () => {\n  it(\'allows platform admin to reset password and displays temporary password once\', async () => {\n    const user = userEvent.setup()\n    vi.mocked(adminApi.list).mockResolvedValue(mockUsers)\n    vi.mocked(adminApi.resetPassword).mockResolvedValue({ tempPassword: \\'new-temp-pwd\\' })\n\n    renderPage()\n\n    const editButtons = await screen.findAllByRole(\\'button\\', { name: \\'Editar\\' })\n    await user.click(editButtons[0])\n\n    const resetBtn = screen.getByRole(\\'button\\', { name: \\'Restablecer contraseña\\' })\n    await user.click(resetBtn)\n\n    // Wait for the confirmation modal\n    const confirmModalTitle = await screen.findByRole(\\'heading\\', { name: \\'Restablecer contraseña\\' })\n    const confirmModalContainer = confirmModalTitle.closest(\\'.fixed\\') as HTMLElement\n\n    // Confirm reset\n    await user.click(\n      within(confirmModalContainer).getByRole(\\'button\\', { name: \\'Restablecer\\' }),\n    )\n\n    await waitFor(() => {\n      expect(adminApi.resetPassword).toHaveBeenCalledWith(\\'user_001\\')\n    })\n\n    // Wait for generated password modal\n    const generatedModalTitle = await screen.findByRole(\\'heading\\', { name: \\'Contraseña generada\\' })\n    const generatedModalContainer = generatedModalTitle.closest(\\'.fixed\\') as HTMLElement\n\n    // Verify temp password is shown\n    expect(within(generatedModalContainer).getByText(\\'new-temp-pwd\\')).toBeInTheDocument()\n\n    // Click Entendido\n    await user.click(\n      within(generatedModalContainer).getByRole(\\'button\\', { name: \\'Entendido\\' }),\n    )\n\n    // Verify modal is closed\n    expect(screen.queryByRole(\\'heading\\', { name: \\'Contraseña generada\\' })).not.toBeInTheDocument()\n  })\n')

fs.writeFileSync(file, content)
