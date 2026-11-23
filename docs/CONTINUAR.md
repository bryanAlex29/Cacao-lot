# Resumen para continuar CacaoSmart IoT

## Estado de la entrega

**Entrega vigente: fases 5.13 y 5.14 incluidas en este código.** El usuario autorizó publicarlas en GitHub para que continúe su compañero. No hay nuevas migraciones ni dependencias respecto a `3ba7bf4`. Los documentos de fase registran su estado de validación previo a esta publicación; consultar Git para el commit y la sincronización remota.

**Fase 5.14:** inventario de dispositivos/sensores en Mis parcelas, solo lectura por propietario, paginado y con REAL/DEMO y último contacto. Ver [alcance y prueba manual](phase-5-14.md). Validación ejecutada: **420 Angular + 33 Edge**; tipos/lint/build/smoke correctos. Sin cambios de permisos/provisión. La publicación no acredita revisión manual del usuario: confirmar el siguiente incremento antes de implementarlo.

**Fase 5.13:** fechas personalizadas para riego observado, con periodo fijo, validación y reset a 24 h al cambiar selección. Validado entonces con **791 pruebas correctas**; ver [prueba manual y detalles](phase-5-13.md). Usuario autorizó continuar después de esta entrega; no se confirmó una prueba manual específica. La descripción de 5.12/779 pruebas de abajo corresponde a la entrega anterior `3ba7bf4`.

Base anterior: **fase 5.12 y corrección de renovación de sesión**. Stack: Angular + NestJS + PostgreSQL/Prisma, con Socket.IO. Validación histórica de esa entrega: **779 pruebas correctas** (209 backend, 379 Angular, 151 integración, 30 navegador Edge y 10 simulador); tipos, lint, build, Prisma, formato y smoke correctos. Detalles y resultados históricos en [HANDOFF](HANDOFF.md).

## Lo implementado

- Registro FARMER, login, permisos por propietario y rol, Argon2id y límites de solicitudes. ADMIN no tiene acceso global a parcelas ajenas.
- JWT de 15 minutos renovables automáticamente mediante cookie HttpOnly/Strict, sesión absoluta de 8 horas y revocación al salir. Recuperación tras recarga y reautenticación de Socket.IO al renovar. Ver [sesiones](session-renewal.md).
- Listado y creación de parcelas propias desde Angular para ADMIN y FARMER, con ubicación escrita y superficie opcional. No hay Google Maps.
- API de dispositivos y seis sensores; credencial IoT independiente, ingesta transaccional/idempotente y separación real/DEMO.
- Inventario Angular por parcela (5.14), con sensores, habilitación y conexión al consultar; sin claves, creación o reasignación.
- Simulador determinista, REST y Socket.IO autenticados, reconexión/resincronización y estados de conexión/calidad. Prototipo software probado con simulador, no con hardware auténtico.
- Dashboard responsive con tres zonas independientes, ambiente, lluvia, orden del relé, gráfico y tabla. Sidebar estable en escritorio y navegación Monitoreo/Historial/Riego/Alertas/Reportes sin perder sesión.
- Rangos min/max por sensor/variable, edición ADMIN propietario, control de concurrencia, auditoría y límites históricos por vigencia.
- Alertas persistentes de desconexión y baja humedad por sonda con reconocimiento, antirrebote e histéresis explícita. Sin calibración/rango/margen no se inventa configuración.
- Historial paginado de riego **observado** a partir de lecturas, incluyendo primera observación, cambios y null; no son sesiones físicas de riego.
- Eventos separados `telemetry.updated`, `device.status`, `irrigation.updated` y `sensor.status`; REST sigue siendo la autoridad tras pérdidas o mensajes atrasados.
- CSV de lecturas y riego observado con filtros, permisos, máximo 31 días/10000 filas y protección de fórmulas.
- Fechas Desde/Hasta para gráfico/tabla de humedad: hora local → UTC, máximo 31 días y periodo fijo al paginar/actualizar/reconectar. Presets 24 h/7/30 días conservados.

## Lo que falta

1. **Revisión manual del usuario** del inventario 5.14 antes de otra funcionalidad. La sesión renovable requiere iniciar sesión una vez si procede de una versión anterior sin cookie.
2. Revisar manualmente fechas personalizadas del historial de riego observado (5.13). Presets 24 h/7/30 días conservados; filtros independientes del gráfico y CSV.
3. Gestión Angular completa de dispositivos (inventario solo lectura disponible en 5.14), edición/archivo de parcelas y configuración; definir provisión/asignación de equipos para agricultores con permisos explícitos. No solucionarlo otorgando ADMIN o acceso global.
4. Diagnóstico IA: captura/subida, consentimiento, validación, almacenamiento privado, historial, cuotas y proveedor simulado; OpenAI real después, con credenciales exclusivamente backend y presupuesto autorizado.
5. Clima público con procedencia/licencia/unidades verificadas; predicción con target/horizonte, baseline/regresión y evaluación cronológica. No existen resultados predictivos validados.
6. Integración auténtica ESP32/receptor: contrato, protocolo, identidad, frecuencia, muestras y calibración. No modificar firmware ni política multizona sin autorización y prueba de seguridad.
7. Litros, duración física y ahorro: faltan evidencia temporal, caudal calibrado, área/eficiencia donde corresponda y línea base. Mantener «No disponible»; una orden de relé no confirma flujo.
8. Preparación operativa: HTTPS/hosting, respaldos/restauración probados, revisión de dependencias, recuperación/verificación de correo, administración/retención de sesiones y escala de Socket.IO. No declarar listo para producción.

## Cómo retomar en otro equipo

Leer primero [AGENTS.md](../AGENTS.md) y sus documentos obligatorios, luego [README](../README.md), [HANDOFF](HANDOFF.md) y [matriz de requisitos](requirements-status.md). Conservar cambios locales del compañero; no usar reset para actualizar.

Si ya está clonado y la rama puede actualizarse sin conflictos:

```powershell
git switch main
git pull --ff-only origin main
```

Si ya se trabaja sobre `3ba7bf4` con la migración de sesiones aplicada, 5.13/5.14 no requieren instalaciones ni migraciones nuevas: reiniciar API/Angular y comprobar las dos rutas de prueba indicadas arriba. Si hay cambios locales, conservarlos e integrarlos antes de actualizar; no usar reset ni forzar el pull.

Si no está clonado:

```powershell
git clone https://github.com/bryanAlex29/Cacao-lot.git
cd Cacao-lot
```

Desde la raíz, con Node.js 22 compatible y Docker disponibles, seguir el README. Para una copia nueva:

```powershell
node scripts/setup-env.mjs
node scripts/setup-auth-env.mjs
npx --yes npm@11.6.2 ci
npm run db:generate
npm run db:validate
npm run db:up
npm run db:migrate
```

**La nueva migración `20261123020000_auth_sessions` es necesaria para login y renovación.** Usar migrate deploy mediante el comando anterior, nunca reset o db push. En la copia local de entrega se aplicó preservando las 13 tablas anteriores y el entorno privado; cada equipo debe aplicarla a su propia base.

Iniciar `npm run dev:backend` y `npm run dev:frontend` en terminales separadas. Abrir http://localhost:4200 y comprobar `/estado`. Las funciones de cookie requieren el origen frontend configurado y proxy del mismo origen; no ampliar CORS para ocultar errores.

Crear una rama para **un solo incremento**, acordarlo con el usuario, presentar archivos/aceptación y verificar antes de continuar. Fechas personalizadas de riego (5.13) e inventario solo lectura (5.14) ya implementados: solicitar revisión de la última entrega y después acordar el siguiente pendiente. Ver [CONTRIBUTING](../CONTRIBUTING.md) para trabajo en ramas y Pull Requests.

## Lo que GitHub no transfiere

`.env`, claves IoT, `.local/simulator.json`, usuarios, parcelas, lecturas, imágenes privadas y volumen PostgreSQL **no se publican**. El compañero genera su entorno y cuentas locales según README. No copiar credenciales por chat/GitHub ni asumir que la parcela DEMO del otro equipo aparecerá al clonar.

No iniciar simulador, crear fixtures en la principal, configurar márgenes, cambiar roles, desplegar, tocar firmware o borrar datos sin autorización. El usuario quiere probar cada incremento personalmente. Sin caudal/calibración/línea base no inventar métricas; IA y predicción nunca controlan la válvula automáticamente.
