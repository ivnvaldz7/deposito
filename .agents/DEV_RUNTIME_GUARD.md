# DEV_RUNTIME_GUARD

Regla estricta para el arranque de entornos de desarrollo (Dev/UAT) en Windows:

1. **No iniciar procesos duplicados**: Validar siempre el estado del runtime antes de arrancar.
2. **Puertos deterministas**: Usar `--strictPort` en Vite y puertos fijos en el servidor. Nunca usar "port fallback" (evitar que Vite salte al 5178 silenciosamente).
3. **Comprobar ownership**: Usar WMI (`Get-CimInstance Win32_Process`) para confirmar que el proceso detectado pertenece a este proyecto (revisando `CommandLine` o el PID guardado).
4. **Healthcheck**: Hacer requests HTTP a `/api/health` y `/` para confirmar disponibilidad total antes de mostrar que el entorno está "READY".
5. **PID tracking**: Guardar los PIDs de los subprocesos en un archivo de estado (ej: `.runtime/dev-uat.json`).
6. **Cleanup completo de process tree**:
   - Al cerrar (SIGINT/SIGTERM), o al detectar instancias viejas, matar el árbol entero del proceso.
   - En Windows, `child.kill('SIGTERM')` no propaga la señal a los hijos (como `vite` o `tsx`).
   - Usar terminación controlada y de fuerza mayor como: `taskkill /PID <pid> /T /F`.
7. **Nunca matar procesos externos**: Si un puerto está ocupado por un programa ajeno al repositorio (ej: base de datos, otra app), detener el arranque y abortar con un mensaje claro con el PID ocupante, en lugar de matarlo.
8. **Si algo falla, matar todo**: Si el front arranca pero el back no, matar el front. No dejar componentes huérfanos.

Estas reglas garantizan un entorno limpio sin EADDRINUSE y sin consumir recursos en la máquina de desarrollo de forma invisible.
