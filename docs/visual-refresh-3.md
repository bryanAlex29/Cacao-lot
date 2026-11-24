# Renovación visual — incremento 3

## Alcance autorizado

El usuario aprobó el incremento 2 y pidió continuar con el encabezado común de
parcela y cuenta. Se aplicó a Dashboard, Parcelas, Diagnóstico IA y Clima.
Se conserva la navegación y el trabajo anterior sin commit.

## Cambios

- `PageHeaderComponent` compartido: parcela/contexto, ubicación, icono agrícola,
  nombre de usuario, rol y botón «Salir». No expone correo ni secretos.
- «Cambiar parcela» enlaza al listado Angular existente cuando hay una parcela
  consultada. No aparenta ser un selector desplegable.
- Componente de presentación sin servicios HTTP, autenticación o almacenamiento
  propios: recibe datos del padre y emite una solicitud de salida.
- Dashboard mantiene el único `h1` en el encabezado. Las otras pantallas conservan
  su `h1` en el contenido; el encabezado utiliza un título contextual sin crear
  otro título principal.
- Solo Dashboard pasa estado de conexión y fecha de lectura, procedentes de la
  selección y fachada de telemetría existentes. DEMO/REAL explícito. Sin equipo
  seleccionado no aparece cápsula; canal/datos degradados no se pintan como
  saludables. No se deduce conexión del sensor por entrar a IA, Clima o Parcelas.
- Paneles secundarios integrados bajo el mismo encabezado, con anchura mínima
  segura y distribución adaptable para nombres/ubicaciones largos.
- Salida del Dashboard y Parcelas conserva sus manejadores existentes.
  IA y Clima reutilizan `AuthService.logout()`, limpian su estado, cancelan
  suscripciones del navegador y navegan a `/login`.
- Salir no deshace operaciones que el servidor ya hubiera aceptado: cancelar
  una suscripción no acredita cancelar un procesamiento o guardado remoto.

No cambia la renovación de sesión, cookie HttpOnly, permisos, origen de datos,
API, contratos, consultas existentes o firmware. No añade indicadores falsos,
dependencias, migraciones, llamadas OpenAI, commit, push o despliegue.

## Archivos principales

- `frontend/src/app/shared/ui/page-header.component.{ts,css,spec.ts}` (nuevos).
- Componentes y estilos de `features/dashboard`, `features/plots`,
  `features/ai-diagnosis` y `features/weather`.
- Pruebas de Dashboard y Diagnóstico; nuevo `weather.component.spec.ts`.
- `backend/test/dashboard.integration.ts`: solo recorridos UI y fixtures de
  nombres largos dentro de la base temporal del runner.
- `docs/CONTINUAR.md` y este documento.

## Criterios de aceptación

1. Un encabezado común y un solo `h1` en cada una de las cuatro pantallas.
2. Usuario y rol reales de sesión, sin inventar un rol cuando no hay usuario.
3. Cambiar parcela sin navegación de documento ni pérdida de sesión.
4. Sin desbordamiento en 320, 390, 768 y 1440 px, con nombres largos.
5. Conexión y origen solo en Dashboard, con fecha disponible y degradación
   coherente con los datos/canal existentes.
6. Salir de IA y Clima retira datos privados de la pantalla y protege el regreso
   a la ruta privada después de recargar.

## Verificación ejecutada

- Angular: **518/518** pruebas, 33 archivos. Componente compartido sin servicios
  propios, rol/ausencia de sesión, eventos, títulos, fechas y degradación de
  conexión. IA y Clima comprueban limpieza y cancelación de consultas al salir.
- Edge: **40/40** recorridos. Además de los 38 anteriores, nombres largos en las
  cuatro pantallas a 320/390/768/1440 px y cierre de sesión real desde IA con
  retirada de la foto local y protección de la recarga.
- La salida de Clima está verificada con pruebas de componente; no se presenta
  como un recorrido de logout completo adicional en Edge.
- `npm.cmd run build`, tipado frontend y lint: correctos.
- Formato de archivos afectados, diferencias y salud local revisados al cierre.
- Capturas sintéticas del runner:
  `C:\Users\Hp\AppData\Local\Temp\opencode\cacaosmart-browser-XvpdhC`.
  Hay capturas de los cuatro encabezados con nombres largos en escritorio/móvil;
  no son datos ni fotografías del usuario.
- Se usan los servicios locales existentes. No se inició el simulador del usuario,
  no se cambiaron cuentas reales y el runner eliminó su base temporal.

La prueba de salida reutiliza el cookie jar actual sin copiar cookies rotativas
entre contextos ni agregar logins innecesarios. No se ampliaron límites de login
o timeouts de producción. Persiste la advertencia de consultas concurrentes de
`pg` en el runner; no impidió los 40 recorridos correctos.

## Pendientes

- Revisión manual del usuario en http://localhost:4200.
- Incorporar fotografías y comprobar fidelidad exacta cuando se vuelva a adjuntar
  la captura original; no se descargaron imágenes en este incremento.
- Siguiente incremento sugerido: pulido de formularios, diálogos e inventario de
  Parcelas/dispositivos, conservando roles, confirmaciones y credencial efímera.
- OpenAI sigue pospuesto. El error TS2322 de la prueba backend de clima documentado
  en el incremento 1 es ajeno a este cambio; no declarar aprobada toda la suite
  global solo por aprobar frontend y navegador.
