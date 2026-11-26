# Revisión de software sin hardware — 25/11/2026

## Alcance autorizado

El usuario pidió revisar experiencia de uso, auditar requisitos y completar
pendientes verificables sin circuito. Excluyó explícitamente pruebas/cambios de
arranque y cierre (punto 1), y entrega/publicación del código (punto 5).
Posteriormente autorizó cerrar el punto 4 y después comenzar el punto 1.
La entrega/publicación sigue excluida.
No se conectan OpenAI ni proveedores reales, se cambia firmware o se modifican
credenciales, permisos, datos de la cuenta principal o configuración privada.

Fuentes: DERCAS v1.4, instrucciones de agentes y referencia visual existentes.
Se mantiene Angular/NestJS/PostgreSQL/Prisma y el diseño vigente.

## Hallazgos y correcciones de este incremento

### Alta de parcelas ante una respuesta perdida

Antes, un error de red/5xx al crear una parcela invitaba a volver a intentarlo.
La ausencia de respuesta no demuestra que el POST no se haya guardado.
Repetirlo podía crear otra parcela con el mismo borrador.

Ahora:

- El borrador se conserva y la UI distingue rechazo conocido de resultado incierto.
- En red, timeout o 5xx se bloquea otro envío hasta actualizar correctamente
  la lista y revisar si la parcela ya aparece.
- Una consulta fallida no levanta ese bloqueo.
- Las consultas y el envío tienen límite de diez segundos.
- Mientras se guarda, no se pueden editar los campos ni iniciar desde el
  componente otra actualización de lista.
- Nombre/ubicación con solo espacios son inválidos y tienen mensaje asociado.

No se añadió idempotencia en servidor ni unicidad de nombres: una creación
posterior voluntaria o una operación desde otra sesión sigue siendo posible.
Consultar la lista reduce el riesgo, pero no garantiza que un servidor lento
haya terminado un POST anterior; revisar el resultado antes de otro intento.
No se cambiaron API, esquema, reglas de permisos ni política de parcelas.

### Menú móvil y teclado

Antes, Escape no cerraba el menú y los enlaces que no emitían sección podían
dejarlo expandido. Ahora Escape cierra y devuelve el foco al botón Menú;
seleccionar cualquier enlace de la navegación lo cierra. Las rutas y parámetros,
los eventos de sección y la sesión se conservan.
Escape en un menú cerrado no se intercepta.

### Auditoría documental

`requirements-status.md` seguía afirmando que clima y predicción no tenían
módulos/tablas/API/UI, y que no existía respaldo restaurado de prueba.
Se actualizó con evidencia de las implementaciones actuales y sus límites.
La matriz no asigna un porcentaje global ni afirma validación de campo.

## Cobertura de la revisión de uso

Se reutiliza la matriz de navegador para login/registro, cinco pantallas
principales, móvil, nombres largos, formularios, null/cero, errores y reintentos,
sesión, CSV, alertas, fechas, historial, IA DEMO, clima y predicción.
Se añade un recorrido móvil con teclado y creación realmente persistida en
base temporal cuya confirmación se reemplaza por 503 antes de llegar a Angular.
Se comprueba que no se envía otro POST y que la parcela aparece al actualizar.

Esto no equivale a auditoría WCAG completa ni revisión humana de cada teléfono.
No se rediseña la interfaz, activan funciones de hardware ni fabrican imágenes.

## Segundo incremento: cierre acotado del punto 4

Se revisaron las escrituras disponibles, no solo los formularios de alta:

| Operación | Tratamiento de respuesta perdida/incompatible |
| --- | --- |
| Login/registro | Límite de 15 s, sin reenvío automático. Registro por correo único en servidor; se indica intentar login si la cuenta pudo crearse. No se añade recuperación de contraseña insegura. |
| Alta de parcela | Valida respuesta y página de revisión antes de declarar éxito/desbloquear. Respuesta vacía/inválida conserva borrador y exige revisión. |
| Editar/archivar parcela | PATCH valida identidad y datos de respuesta; los errores conservan borrador y bloqueo. Campos de edición bloqueados mientras guarda. DELETE conserva contrato 204 sin cuerpo. |
| Alta de dispositivo | Mantiene validación de identidad/clave, borrador y separación REAL/DEMO; desbloqueo manual solo después de un inventario validado posterior al fallo. No recupera claves perdidas. |
| Habilitar dispositivo | Valida identidad y `isActive` devuelto. Fallo/timeout/respuesta incompatible bloquean otros cambios hasta inventario correcto. Una consulta fallida no desbloquea. No puede actualizar inventario mientras una escritura sigue pendiente. |
| Clima | Ya protegía perfil versionado. Se añade bloqueo tras respuesta de sincronización incompatible y validación de `updated/cooldown`; actualizar estado no cancela una escritura activa. Pruebas con HTTP simulado, sin proveedor externo. |
| Rangos y margen de alertas | Ya validan respuestas, usan versión esperada y exigen consulta tras resultado incierto. Se conserva el comportamiento. |
| Reconocimiento de alertas | Ya valida identidad/confirmación y bloquea tras error; operación idempotente en servidor, sin reenvío automático en cliente. |
| Diagnóstico DEMO | Alta con clave idempotente conservada al reintentar; eliminación por ID, sin cargo/reenvío automático. Se conserva proveedor simulado y consentimiento. |

El navegador reproduce una habilitación **persistida en base temporal**, cuya
confirmación se sustituye por 503; también falla la consulta siguiente. Al
recuperar el inventario se usa el estado actualizado, no la confirmación vieja.
Las pruebas unitarias cubren respuestas vacías/cruzadas, timeouts y lectura
fallida antes del desbloqueo. Resultados finales de esta repetición se registran
al cerrar la validación.

- `npm.cmd test`: 384 backend y 641 Angular correctos; repetición tras el último
  bloqueo de alta mientras se lee inventario: **642 Angular** (19 nuevos).
- `npm.cmd run typecheck`, `npm.cmd run lint` y `npm.cmd run build`: correctos.
- Primer navegador: 46/47; los casos nuevos correctos, pero la prueba existente
  de sesión/reconexión al adelantar el reloj falló a los 30 s. Se repite en una
  base nueva, sin eliminar ni ignorar esa prueba.
- La base temporal del primer intento se eliminó y su clúster se detuvo.
- Segundo navegador: 36/47. Hubo guardados de código mientras Angular estaba en
  modo watcher; esa ejecución no sirve como cierre estable. También se corrigió
  la prueba de Escape para esperar la actualización real de `aria-expanded`,
  en vez de comprobar el atributo inmediatamente tras enviar la tecla.
  No se eliminaron casos ni se elevaron sus timeouts para ocultar los fallos.
  Se repite la matriz completa sin editar las fuentes mientras corre.
- La repetición estable posterior obtuvo 46/47: el caso de teclado funcionó
  aislado, pero otra autenticación dentro de la matriz acumulaba intentos sobre
  el límite real de login. Se reutiliza cookie autorizada para ese recorrido
  (login ya tiene sus propios casos), sin elevar límites del servidor.
- Otra repetición detectó la normalización de `datetime-local` de Edge:
  segundos `00` se omiten en el valor canónico. La función de fechas IA ahora
  usa esa forma, igual que las de historial/riego, sin cambiar instante ni filtro.
  Se espera también a `nav.expanded` antes de enfocar y enviar Escape.
  Última matriz completa: pendiente de resultado.

Esto cierra los huecos reproducidos de los formularios actuales dentro del
punto 4; **no significa que todos los requisitos del producto estén terminados**.
No se crean por inferencia transferencias, rotación de credenciales, correo ni
fórmulas agronómicas. Tampoco garantiza exactamente una escritura entre sesiones
para operaciones que no tienen clave idempotente en servidor.

## Pendientes clasificados fuera del cierre acotado

### Mejoras de software sin componentes que siguen siendo posibles

- Auditoría más amplia de accesibilidad: contraste, lector de pantalla, foco
  entre rutas y zoom; trabajar sobre problemas reproducidos, no sobre un sello
  de cumplimiento inventado.
- Seguir añadiendo regresiones si aparecen nuevos formularios o fallos; la
  revisión de los formularios existentes se registra arriba.
- Administración adicional: solo tras concretar permisos y contratos (por
  ejemplo, rotación de clave IoT y restauración de parcelas archivadas).
  No cambiar claves o asignaciones de la cuenta principal para probarlo.
- Recuperación de cuenta/verificación de correo: requiere decisión de identidad
  y canal de entrega; un botón que cambie una contraseña sin verificar identidad
  no es una solución válida.

### Software que requiere definiciones, no necesariamente hardware presente

- Balance hídrico y demanda: método, unidades, parámetros, procedencia y
  supuestos agronómicos. Se puede diseñar/probar con fixtures tras acordarlos,
  pero no presentar el resultado como demanda real de cacao.
- Intervalos calibrados de predicción: método de evaluación temporal y datos
  suficientes; bandas arbitrarias no sustituyen calibración.

### Dependencias externas explícitas

- OpenAI real: pospuesto por el usuario.
- ESP32/receptor: contrato auténtico, red, identidad y pruebas de calibración.
- Reglas de control multizona para una válvula: decisión y validación del equipo,
  no inventar promedio/mínimo/mayoría desde la web.
- Caudal/ahorro/precisión real: medición, línea base e historial de campo.

### Fuera del encargo actual

- Arranque, cierre Ctrl+C y procesos locales: autorizado después del punto 4,
  con evidencia en [uso local](LOCAL.md).
- Commit, empaquetado de entrega, publicación, hosting, dominio y despliegue.

## Archivos y verificación

Cambios de UI en `frontend/src/app/features/plots/plots.component.{ts,html,css}`
y `frontend/src/app/shared/ui/app-sidebar.component.ts`, con sus pruebas.
Regresión de navegador en `backend/test/dashboard.integration.ts`.
Auditoría en `docs/requirements-status.md` y este informe.

Resultados de la repetición final:

- Backend: 384 pruebas correctas; frontend: 623 pruebas correctas en 40 archivos
  (nueve nuevas respecto a las 614 anteriores), sin errores no controlados.
- Edge: 47 recorridos correctos, incluido respuesta perdida tras commit,
  conservación del borrador, consulta antes de reintentar, menú/teclado y móvil.
- Tipos, lint y build backend/frontend correctos.
- PostgreSQL temporal: migrado solo para esta matriz, eliminado al terminar y
  clúster de prueba detenido. No se usaron fixtures en la principal.
- Capturas sintéticas: `Temp/opencode/cacaosmart-browser-HXmYXN`.
- Persiste el aviso conocido de consultas concurrentes de `pg`; no se ocultó.

El primer intento unitario detectó una navegación asíncrona no controlada en
la prueba nueva del menú; se sustituyó esa navegación en la prueba unitaria,
sin ocultar errores de la aplicación. El intento con error no cuenta como aprobado.
Se conservan finales de línea previos del directorio de trabajo; no se hace una
normalización masiva de archivos ajenos. El chequeo global de formato mantiene
su pendiente anterior y los archivos editados mezclan LF/CRLF; no se declara
aprobado ese chequeo. La comprobación de estilo normalizando solo en memoria
y `git diff --check` se registran separadamente.
