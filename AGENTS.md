# CacaoSmart IoT — Entrada para agentes de desarrollo

Antes de modificar el proyecto, leer completos:
1. [Instrucciones de desarrollo](AGENTS_CacaoSmart_v1.4.md).
2. [DERCAS: requisitos funcionales y técnicos](contexto/DERCAS_CacaoSmart_v1.4.md).
3. [Referencia visual](contexto/DISENO_VISUAL_CacaoSmart.md), si el cambio afecta la interfaz.

Este archivo es un punto de entrada, no una copia de las especificaciones. DERCAS es la fuente de verdad funcional; el documento de agentes establece el stack y las reglas de trabajo. La referencia visual no autoriza a inventar datos ni reglas del hardware. Si surge una contradicción no resuelta, señalarla antes de implementar la parte afectada.

## Inicio del desarrollo
- Conservar los documentos existentes y trabajar en incrementos verificables.
- Comprobar Node.js, npm, Git y Docker y su compatibilidad antes de instalar dependencias. No asumir que están disponibles.
- Comenzar por la base Angular + NestJS + PostgreSQL/Prisma, configuración y salud; continuar con seguridad, telemetría y simulador, tiempo real y dashboard, gestión agrícola, diagnóstico IA y clima/predicción.
- No implementar todo el alcance en una única entrega. Presentar archivos afectados y criterios de aceptación para cada fase.
- No cambiar firmware, desplegar, publicar cambios ni ejecutar operaciones destructivas sin autorización.
