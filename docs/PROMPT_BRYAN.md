# Prompt para Bryan — primero auditar y probar

Copiar el siguiente texto al asistente en la copia local actualizada del repositorio.
Guía completa: [ENTREGA_BRYAN.md](ENTREGA_BRYAN.md).

```text
Continúa CacaoSmart IoT, pero tu primer encargo es AUDITAR Y PROBAR la entrega,
no desarrollar funcionalidades nuevas. Lee completos AGENTS.md,
AGENTS_CacaoSmart_v1.4.md y contexto/DERCAS_CacaoSmart_v1.4.md; para UI lee
contexto/DISENO_VISUAL_CacaoSmart.md. Después lee docs/ENTREGA_BRYAN.md,
docs/CONTINUAR.md, README.md y docs/visual-refresh-6.md. Los registros antiguos
de HANDOFF son históricos: no recrees funciones ya implementadas.

Inspecciona rama, commit, git status y herramientas. No sobrescribas trabajo
local, no hagas reset/clean ni cambies rama con trabajo pendiente. Confirma que
recibí el commit publicado de feature/agricultural-management, no solo main
9fe2dc1. No hagas commit/push/merge ni despliegues por tu cuenta.

Verifica Node 22 compatible, npm 11.6.2, Git y Docker antes de instalar. Sigue
la guía de entorno sin imprimir .env/secretos; conserva archivos existentes.
En una copia nueva autorizo preparar el entorno local de desarrollo e instalar
dependencias del lockfile; revisa el destino y pide confirmación antes de
migraciones sobre una base con datos importantes. Nunca borres volúmenes ni
uses migrate reset/db push. Cada equipo tiene sus cuentas y datos: Git no
transfiere PostgreSQL, fotos ni .local/simulator.json.

Ejecuta las verificaciones documentadas, preferiblemente una suite por vez,
en bases locales temporales cuando corresponda. Última evidencia registrada:
534 pruebas Angular y 43 Edge correctas; build/lint/tipos frontend correctos.
NO está certificada la suite global actual: hay un TS2322 conocido en
backend/src/weather/open-meteo.spec.ts:37 por la fixture de unidad inventada.
Reprodúcelo y repórtalo; no elimines el caso ni amplíes contratos productivos.
No aumentes timeouts ni desactives seguridad para hacer pasar las pruebas.

Prueba manualmente salud, login/registro/sesión, parcelas, inventario,
telemetría DEMO, rangos/alertas, fechas/CSV, IA privada simulada/comparación,
clima y responsive, según la guía A–G. Pide confirmación antes de crear
cuentas/parcelas/equipos, activar un simulador, subir fotos o cambiar rangos en
una base compartida. Prioriza las suites con fixtures aisladas.

Conserva permisos por propietario, FARMER sin privilegios administrativos,
cookie HttpOnly/Strict, renovación JWT y logout revocable. No guardes tokens
en localStorage ni desactives validación de origen. Primero prueba en
localhost:4200: el acceso LAN/login móvil sigue pendiente y no está autorizado
resolverlo debilitando CORS o modificando firewall.

No conectes OpenAI, no generes costos ni actives consultas externas de clima.
WEATHER_PROVIDER debe seguir disabled para la primera prueba. No toques
firmware, política de riego, roles o datos de campo. Relé no demuestra flujo;
no inventes litros/ahorro/predicción ni diagnóstico real.

Entrega primero un informe con versiones, rama/commit, comandos, resultados,
fallos reproducibles, capturas seguras, puntos no probados y un único siguiente
incremento recomendado. Distingue fallo de entorno, bloqueo conocido y
regresión. Espera mi autorización antes de corregir o seguir desarrollando.
```
