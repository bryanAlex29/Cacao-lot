# Renovación visual — incremento 4

## Alcance autorizado

El usuario pidió continuar con formularios, confirmaciones e inventario de
Parcelas/dispositivos. Se conservan las reglas y permisos anteriores: ADMIN y
FARMER crean parcelas propias; edición, archivo y gestión de equipos siguen
limitados a ADMIN propietario. La API continúa siendo la autoridad.

## Cambios

- Alta de parcelas con superficie de formulario, acciones y feedback coherentes
  con el dashboard. Accesos a monitoreo, IA y clima agrupados en cada tarjeta.
- Edición con campos adaptables, estados inválidos y acción de guardar destacada.
  Abrir enfoca el nombre; cancelar o pulsar Escape devuelve el foco al activador.
- Archivo lógico con confirmación en rojo, grupo accesible y nombre obligatorio
  conservado. Abrir enfoca la confirmación; Escape limpia el nombre, cierra el
  panel y no envía solicitudes.
- Confirmaciones **en línea, no modales**: no se inventa bloqueo de toda la página
  ni un diálogo sin gestión real de foco.
- Gestión de equipos después de los resultados del inventario; alta plegada en
  un `details` nativo. Abrir el alta no realiza escrituras.
- Habilitación con serie y estado explícitos, confirmación separada y foco inicial
  en Cancelar. Escape devuelve el foco al botón de ese equipo sin cambiar estado.
- Escape/Cancelar no interrumpe una escritura pendiente. Se mantiene la revisión
  explícita ante respuesta incierta; cancelar una edición no desbloquea el reenvío.
- Clave nueva fuera del desplegable: permanece visible hasta ocultarla y sobrevive
  al refresco del inventario sin recrear el gestor. El título recibe foco, no se
  selecciona/copia la clave automáticamente.
- La región de credencial desactiva anuncios globales; solo una nota genérica
  anuncia la visualización única. Se desactivan autocompletado/corrector del
  textarea, sin prometer protección frente a extensiones o gestores externos.
  Al ocultar se elimina el textarea y vuelve el foco al desplegable de alta.
- Inventario con tarjetas de metadatos, cápsulas separadas para habilitación,
  conexión al consultar y origen; sensores agrupados. No se afirma actualización
  en vivo, calibración, instalación física ni flujo de agua.

Sin cambios en DTO/API, consultas, contratos, firmware, reglas de riego, roles,
cuotas IA, dependencias o base principal. Sin commit, push o despliegue.

## Archivos afectados

- `frontend/src/app/features/plots/plots.component.{ts,html,css}`.
- `frontend/src/app/features/plots/management.css`.
- `frontend/src/app/features/plots/{plot-management,device-management,device-inventory}.component.ts`.
- `frontend/src/app/features/plots/device-inventory.component.css` (nuevo).
- Pruebas de los tres componentes de gestión/inventario.
- `backend/test/dashboard.integration.ts` (solo pruebas de UI/fixtures aislados).
- `docs/CONTINUAR.md` y este documento.

## Verificación

- Angular: **526/526** pruebas, 33 archivos.
- Edge: **40/40** recorridos, ampliando el existente de gestión para probar alta
  plegada con teclado, foco y Escape, protección de clave y archivo explícito.
- Build, tipado frontend y lint correctos; formato/diferencias/salud local
  revisados al cierre.
- Capturas sintéticas revisadas en
  `C:\Users\Hp\AppData\Local\Temp\opencode\cacaosmart-browser-k3TKII`:
  `device-management-collapsed-mobile.png`, `plot-archive-mobile.png`,
  `device-management-mobile.png` e `inventory-browser-editor-demo-mobile.png`.
  Las capturas específicas de gestión se toman después de ocultar la clave.
- El runner eliminó su base temporal. No se registraron equipos, claves o
  parcelas de prueba en la principal ni se inició el simulador del usuario.
- Se conserva el bloqueo de la suite global por la prueba backend de clima
  `open-meteo.spec.ts:37` (TS2322, ajena a este incremento). No se volvió a ejecutar
  esa suite ni se declara aprobada. Persiste la advertencia concurrente de `pg`
  en las pruebas de navegador.

## Revisión manual

1. Parcelas: revisar alta y accesos; con ADMIN abrir edición/archivo y cancelar
   con Escape. Confirmar que el foco regresa al botón.
2. Inventario: equipos primero, sensores desplegables y alta administrativa
   plegada. FARMER no obtiene controles de escritura administrativa.
3. Si se registra un equipo real, guardar su clave de forma segura antes de
   ocultarla; esta revisión **no requiere registrar equipos** para comprobar diseño.
4. Habilitar/deshabilitar solo con intención explícita: cambia recepción de datos,
   no manda órdenes a la válvula. Cancelar no envía nada.

## Pendientes

Revisión del usuario. Siguiente incremento sugerido: pulir presentación de captura,
resultado e historial IA y revisar login/registro, manteniendo privacidad y modo
simulado. La captura original y fotografías siguen pendientes; no se declara
fidelidad visual exacta. OpenAI continúa pospuesto.
