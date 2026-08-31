# Whisper AI Transcriber: Documentación de Diseño, Implementación y Guía del Desarrollador

## 1. Informe de Diseño e Implementación

### 1.1. Propósito y Objetivos
**Whisper AI Transcriber** es una herramienta de productividad diseñada para convertir grabaciones de voz en texto limpio y estructurado. El objetivo principal es minimizar la fricción entre la captura de ideas y su documentación final, utilizando modelos de IA de baja latencia.

### 1.2. Decisiones de Diseño Críticas
- **Motor de IA (Groq Cloud)**: Se eligió Groq por su capacidad de inferencia extremadamente rápida (LPU), lo que permite transcripciones casi instantáneas con `whisper-large-v3`.
- **Arquitectura Full-Stack**: Se implementó un servidor Express para actuar como proxy de seguridad, evitando exponer las claves de API en el cliente.
- **Persistencia Local-First**: Para garantizar que el usuario no pierda datos por fallos de red o cierres accidentales, se priorizó `localStorage` como base de datos primaria.
- **Interfaz de Usuario (UX)**: Diseño minimalista con feedback visual constante (VAD, indicadores de guardado, resaltado de palabras).

---

## 2. Guía del Desarrollador y Documentación Interna

### 2.1. Estructura del Proyecto
```text
├── server.ts              # Punto de entrada del servidor (Express + Vite Proxy)
├── src/
│   ├── main.tsx           # Punto de entrada de React
│   ├── App.tsx            # Lógica principal, estados y UI de la aplicación
│   ├── index.css          # Estilos globales y configuración de Tailwind CSS
│   └── components/        # Componentes UI reutilizables (si aplica)
├── TECHNICAL_SPEC.md      # Resumen de especificaciones técnicas
├── package.json           # Dependencias y scripts de construcción
└── .env.example           # Plantilla de variables de entorno
```

### 2.2. Explicación del Código (App.tsx)
- **Gestión de Audio**: Utiliza `MediaRecorder` para capturar audio y `AudioContext` para la visualización en tiempo real.
- **VAD (Voice Activity Detection)**: Un algoritmo simple que analiza la amplitud del audio para alertar al usuario si el micrófono no está captando sonido.
- **Auto-Save**: Implementado mediante un `useEffect` que combina `setTimeout` (debounce) y `setInterval` (periódico) para sincronizar el estado de la app con `localStorage`.
- **Sincronización de Palabras**: La aplicación mapea el `currentTime` del reproductor de audio con los objetos de palabras devueltos por Whisper para el resaltado dinámico.

### 2.3. Mantenimiento y Extensión
- **Actualización de Modelos**: Para cambiar el modelo de transcripción o limpieza, modifique los parámetros en las rutas `/api/transcribe` y `/api/clean` en `server.ts`.
- **Nuevas Exportaciones**: Añada nuevos manejadores en el menú de exportación de `App.tsx` y, si requieren autenticación, cree la ruta correspondiente en `server.ts`.

---

## 3. Guía de Uso y Configuración

### 3.1. Instalación
1. Clonar el repositorio.
2. Ejecutar `npm install` para instalar dependencias.
3. Copiar `.env.example` a `.env` y configurar las claves necesarias.

### 3.2. Scripts Disponibles
- `npm run dev`: Inicia el servidor de desarrollo (Express + Vite).
- `npm run build`: Compila la aplicación para producción.
- `npm run lint`: Ejecuta el chequeo de tipos de TypeScript.

### 3.3. Variables de Envío
- `GROQ_API_KEY`: Clave de API de Groq Cloud.

---

## 4. Memoria del Proyecto (Historial de Desarrollo)

### 4.1. Fase 1: Cimientos y Captura
- Configuración inicial de React + Express.
- Implementación de la captura de audio con visualizador de ondas.
- Integración básica con la API de Transcripción de Groq.

### 4.2. Fase 2: Inteligencia y Refinamiento
- Implementación del motor de "Limpieza de Texto" usando LLMs para corregir gramática y estilo.
- Añadida la funcionalidad de resaltado de palabras sincronizado con el audio.

### 4.3. Fase 3: Persistencia y Robustez
- Creación del sistema de Auto-Save (Debounced + Periódico).
- Implementación del Historial de sesiones locales.
- Solución de problemas de permisos de micrófono y cookies en entornos de iframe.

### 4.4. Fase 4: Refinamiento y Edición
- Añadida la capacidad de editar tanto el texto limpio como la transcripción original.
- Refinamiento estético final y soporte completo para modo oscuro.
- Preparación para despliegue en Vercel (refactorización Serverless).

### 4.5. Problemas Resueltos (Logros Técnicos)
- **Desafío**: Pérdida de datos al refrescar. **Solución**: Sistema de auto-guardado automático.
- **Desafío**: Errores de CORS/Iframe en AI Studio. **Solución**: Configuración específica de `SameSite: none` y `Secure: true` en las cookies de sesión.
- **Desafío**: Sincronización de edición manual. **Solución**: Lógica de limpieza de metadatos de palabras al editar el texto original manualmente para evitar desajustes.

---

## 5. Resumen de Recuperación Total
Para reconstruir o migrar este proyecto, asegúrese de tener:
1. El archivo `server.ts` para la lógica de backend y proxy.
2. El archivo `src/App.tsx` que contiene el 95% de la lógica de cliente.
3. Las dependencias listadas en `package.json`.
4. Una clave de API de Groq válida configurada en el entorno.
