// Legacy installations registered their Serwist worker under /ale-bet/.
// Keep this shim at that exact URL so its update cycle loads the retirement
// worker that clears its cached application shell and unregisters itself.
importScripts('/sw.js')
