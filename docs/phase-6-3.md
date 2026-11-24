# Fase 6.3 — Comparación privada de dos fotografías

## Alcance y aceptación

Incremento autorizado por el usuario tras los filtros 6.2. Implementa RF-20: elegir dos fotos distintas de una parcela propia, mostrar fotografías, fechas de creación, notas y resultados orientativos existentes. **OpenAI sigue pospuesto:** no hay nuevo análisis, llamadas externas ni consumo de cuota de análisis.

- **Añadir a comparación** en cada registro del historial; máximo dos, sin duplicados. Pendientes y registros sin imagen no son elegibles. Un análisis fallido con foto conservada puede compararse, sin inventar resultado.
- Foto A/B según orden de selección; **Intercambiar fotos**, **Quitar Foto A/B**, **Limpiar comparación** y enlace de foco **Ver comparación**.
- Dos columnas en escritorio, apiladas en móvil, imágenes completas sin recorte.
- La selección conserva solo IDs en memoria al filtrar, actualizar o paginar. No modifica el borrador de subida ni el resultado abierto; no se persiste en URL ni almacenamiento del navegador.
- Cambio de parcela, salida, navegación o desmontaje limpian la comparación. Confirmar eliminación retira primero la foto elegida, incluso si la operación falla y requiere verificar el historial.
- Cada tarjeta consulta metadata autorizada antes de descargar el JPEG privado. Valida identidad, parcela, origen DEMO y vigencia. No muestra sustitutos ante error, ausencia o pérdida de acceso.
- **Actualizar Foto A/B** revoca la imagen anterior y vuelve a consultar acceso/metadata/foto. Las URL `blob:` se revocan al quitar, sustituir, fallar o desmontar; se cancelan solicitudes pendientes. La expiración conocida elimina automáticamente foto y resultado.
- Una eliminación o revocación desde otra pestaña no se conoce instantáneamente: se detecta al actualizar o volver a seleccionar. No hay suscripción de eventos del módulo IA.

La app no identifica plantas: el usuario debe verificar que las fotos sean de la misma planta. La fecha mostrada corresponde al diagnóstico, no a EXIF/captura. **No afirma mejoría, empeoramiento, enfermedad o eficacia de tratamientos.** El proveedor sigue simulado: resultados idénticos son esperados y no implican evaluación de las imágenes.

## Archivos y compatibilidad

- `frontend/src/app/features/ai-diagnosis/diagnosis-comparison-card.component.{ts,html,css,spec.ts}`: tarjeta aislada, carga privada, expiración, cancelación y pruebas.
- `frontend/src/app/features/ai-diagnosis/ai-diagnosis.component.{ts,html,css,spec.ts}`: selección, acciones y presentación responsive.
- `frontend/src/app/core/ai-diagnosis/ai-diagnosis-api.service.ts`: comprobar también ID exacto en consulta individual.
- `backend/test/dashboard.integration.ts`: recorrido Edge con fotografías sintéticas privadas y base temporal.
- README, CONTINUAR, HANDOFF y matriz de requisitos.

Sin endpoints, migraciones, dependencias o variables nuevas. Sin cambios de permisos, firmware, `.env` ni datos de la base principal. Sin commit, push o despliegue.

## Revisión manual

1. En **Mis parcelas → Diagnóstico IA · DEMO**, disponer de dos diagnósticos propios con fotos conservadas. Si hace falta crearlos, subir fotos autorizadas con consentimiento; esa creación sí usa la cuota DEMO habitual.
2. En el historial, pulsar **Añadir a comparación** en dos registros y después **Ver comparación**.
3. Revisar fotos, fechas, notas, etiquetas DEMO y resultados; intercambiar A/B.
4. Aplicar un filtro que oculte esos registros: ambas tarjetas permanecen. Actualizar Foto A/B no crea diagnósticos.
5. Quitar una foto y elegir otra; limpiar comparación sin cambiar filtros ni foto sin enviar.
6. Comprobar móvil: tarjetas apiladas, sin desplazamiento horizontal.
7. Cambiar de parcela o salir: no deben permanecer fotos seleccionadas.

Mantener la integración real OpenAI pendiente hasta autorización expresa de configuración, consentimiento externo y presupuesto.

## Verificación ejecutada

**960 pruebas aprobadas:** 492 Angular, 250 backend, 171 integración PostgreSQL/Socket.IO, 37 navegador Edge y 10 simulador. Comandos: `npm.cmd run test --workspace=@cacaosmart/frontend -- --runner-config=C:/Users/Hp/AppData/Local/Temp/opencode/cacaosmart-management-vitest.mjs`, `npm.cmd run test --workspace=@cacaosmart/backend`, `npm.cmd run test:integration`, `npm.cmd run test:browser` (Edge mediante `BROWSER_EXECUTABLE_PATH`) y `npm.cmd run test:simulator`. También build, typecheck y lint correctos.

24 casos Angular adicionales cubren selección, filtros, eliminación/salida, identidad/origen incorrectos, imagen ausente, diagnóstico fallido, errores HTTP, JPEG inválido/vacío, cancelación, reintento, cambio de parcela, intercambio sin nueva descarga, expiración y liberación de URLs. Edge verifica fotos privadas reales sintéticas, intercambio, filtros sin perder selección, escritorio en columnas, móvil 390 px sin desbordamiento, eliminación externa/revalidación, eliminación local y ninguna subida/análisis al comparar. Capturas revisadas en `C:/Users/Hp/AppData/Local/Temp/opencode/cacaosmart-browser-I6Lc8S/ai-comparison-{desktop,mobile}.png`. Datos exclusivamente en bases temporales eliminadas por el runner.

Primer intento detectó una aserción antes del render de intercambio: se espera ahora el contenido visible, sin elevar timeouts. En otra ejecución paralela con integración falló la prueba preexistente de subida al recargar la sesión; la nueva comparación pasó. Repetición completa de Edge por separado: **37/37**. No se atribuye una causa definitiva a ese fallo intermitente ni se cambia la autenticación productiva para ocultarlo. Permanece el aviso previo de deprecación de `pg`.
