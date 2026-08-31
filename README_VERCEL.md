# Guía de Despliegue en Vercel

Esta aplicación ha sido preparada para ser desplegada en Vercel como una aplicación Full-Stack (Vite + Express).

## Pasos para el Despliegue

1. **Subir a GitHub**:
   - Crea un nuevo repositorio en GitHub.
   - Sube todos los archivos del proyecto (asegúrate de incluir `api/`, `src/`, `vercel.json`, `package.json`, etc.).

2. **Importar en Vercel**:
   - Ve a [Vercel](https://vercel.com) e importa tu repositorio de GitHub.
   - Vercel detectará automáticamente que es un proyecto de Vite.

3. **Configurar Variables de Entorno**:
   En el panel de control de Vercel, ve a **Settings > Environment Variables** y añade las siguientes:

   | Variable | Descripción |
   |----------|-------------|
   | `GROQ_API_KEY` | Tu clave de API de Groq Cloud. |

## Notas Técnicas
- El backend reside en `api/index.ts` y se ejecuta como una **Serverless Function**.
- El frontend se compila con `npm run build` y se sirve estáticamente.
- Las rutas de la API están prefijadas con `/api`.
