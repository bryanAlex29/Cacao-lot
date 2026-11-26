# Preparación para subir a GitHub

## Alcance

Entrega de código del prototipo local estudiantil: mejoras de interfaz de un
sensor, ThingSpeak y relé informado, ejemplo visual de consumo, clima actual con
selector de ciudad y trabajo previo acumulado de predicción, formularios y
herramientas operativas. No es un despliegue ni validación de campo.

La rama de trabajo es `feature/agricultural-management`. Se prepara un commit
local; **el agente no ejecuta push, merge ni despliegue**. Con el commit presente
y árbol de trabajo limpio:

```powershell
git status
git push origin feature/agricultural-management
```

Si Git rechaza por cambios remotos, no usar `--force`: revisar la divergencia.
La preparación usa referencias locales; no asegura que el remoto no haya cambiado.

## Exclusiones y configuración privada

- `.env` y `.local/` están ignorados, no se incluyen claves, sesiones, fotografías,
  logs, respaldos, fixtures privados de navegador ni vínculo personal ThingSpeak.
- `node_modules/`, `dist/`, `.angular/`, cobertura y cachés no se versionan.
- Se revisan archivos candidatos contra los secretos actuales del `.env` y patrones
  de credenciales; eso reduce riesgos, pero no equivale a una auditoría de seguridad
  completa ni de todo el historial Git.
- `.env.example` solo contiene plantilla sin credenciales. El servicio meteorológico
  permanece desactivado en la plantilla.
- La confirmación de uso no comercial y activación de Open-Meteo se guardaron
  únicamente en el `.env` de esta instalación. Otra instalación debe confirmar y
  configurar sus propias variables.
- Una clonación necesita sus propias dependencias, PostgreSQL, migraciones y
  configuración. Subir código no traslada la base de datos, cuentas ni hardware.

## Verificaciones de esta preparación

- 518 pruebas backend y 681 frontend correctas.
- 24 pruebas de integración meteorológica en base temporal; eliminada al terminar.
- 117 pruebas de scripts correctas en ejecución serial.
- Lint, tipos y compilación correctos.
- Consulta pública real de Chone y clima modelado verificada.
- Navegador con fixtures aisladas: búsqueda/selección inline, homónimos,
  estados de ausencia/error y anchos 1440/768/390 px sin navegación inesperada,
  desbordamiento, excepciones ni escrituras de datos.

La primera ejecución paralela de scripts agotó el límite de 5 s al arrancar un
subproceso del test de seguridad Effect; las 117 pruebas pasaron al ejecutarse
en serie, sin cambiar ni relajar ese test. El formato de archivos meteorológicos
antiguos no tocados conserva advertencias previas; no se reformateó trabajo ajeno.

## Límites que no cambia esta entrega

No hay caudal/ahorro medido ni confirmación física de válvula. El ejemplo de agua
es ficticio y está rotulado. El clima es modelado de referencia, no del ESP32,
y la elección de ciudad no cambia la parcela. Predicciones siguen experimentales.
El importador ThingSpeak consulta la última entrada, no recupera todo el histórico.
Firmware, credenciales y roles permanecen bajo sus reglas existentes.
