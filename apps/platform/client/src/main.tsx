import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// A legacy Serwist worker once controlled this origin. Ask the browser to
// revalidate it on startup so the one-time retirement worker can clear its
// cached application shell immediately instead of waiting for Chrome's
// periodic update check.
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistration()
    .then((registration) => registration?.update())
    .catch(() => undefined)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
