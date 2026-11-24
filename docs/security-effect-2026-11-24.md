# Corrección acotada de seguridad — Effect utilizado por Prisma

## Problema y decisión

La auditoría inicial informaba 19 entradas: 16 moderadas y 3 altas. Las altas se propagaban por la cadena `prisma@7.10.1` → `@prisma/config@7.10.1` → `effect@3.20.0`.

El aviso [GHSA-7589-6fvf-x4pw / CVE-2026-121707](https://github.com/advisories/GHSA-7589-6fvf-x4pw), consultado el 24/11/2026, describe backtracking costoso al validar ciertas plantillas de varias cadenas con `Schema.TemplateLiteral`. Afecta a Effect hasta 3.22.0 y señala **3.22.1** como versión corregida.

Se fijó **solo esa dependencia indirecta**, con un override raíz para `@prisma/config@7.10.1`. Prisma, cliente, adaptador y esquema permanecen en sus versiones anteriores; no se degradó Prisma a 6.12.0 como sugería la reparación automática ni se actualizó Effect a su versión mayor 4. No se ha demostrado un ataque remoto contra esta aplicación: se corrige la dependencia vulnerable, sin afirmar que las tres entradas sean tres ataques independientes.

## Archivos y alcance

- `package.json`: override acotado `@prisma/config@7.10.1` → `effect: 3.22.1` y comando `test:dependency-security`.
- `package-lock.json`: únicamente versión, URL e integridad de Effect; no hay actualizaciones colaterales. Tarball e integridad contrastados con el registro oficial y verificados mediante instalación limpia.
- `scripts/dependency-security.test.mjs`: comprueba override, versiones Prisma conservadas y versión efectiva que resuelve su configuración. Ejecuta en un subproceso una plantilla con entrada válida y otra ambigua de 5000 caracteres; límite externo de cinco segundos para no bloquear el propio runner si vuelve una versión vulnerable.
- Este documento y `docs/CONTINUAR.md`: actualización de resultados y procedimiento de colaboración.

El comando de seguridad se ejecuta explícitamente con `npm run test:dependency-security`; no se añadió ocultamente a otras suites. Al actualizar Prisma en el futuro, revisar la necesidad del override y actualizar este test de manera consciente; no quitarlo solo para silenciar una incompatibilidad.

## Resultado verificado

**Auditoría posterior: 0 altas, 0 críticas y 16 moderadas.** No se ocultan severidades ni se usan exclusiones para obtener ese resultado. Las moderadas necesitan su propio análisis, no actualizaciones masivas por inferencia.

**1.062 pruebas correctas ejecutadas:** 287 backend, 534 Angular, 186 integración PostgreSQL/Socket.IO, 43 navegador Edge, 10 simulador y 2 regresiones de dependencias. No se suman las repeticiones de una misma suite.

También correctos: instalación limpia con npm 11.6.2, árbol `npm ls`, generación/validación Prisma, tipos, lint, build, formato de archivos del incremento y diff. API live/ready y web local responden 200. Persiste el pendiente de formato global heredado de la entrega, separado de esta corrección.

Antes de instalar el parche, las dos nuevas regresiones fallaron: Effect efectivo era 3.20.0 y el subproceso agotaba el límite al validar la entrada ambigua. Después, ambas pasan con el mismo límite. No se ampliaron tiempos para ocultar un fallo.

### Incidencias de instalación y reproducción

`npm install/update --package-lock-only` no actualizó la entrada ya fijada de Effect en este workspace a pesar del override; `npm ls` lo detectó como inválido. Se actualizaron sus tres campos del lockfile con los metadatos oficiales de 3.22.1 y se comprobó el resultado con **`npm ci` limpio**, no modificando manualmente `node_modules`.

En Windows, el primer `ci` encontró `EPERM` en `esbuild.exe` porque Angular estaba ejecutándose. Se detuvieron únicamente los servicios identificados de este proyecto y se reinstaló correctamente. Los mensajes transitorios del watcher sobre módulos Angular ausentes correspondían a esa sustitución de dependencias, no a cambios de TypeScript que debieran corregirse. API y frontend quedaron levantados de nuevo, con IA mock y clima externo desactivado.

Para reproducir en otro equipo, **detener antes los servidores de desarrollo**:

```powershell
npx --yes npm@11.6.2 ci
npm run db:generate
npm run db:validate
npm run test:dependency-security
npm ls effect prisma @prisma/client @prisma/config
npm audit
```

`npm audit` todavía devuelve estado no cero por las 16 moderadas; no interpretarlo como regresión de las tres altas ya corregidas. Para pruebas completas usar los comandos de la guía de revisión; el navegador requiere la ruta local a Edge/Chrome instalada.

## Límites y próximo paso

Sin migraciones nuevas, edición de `.env`, fixtures en la base principal, cambios de permisos, firmware, conexión OpenAI o clima externo. Integración/navegador usaron bases temporales eliminadas al terminar. Se preservaron los cambios locales de revisión anteriores y no se hizo commit/push/merge.

Este cierre es un incremento de mantenimiento, no una certificación de producción. Pendientes: revisión manual del usuario, análisis acotado de moderadas y normalización de formato en una entrega separada; funcionalidades posteriores se acuerdan sin recrear la gestión, IA DEMO y clima ya disponibles.
