import abLogo from './assets/alebet.svg'

export default function App() {
  return (
    <main className="portal-shell">
      <div className="portal-content">
        <img src={abLogo} alt="ale-bet" className="portal-mark portal-mark-image" />

        <section className="portal-grid" aria-label="Selección de aplicación">
          <button
            type="button"
            className="portal-card"
            style={{ animationDelay: '800ms' }}
            onClick={() => {
              window.location.href = 'http://localhost:5175'
            }}
          >
            <h2 className="portal-card-title">logística</h2>
            <p className="portal-card-description">Pedidos, armado y despacho</p>
            <span className="portal-card-cta">INGRESAR →</span>
          </button>

          <button
            type="button"
            className="portal-card"
            style={{ animationDelay: '950ms' }}
            onClick={() => {
              window.location.href = 'http://localhost:5174'
            }}
          >
            <h2 className="portal-card-title">admin</h2>
            <p className="portal-card-description">Usuarios y permisos</p>
            <span className="portal-card-cta">INGRESAR →</span>
          </button>

          <button
            type="button"
            className="portal-card"
            style={{ animationDelay: '1100ms' }}
            onClick={() => {
              window.location.href = 'http://localhost:5173'
            }}
          >
            <h2 className="portal-card-title">depósito</h2>
            <p className="portal-card-description">Stock, insumos y producción</p>
            <span className="portal-card-cta">INGRESAR →</span>
          </button>
        </section>

        <footer className="portal-footer">© 2026 ale·bet</footer>
      </div>
    </main>
  )
}
