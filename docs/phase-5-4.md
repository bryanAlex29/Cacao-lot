# Fase 5.4 — Opción A: clasificación en tarjetas

## Alcance autorizado

Comparación numérica independiente para las tres sondas de suelo, temperatura y humedad ambiental. Se conservan la calidad de cada dato, su antigüedad, las marcas de tiempo y el origen real/DEMO. La lluvia booleana no se clasifica contra rangos numéricos.

Esta entrega **no añade líneas al gráfico, clasificación del histórico, alertas, histéresis/antirrebote, agregaciones entre sondas ni órdenes de riego**. Tampoco modifica API, modelos/migraciones, contratos de eventos, firmware, calibración, roles, configuración local o procesos del simulador. Cualquier cambio adicional requiere nueva autorización.

## Regla de comparación

Para un dato numérico utilizable y reciente, con rango disponible y unidad compatible:

| Condición               | Indicador  |
| ----------------------- | ---------- |
| valor < mínimo          | ↓ Bajo     |
| mínimo ≤ valor ≤ máximo | ↔ En rango |
| valor > máximo          | ↑ Alto     |

**Los extremos son inclusivos**, como convención de monitoreo acordada en la opción A. No es una política nueva para el firmware ni una recomendación agronómica.

Se utiliza la configuración actual del sensor para comparar la última lectura mostrada. Cambiar el rango reclasifica ese número sin cambiar su valor o fecha ni generar otra lectura. No se presenta esa configuración como si hubiera estado vigente en todas las lecturas históricas.

## Calidad, antigüedad y configuración

La calidad y la comparación se muestran por separado. «Sin calibrar» no es sinónimo de «Bajo», «En rango» o «Alto». «Dato recibido» tampoco afirma calibración verificada.

Orden de evaluación:

1. Calidad inválida/desconocida, número no finito o valor fuera de los límites técnicos del contrato → **Dato inválido**; sin cifra utilizable ni relleno de barra que lo presente como válido.
2. Valor null o calidad missing → **Sin datos**, sin sustituir por cero ni conservar silenciosamente el valor de otra lectura.
3. Antigüedad o conexión no actual según los criterios existentes de `TelemetryFacade` → **Desactualizado**; se conserva el valor y su fecha, pero no una clasificación vigente bajo/en rango/alto.
4. Sin selección, consulta en curso, configuración ausente o no disponible → estado explícito correspondiente, sin inventar rangos. «Sin rango configurado» solo corresponde a una consulta correcta que devuelve ausencia.
5. Con rango configurado, finito, ordenado y compatible con la unidad del sensor → comparación bajo/en rango/alto.

Una falla en el rango de una sonda no suprime las clasificaciones de las otras sondas ni de las variables ambientales. Las ausencias/errores de calidad impiden clasificar aunque exista configuración.

## Presentación y seguridad semántica

- Texto e iconos acompañan al color; el estado no depende exclusivamente del color.
- La barra de suelo conserva su escala física 0–100 %. Su color acompaña el indicador; no se convierte en promedio de sensores ni porcentaje de cumplimiento agronómico.
- Lectura real **sin calibrar**: se mantiene la advertencia. Incluso si numéricamente está dentro del rango, su indicador es ámbar y aclara «Comparación numérica · sin calibrar».
- **DEMO** conserva su aviso explícito; la comparación lleva «DEMO · Comparación simulada» y, dentro del rango, tono azul de demostración en vez de verde de aparente normalidad de campo.
- Para datos reales con calidad valid del contrato, el verde significa únicamente comparación numérica dentro del rango configurado. Se aclara «Comparación numérica, no diagnóstico»; no se etiqueta el cultivo como «Normal» o «Sano».
- Bajo/alto pueden cambiar con cada lectura: no hay motor de alertas ni promesa de antirrebote en este incremento.

## Actualización

Se reutilizan señales y computed de Angular, sin solicitudes HTTP adicionales:

- La telemetría sigue el recorrido existente: evento Socket.IO → recuperación REST autorizada → señales de la pantalla.
- Las comparaciones cambian con lecturas, calidad, antigüedad o rangos nuevos.
- El guardado ADMIN conserva versión/permisos/auditoría y refresco de fase 5.3; al recuperar el rango nuevo se recalcula la tarjeta sin insertar lecturas.
- Cambio de dispositivo, parcela, origen o sesión conserva la limpieza/cancelación de las fachadas existentes. No hay fallback de datos reales a DEMO.

## Archivos afectados

- `frontend/src/app/core/sensor-thresholds/sensor-assessment.ts`: función pura de evaluación numérica y calidad.
- `frontend/src/app/core/sensor-thresholds/sensor-assessment.spec.ts`: reglas, límites, estados y unidades.
- `frontend/src/app/features/dashboard/sensor-assessment.component.ts`, `.spec.ts`: presentación compartida y pruebas de tarjeta.
- `frontend/src/app/features/dashboard/soil-sensor-card.component.ts`: evaluación reactiva y barra con dato utilizable.
- `frontend/src/app/features/dashboard/dashboard.component.ts`, `.html`, `.spec.ts`: integración de A/B/C y ambiente, calidad/antigüedad y pruebas.
- `backend/test/dashboard.integration.ts`: verificaciones nuevas de navegador; ningún cambio al backend de negocio.
- `README.md`, `docs/HANDOFF.md`, este documento: alcance, uso y límites.

## Verificación

```powershell
npm run lint
npm run typecheck
npm run test --workspace=@cacaosmart/frontend
npm run test --workspace=@cacaosmart/backend
npm run test:integration
npm run test:simulator
npm run build
npm run smoke
$env:BROWSER_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:browser
```

Cobertura nueva: extremos inclusivos para cada sensor cuantitativo, cero, temperatura negativa, null/missing/invalid/no finitos, antigüedad, ausencia/error/carga de rango, unidad incompatible, advertencia de calibración y DEMO, reclasificación reactiva y cinco tarjetas independientes.

Las pruebas de navegador añaden clasificación tras ingesta/Socket.IO, cifras ambientales y cero, ausencia de rango sin inventar «Normal», calidad conservada y reclasificación al guardar sin otra lectura persistida. Todas las fixtures están en bases temporales del runner, nunca en la principal.

Resultado: **360 pruebas correctas — 168 Angular, 97 backend, 73 integración PostgreSQL/Socket.IO, 12 navegador Edge Chromium y 10 simulador**. Se agregaron 59 pruebas Angular y 2 de navegador en esta entrega. Lint, tipos, compilación y smoke correctos. Se revisaron capturas sintéticas de clasificación a 1440 px y 390 px; móvil sin desbordamiento. No equivale a una auditoría completa de accesibilidad o validación con sensores reales.

Prettier se verifica solo en archivos del incremento; los avisos globales CRLF anteriores no justifican reformatear todo el proyecto. La clasificación de tarjetas es solo un cumplimiento parcial de RF-IA-02: las líneas del histórico y los restantes requisitos de gestión agrícola siguen pendientes.

## Próximo paso

Esperar autorización. Las líneas mín./máx. del histórico requerirán acordar cómo respetar la vigencia temporal de los rangos; no se dibujará automáticamente el rango actual como si siempre hubiera existido.
