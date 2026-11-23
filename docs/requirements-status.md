# Comparación con DERCAS v1.4 — 2026-11-22

Revisión de código sobre `00bf4e8` y los incrementos locales hasta 5.12. Fuentes: [DERCAS](../contexto/DERCAS_CacaoSmart_v1.4.md) y [AGENTS](../AGENTS_CacaoSmart_v1.4.md). «Implementado» significa software disponible, no validación agronómica ni integración física. 5.1–5.12 son incrementos de la fase global 5, no doce fases globales completadas.

## Requisitos funcionales

| Requisito                  | Estado                              | Evidencia y alcance restante                                                                                                                                                                                             |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RF-01: autenticación/roles | Implementado en MVP                 | JWT15m renovables con cookie HttpOnly, sesión absoluta8h revocable, Argon2id, propiedad sin ADMIN global. Recuperación, verificación de correo y administración avanzada de sesiones pendientes. Ver session-renewal.md. |
| RF-02: parcelas            | API implementada; UI parcial        | ADMIN y FARMER crean parcelas propias desde Angular (decisión posterior 2026-11-22); edición/archivo siguen ADMIN por API. Transferencia entre propietarios y gestión completa siguen pendientes.                        |
| RF-03: dispositivos        | API implementada; UI parcial        | `devices/`: provisión/clave independiente hasheada, seis sensores, consulta/deshabilitación. Formulario de provisión pendiente.                                                                                          |
| RF-04: telemetría          | Implementado con simulador          | Tres sondas, ambiente/lluvia, parcial explícita, tiempos, transacción y deduplicación. ESP32/receptor auténticos sin verificar.                                                                                          |
| RF-05: dashboard           | Implementado                        | Tres zonas, calidad, fechas, conexión, obsolescencia y errores. No reemplaza reales por demo.                                                                                                                            |
| RF-06: histórico           | Implementado (incluye 5.12)         | REST con fechas/paginación; gráfico A/B/C y tablas accesibles, presets y Desde/Hasta en Angular. Periodo fijo máximo 31 días, conversión local/UTC y límites estables al paginar/reconectar.                             |
| RF-07: riego observado     | Implementado (5.8/5.10)             | Historial derivado y evento separado `irrigation.updated` postcommit; historial consultado refresca por REST al evento/reconexión. No acredita sesiones físicas, causa, duración o litros.                               |
| RF-08: rangos              | Implementado                        | UUID/variable, unidades, versión, auditoría atómica, edición ADMIN e intervalos históricos (5.1–5.5). No configura firmware ni inventa defaults agronómicos.                                                             |
| RF-09: alertas             | Implementado                        | Desconexión y baja humedad A/B/C durables; reconocer no equivale a recuperar (5.6–5.7). Exige rango/margen explícitos; reales sin calibrar excluidos.                                                                    |
| RF-10: consumo             | Cálculo pendiente; UI no disponible | Faltan caudal calibrado y evidencia temporal suficiente. No se inventan litros.                                                                                                                                          |
| RF-11: ahorro              | Cálculo pendiente; UI no disponible | Falta línea base comparable documentada y consumo válido.                                                                                                                                                                |
| RF-12: CSV                 | Implementado (5.9)                  | Exportación de lecturas y riego observado por fechas, dispositivo/origen y propietario. Fechas personalizadas en panel Reportes, 31 días/10000 filas, sin truncado y con protección de fórmulas.                         |
| RF-13: simulación          | Implementado                        | CLI determinista, misma ingesta, aislamiento/origen y etiqueta DEMO. Provisión/inicio explícitos.                                                                                                                        |
| RF-14–22: IA               | Pendiente                           | Solo tarjeta informativa. Faltan captura/consentimiento, validación de archivo, almacenamiento privado, historial/comparación, cuotas y proveedores mock/OpenAI.                                                         |
| RF-23: registro            | Implementado                        | `/registro`: solo FARMER, contraseña validada, límite de solicitudes y sesión sin asignación automática de parcelas.                                                                                                     |

## Extensiones y arquitectura

| Área              | Implementado                                                                                                                         | Pendiente                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| RF-IA-01/02/03    | Rangos por sensor/variable, barras, comparación, unidades ambientales propias                                                        | Calibración y validación agronómica de campo                                                                       |
| RF-IA-04          | Tres bajas para activar y tres recuperaciones con margen explícito; sin control remoto                                               | Política física multizona y protecciones del firmware acordadas/probadas                                           |
| RF-IA-05          | Tres series, discontinuidades, vigencia de límites, hora local y fechas personalizadas en gráfico/tabla (5.12)                       | Validación con telemetría auténtica de campo                                                                       |
| Tiempo real       | `telemetry.updated` agregado v1.0, `device.status`, `irrigation.updated` y `sensor.status` v1.0, JWT, aislamiento, reconexión y REST | Outbox/clustering si se requieren; verificar escala del barrido por suscriptor                                     |
| IoT externo       | Canal directo e interfaz externa desacoplada                                                                                         | Protocolo, URL, credenciales y payload auténticos                                                                  |
| Clima, sección 21 | Sin módulo/tablas                                                                                                                    | Fuentes/licencias/resolución, ingesta idempotente, procedencia, cobertura y unidades                               |
| RF-PR-01–06       | Sin modelos/API/pantalla                                                                                                             | Target/horizonte, dataset, baseline, regresión offline, evaluación cronológica MAE/RMSE, versiones e incertidumbre |
| Diseño            | Sidebar/dashboard verdes, tres zonas, riego/IA, gráfico, agua no disponible, alertas/ODS; responsive                                 | Banner SVG en lugar de fotografía no disponible; varias opciones aún informativas/anclas, no pantallas completas   |
| Operación         | Salud, entorno/DTO, CORS, rate limit, hashes, tests aislados                                                                         | HTTPS/hosting, respaldo/restauración probados, endurecimiento y revisión de dependencias                           |

## Continuación recomendada

1. **Revisión manual de 5.12 con el usuario antes de otro módulo.** Historial → Desde/Hasta → Aplicar fechas al historial. Puede consultar los datos DEMO ya guardados sin iniciar simulador ni crear datos automáticamente.
2. CSV, eventos separados y fechas personalizadas del gráfico/tabla ya existen: no recrearlos. Riego observado conserva presets; sus fechas personalizadas siguen pendientes. Las tarjetas actuales y reportes tienen selección temporal independiente del histórico.
3. Cerrar pendientes: fechas personalizadas de riego y administración/asignación con permisos definidos sin acceso global; métricas solo con datos suficientes.
4. Diagnóstico IA: proveedor simulado explícito y almacenamiento privado primero; externo con consentimiento, configuración y presupuesto.
5. Clima/predicción con procedencia y evaluación reproducible, nunca órdenes de válvula.
6. Hardware auténtico y validación final/operación; puede adelantarse si se dispone de contrato, sin modificar firmware sin autorización.

No se asigna porcentaje global de avance: los requisitos tienen tamaños distintos y dependencias externas. Las pruebas con simulador no son pruebas de campo.
