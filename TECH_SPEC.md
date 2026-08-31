# 🎙️ DICTAFONO AI: Especificación Técnica Maestra

Este documento sirve como la guía técnica oficial para el desarrollo, mantenimiento y migración de la aplicación **Dictafono AI**.

---

## 1. Visión General
**Dictafono AI** es una aplicación de escritorio/móvil basada en web para la captura inteligente de audio, transcripción de alta fidelidad y refinamiento de contenido mediante Large Language Models (LLMs).

---

## 2. Stack Tecnológico
- **Lenguaje:** TypeScript.
- **Frontend:** React 18 (Vite).
- **Estándar CSS:** Tailwind CSS con configuración de temas dinámicos.
- **Animaciones:** Framer Motion (interacciones fluidas y micro-estados).
- **Icons:** Lucide React.
- **Audio:** Web Audio API (Procesamiento en tiempo real y offline).
- **IA:** Integraciones con Groq (Whisper V3, Llama 3) y Google Gemini.

---

## 3. Motor de Audio (DSP - Digital Signal Processing)
La aplicación limpia el audio en el cliente antes del envío para maximizar la tasa de éxito de la transcripción.

### Filtros Offline (Denoise Pro):
1. **High-pass (150Hz):** Elimina ruidos de baja frecuencia.
2. **Notch (50Hz/60Hz):** Elimina zumbidos de línea eléctrica.
3. **Peaking (3kHz, +4dB):** Realza la presencia de la voz.
4. **Low-pass (7000Hz):** Elimina el siseo de alta frecuencia.
5. **Dynamics Compressor:**
   - Threshold: -32dB
   - Ratio: 15
   - Attack: 0.002s
6. **Noise Gate:** Implementado vía `WaveShaperNode` con umbral de amplitud de `0.015`.

---

## 4. IA: Motores y Prompts

### A. Refinamiento de Texto (Limpieza Profunda)
**Lógica:** Procesa el texto original + timestamps para generar un texto fluido sin perder sincronización.

| Modo | Prompt Funcional |
| :--- | :--- |
| **Standard** | Elimina muletillas y repeticiones. Mantiene sentido original fluido. |
| **Ultra-Clean** | Filtro de IA agresivo. Reconstruye oraciones para calidad profesional. |
| **Formal** | Reescribe con lenguaje académico y preciso. |
| **Email** | Convierte el audio en un correo estructurado con saludo/despedida. |

### B. Módulo de Resumen (IA Summarization)
- **Prompt:** Genera resumen ejecutivo y lista de puntos clave (`keyPoints`) en formato JSON.
- **Prompt de Mejora (Iterativo):** Analiza el resumen vs. el texto crudo para detectar omisiones sutiles y proponer una versión enriquecida.

---

## 5. Diseño e Interface
- **Estética:** Minimalista "Polaca" (sombras suaves, bordes muy redondeados `rounded-[2.5rem]`).
- **Navegación:** Soporte para gestos móviles y teclado en Modo Presentación.
- **Interactividad:** Sincronización palabra-audio (clic en palabra -> saltar en tiempo real).

---

## 6. Persistencia e Integración
- **Local:** `localStorage` y `IndexDB` para audio crudo.
- **Nube:** Integración OAuth con Google Drive para exportación de archivos `.wav`, `.txt` y `.pdf`.
- **Exportación:** Soporte nativo para TXT, PDF y Markdown (.md).

---

## 7. Plan de Crecimiento (Roadmap)

### Fase 1: Migración a Backend
- Sustituir `localStorage` por **PostgreSQL (vía Node.js/Prisma/Supabase)**.
- Manejo de sesiones de usuario persistentes.

### Fase 2: Monetización
- Implementar **Stripe** para suscripciones.
- Sistema de créditos basado en minutos de audio procesados.

### Fase 3: Integración Expandida
- Selector de carpetas de Google Drive.
- Importación directa desde servicios de terceros (Slack, WhatsApp, etc.).

---
*Documento generado automáticamente para la continuidad del diseño y desarrollo de Dictafono AI.*
