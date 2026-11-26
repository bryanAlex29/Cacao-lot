# Renovación gráfica · un sensor visible

## Alcance autorizado

El usuario pidió mejorar únicamente la apariencia y mostrar solo el sensor de
suelo 1, con el que trabajará el equipo. Esta indicación actualiza la presentación
original de tres zonas de DERCAS/referencia visual, **no el contrato ni la
persistencia de telemetría**. No se eliminan lecturas, inventario ni registros.

## Cambios visuales

- Verde bosque y fondos claros, tipografía de sistema sin descargas externas,
  detalles dorados, sombras ligeras y bordes uniformes.
- Menú y encabezados compartidos: mejor jerarquía, identidad y estados legibles.
- Dashboard: banner con formas orgánicas CSS, indicador circular de humedad
  basado en el valor existente, tarjetas ambientales y lluvia diferenciadas.
- Login/registro, parcelas/gestión, diagnóstico, clima, predicción y estado
  técnico conservan funciones, con presentación coherente.
- Gráfico, leyenda, tabla y rangos históricos visibles solo del sensor 1.
  La función de cálculo y los datos de las otras series no se borran.
- DEMO de lluvia sin tarjeta B/C. Predicción/cobertura presentan únicamente
  suelo 1, aunque siguen validando/recibiendo la respuesta original completa.
- Configuración visible de alertas de suelo para sensor 1. Las alertas
  históricas y el inventario técnico no se eliminan ni se ocultan por CSS.

## Límites conservados

Sin cambios en backend, Prisma, autenticación, permisos, API, base de datos,
`.env`, frecuencia de ThingSpeak, firmware, relé, válvula o generación de datos.
La demo continúa sin persistir. No hay dependencias, fuentes externas, imágenes
generadas ni solicitudes nuevas a servicios externos. Sin nuevas métricas,
umbrales, predicciones o estados de conexión decorativos.

Los controles mantienen foco visible; las transiciones respetan
`prefers-reduced-motion`. Los estados ausente/antiguo/error y REAL/DEMO permanecen
explícitos, sin atribuir validez agronómica al indicador circular.

## Archivos principales

- `frontend/src/styles.css` y `frontend/src/app/shared/ui/*.css`.
- `features/dashboard/`: estilos, plantilla, tarjetas, histórico y demo.
- Estilos de login, parcelas/gestión, diagnóstico, clima, predicción y estado.
- Plantillas de cobertura/predicción y pruebas de representación.

## Verificación

- `npm.cmd run test --workspace=@cacaosmart/frontend`: 650 pruebas correctas.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`: correctos.
- Las pruebas comprueban que solo se muestra el sensor 1 pero se conserva el
  objeto de datos original con las tres claves; sin cambios de payload/API.
- Navegador Edge con APIs y sesión **sintéticas interceptadas**, sin credenciales
  del usuario ni acceso a su base. Dashboard a 1440/768/390 px, un solo sensor,
  demo de lluvia y retorno al valor original; menú móvil funcional y sin
  desbordamiento horizontal de página ni excepciones JavaScript.
- Se amplió a 21 comprobaciones de distribución incluyendo acceso, registro,
  parcelas, diagnóstico, clima, predicción y estado a 1440/390 px, con escenarios
  sintéticos o de datos no disponibles. Se corrigió un espacio vertical sobrante
  en pantallas cortas móviles fijando las filas del layout compartido.
- Capturas privadas en `.local/visual-refresh/`, con nombres de prueba visibles.
  No representan mediciones reales ni una validación del hardware.

Revisión final recomendada: abrir la sesión habitual y comprobar tarjetas,
histórico, estados y simulación con la pantalla/dispositivo del usuario.
