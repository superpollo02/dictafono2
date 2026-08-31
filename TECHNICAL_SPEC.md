# Documento de Diseño Técnico: Whisper AI Transcriber

## 1. Resumen Ejecutivo
**Whisper AI Transcriber** es una aplicación web de pila completa (full-stack) diseñada para la captura, transcripción y refinamiento de audio de alta precisión. Utiliza modelos de inteligencia artificial de última generación para transformar el habla en texto estructurado, ofreciendo herramientas avanzadas de edición, sincronización y exportación.

---

## 2. Arquitectura del Sistema

### 2.1. Frontend (Cliente)
- **Framework**: React 18 con Vite para un desarrollo rápido y optimizado.
- **Estilizado**: Tailwind CSS v4 para un diseño responsivo y moderno, con soporte nativo para modo oscuro.
- **Animaciones**: Framer Motion (`motion/react`) para transiciones fluidas y feedback visual interactivo.
- **Iconografía**: Lucide React.
- **Gestión de Estado**: Hooks nativos de React (`useState`, `useEffect`, `useRef`) para una gestión de estado ligera y eficiente.

### 2.2. Backend (Servidor)
- **Entorno**: Node.js con Express.
- **Proxy de API**: Actúa como un intermediario seguro para las peticiones a Groq Cloud, protegiendo las claves de API del lado del servidor.
- **Middleware**: 
  - `multer`: Para el manejo de archivos de audio en memoria.

---

## 3. Especificaciones Funcionales

### 3.1. Captura de Audio
- **API**: `MediaRecorder` de la web.
- **Procesamiento de Audio**: Uso de `AudioContext` y `AnalyserNode` para:
  - Visualización de forma de onda en tiempo real.
  - Detección de Actividad de Voz (VAD) para alertar sobre silencios o niveles bajos de audio.
- **Formatos**: Captura en formatos compatibles con el navegador (WebM/Ogg) y envío directo al servidor.

### 3.2. Motor de Transcripción (IA)
- **Modelo**: `whisper-large-v3` a través de Groq Cloud.
- **Capacidades**:
  - Transcripción multilingüe (optimizado para Español).
  - **Granularidad de Palabra**: Obtención de marcas de tiempo a nivel de palabra para sincronización interactiva.

### 3.3. Refinamiento de Texto (IA)
- **Modelo**: LLMs de alto rendimiento (Llama 3 / Mixtral) vía Groq.
- **Lógica**: Procesamiento de la transcripción cruda para:
  - Corregir gramática y puntuación.
  - Eliminar muletillas y repeticiones.
  - Estructurar el texto en párrafos legibles.

---

## 4. Características Técnicas Avanzadas

### 4.1. Sincronización Texto-Audio
- Implementación de un reproductor de audio personalizado que resalta las palabras en tiempo real basándose en los metadatos de la transcripción.
- Permite la navegación por el audio haciendo clic en palabras específicas del texto.

### 4.2. Sistema de Persistencia y Auto-Guardado
- **Estrategia de Guardado Dual**:
  - **Debounced**: Guarda cambios 1 segundo después de la inactividad del usuario.
  - **Periódico**: Backup automático cada 30 segundos.
- **Almacenamiento**: `localStorage` para persistencia entre sesiones sin necesidad de base de datos externa.

### 4.3. Gestión de Historial
- Almacenamiento local de sesiones previas.
- Capacidad de guardar "versiones" manuales durante el proceso de edición.

### 4.4. Flujo de Exportación
- **Formatos Locales**: Generación dinámica de archivos `.txt` y `.md` (Markdown).
- **Copia al Portapapeles**: Copia rápida del texto refinado o de toda la sesión (original + refinado).

---

## 5. Seguridad y Rendimiento

- **Seguridad de API**: Las claves de Groq y Google se gestionan exclusivamente en variables de entorno del servidor (`.env`).
- **Rendimiento**: 
  - Uso de `fetchWithRetry` para manejar inestabilidades de red.
  - Carga diferida de componentes y optimización de assets mediante Vite.
- **Privacidad**: Los datos de transcripción residen principalmente en el navegador del usuario (`localStorage`), minimizando la exposición de datos sensibles en el servidor.

---

## 6. Requisitos de Entorno
- **Variables de Entorno Necesarias**:
  - `GROQ_API_KEY`: Para transcripción y limpieza.
