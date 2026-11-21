# Colaborar en CacaoSmart IoT

Este repositorio contiene frontend, backend, contratos, migraciones y documentación. Se trabaja desde la **raíz**, con npm workspaces; no instalar cada carpeta como un proyecto independiente.

## Incorporarse al proyecto

1. El propietario invita al colaborador desde GitHub → Settings → Collaborators. No compartir cuentas, tokens ni contraseñas.
2. Clonar el repositorio:

   ```powershell
   git clone https://github.com/bryanAlex29/Cacao-lot.git
   cd Cacao-lot
   ```

3. Leer [AGENTS.md](AGENTS.md), los documentos que enlaza y [el traspaso de trabajo](docs/HANDOFF.md).
4. Seguir [Arranque local del README](README.md#arranque-local). Instalar las versiones compatibles indicadas y generar su propio `.env`.
5. Iniciar API y Angular en terminales separadas y comprobar `/estado`.

**Clonar no copia usuarios, parcelas, lecturas ni el volumen PostgreSQL del compañero.** Las migraciones crean la estructura, no cuentas predeterminadas. Cada desarrollador crea sus propias cuentas; para ADMIN o DEMO, seguir los comandos explícitos del README. No copiar una base privada ni enviar `.env` por GitHub.

## Una tarea, una rama, un Pull Request

Antes de comenzar, acordar una tarea o Issue para no modificar simultáneamente las mismas partes:

```powershell
git switch main
git pull --ff-only
git switch -c feature/nombre-de-la-tarea
```

Trabajar en cambios pequeños. Si una funcionalidad modifica API y UI, incluir los contratos compartidos en el mismo cambio o acordar previamente su versión.

Al terminar, ejecutar los comandos pertinentes desde la raíz:

```powershell
npm run lint
npm run typecheck
npm test
npm run test:simulator
npm run test:integration
npm run build
npm run format:check
```

Para cambios de dashboard/transporte, ejecutar también `npm run test:browser`, con Chromium compatible configurado según [fase 4](docs/phase-4.md). Las pruebas de integración requieren PostgreSQL local y crean sus propias bases temporales. No ejecutarlas contra una base compartida o productiva. Si alguna comprobación no se ejecutó, indicar el motivo; no declararla aprobada.

Revisar lo que se va a enviar:

```powershell
git add .
git diff --cached --stat
git diff --cached
git commit -m "feat: describir el cambio"
git push -u origin feature/nombre-de-la-tarea
```

En GitHub abrir un Pull Request hacia `main`. Describir objetivo, archivos afectados, pruebas, migraciones y limitaciones. Pedir revisión al compañero antes de integrar. No hacer force-push ni resolver conflictos descartando trabajo ajeno.

El propietario puede configurar protección de `main` y revisiones obligatorias en GitHub según las opciones disponibles. Esta documentación **no configura** esas protecciones ni una CI automáticamente.

## Secretos, datos y migraciones

- No versionar `.env`, `.local`, claves IoT, tokens, claves de OpenAI, imágenes privadas, dumps de base ni logs con datos sensibles. `.env.example` solo contiene nombres de variables y valores no secretos.
- No guardar contraseñas en Issues, Pull Requests, capturas o comandos del historial. Cada equipo genera sus credenciales locales.
- `package-lock.json` sí se versiona. Usar npm 11.6.2 mediante `npx` para instalar sin modificar la instalación global.
- Crear migraciones nuevas y aditivas cuando cambie Prisma. No editar migraciones ya aplicadas, ejecutar resets ni eliminar volúmenes para resolver conflictos sin autorización.
- La publicación en GitHub no equivale a despliegue. No conectar hardware, modificar firmware o abrir válvulas desde la web.

## Continuidad entre personas y asistentes

Antes de cambiar de responsable, actualizar `docs/HANDOFF.md` con lo realizado, pruebas reales, pendientes y siguiente incremento. Mantener también README y documentación de fase cuando cambie el comportamiento.

La memoria local de un asistente y este chat **no se sincronizan automáticamente al clonar Git**. Los archivos versionados son la referencia compartida. Evitar rutas personales o secretos en el traspaso.
