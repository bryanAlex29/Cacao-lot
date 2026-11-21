# Fase 1 — Base técnica y verificación

**Fecha:** 2026-11-20.

## Alcance entregado

- Workspace npm con Angular 21, NestJS 11, Prisma 7 y PostgreSQL 17.
- Configuración validada, entorno local no versionado con credencial aleatoria, CORS explícito y servicios ligados a loopback.
- Endpoints `/api/v1/health/live` y `/api/v1/health/ready`; OpenAPI en desarrollo.
- Pantalla Angular inicial en español que consulta salud real y distingue API de base de datos. Mantiene identidad verde y adaptación responsive, sin pretender ser la réplica final del dashboard.
- Contratos de tipos con tres humedades independientes, evento agregado `1.0`, ingreso IoT `1.2`, calidad, origen y distinción orden de relé/retroalimentación física.
- Puerto `TelemetryDataSource` y módulos reservados para integración, telemetría y tiempo real.
- Pruebas básicas y scripts de arranque/verificación.

## Decisiones

1. **Puertos aislados:** API `3100`, Angular `4200`, PostgreSQL `5433`. El puerto `3000` ya estaba ocupado. No se modificaron los servicios existentes de otros proyectos.
2. **Instalación reproducible:** npm `11.6.2` mediante `npx`, con `package-lock.json`. npm `10.9.3` y `10.9.4` fallaron con `edgesOut` en el árbol de Vitest. No se actualizó npm global.
3. **Prisma 7.10.1 + adapter-pg:** actualización controlada desde la primera selección de Prisma 6 por auditoría; configuración de CLI en `backend/prisma.config.ts`. Queda un aviso transitivo de Effect que esta versión aún no resuelve.
4. **Sin tablas artificiales:** Prisma genera cliente y ejecuta `SELECT 1` sin modelos. La fase 2 añadirá entidades y migraciones de negocio; readiness no implica que esas tablas existan.
5. **Sin integración aparente:** ni UI ni módulos reservados fabrican datos, conectividad IoT, JWT o Socket.IO inexistentes. IA y predicción quedan para sus fases.
6. **Vitest 4.1.12:** evita el aviso crítico detectado en una versión anterior de prueba. Jest 29 + ts-jest verifica Nest con metadatos de decoradores.

## Verificaciones ejecutadas

| Verificación                                   | Resultado                                                    |
| ---------------------------------------------- | ------------------------------------------------------------ |
| Instalación con `npx --yes npm@11.6.2 install` | Correcta; lockfile generado                                  |
| `npm run db:generate`                          | Cliente Prisma 7.10.1 generado                               |
| `npm run db:validate`                          | Esquema válido                                               |
| `npm run db:up`                                | PostgreSQL propio iniciado y healthy                         |
| `npm run typecheck`                            | Frontend, backend y contratos correctos                      |
| `npm run lint`                                 | Correcto                                                     |
| `npm test`                                     | 16 pruebas Nest/Jest y 4 Angular/Vitest correctas            |
| `npm run build`                                | Backend y frontend compilan; bundle Angular inicial ~233 kB  |
| `npm run smoke`                                | Liveness 200, readiness 200 y rutas OpenAPI presentes        |
| HTTP de Angular y proxy `/api/v1/health/ready` | Ambos 200; conexión Angular → NestJS → PostgreSQL confirmada |
| Caída real de PostgreSQL propio                | API live 200 y ready 503, sin detalles internos              |
| Restauración tras caída                        | Compose healthy y smoke vuelve a responder 200               |

La revisión final, después del formato, repitió correctamente lint, typecheck, build, las 20 pruebas, validación de Prisma y smoke. `npm run format:check` confirmó el formato de todos los archivos incluidos.

Se inicializó Git en la rama `main`, sin commits, remotos ni publicaciones. `git check-ignore` confirmó que `.env`, `node_modules` y las carpetas de compilación quedan excluidos. Los archivos originales de especificación se conservaron.

La prueba real de caída detuvo únicamente `postgres` del proyecto Compose `cacaosmart-local`, con restauración en un bloque `finally`. No se eliminaron datos ni volúmenes. Las pruebas HTTP de Jest, por separado, simulan la base; no confundirlas con integración PostgreSQL real.

La comprobación HTTP de Angular verifica entrega del HTML y proxy, no equivale a una revisión visual en navegador real. Las pruebas de componente usan DOM simulado. No se ha verificado cámara, accesibilidad completa, móvil real, hardware, autenticación, OpenAI ni predicción.

## Auditoría de dependencias

Resultado tras actualizar Prisma y Vitest: **19 avisos: 16 moderados y 3 altos; sin críticos**.

- Los altos corresponden a `effect` y su cadena `@prisma/config` → `prisma`, por el aviso de ReDoS `GHSA-7589-6fvf-x4pw`. La CLI está declarada en desarrollo, pero el árbol de peers de Prisma también la incluye al auditar con `--omit=dev`: no afirmar que esa auditoría está limpia.
- Los moderados proceden de dependencias transitivas de la CLI Angular (paquetes de registro, patrones y archivos).
- No se usaron overrides de versiones incompatibles ni `npm audit fix --force`; las sugerencias automáticas incluían cambios mayores o retrocesos no adecuados.
- No exponer herramientas de desarrollo fuera de localhost ni desplegar hasta revisar y resolver o evaluar explícitamente estos riesgos con las versiones disponibles.

La auditoría puede cambiar con nuevos avisos. Repetir `npm audit` y revisar el árbol antes de publicar; no considerar este registro una certificación de seguridad.

## Archivos principales

- Raíz: `package.json`, `package-lock.json`, `.env.example`, `.gitignore`, `docker-compose.yml`, configuraciones ESLint/Prettier y `README.md`.
- `backend/`: configuración de Nest/TypeScript/Jest, Prisma y módulos de salud, base de datos y futuras integraciones.
- `frontend/`: Angular, Router, servicio de salud, pantalla de estado y pruebas.
- `packages/contracts/`: tipos compartidos de telemetría.
- `scripts/setup-env.mjs`: creación local de entorno sin sobrescritura.
- `scripts/smoke.mjs`: verificación HTTP de API/OpenAPI activa.

## Próximo incremento

1. Definir modelos Prisma de usuarios, parcelas, dispositivos y sensores, conservando el contrato de tres zonas.
2. Crear migración inicial no destructiva y documentar su aplicación.
3. Implementar autenticación y permisos por parcela antes de exponer datos de negocio o salas Socket.IO.
4. Probar aislamiento de dos propietarios y validación de entradas.

Mantener pendientes de hardware/servidor real y agronomía de DERCAS. No implementar automáticamente la regla multizona, caudal ni ahorro a partir de valores del mockup.

## Key Learnings:

1. Liveness y readiness deben permanecer separados: perder PostgreSQL no debe simular una caída del proceso ni una conexión de sensores.
2. El cliente Prisma puede comprobar conexión sin inventar tablas de negocio en la primera fase.
3. El contrato de tipos compartido prepara integraciones, pero no reemplaza la validación de mensajes ni permisos en runtime.
