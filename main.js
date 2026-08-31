import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import multer from 'multer';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { google } from 'googleapis';
import { Readable } from 'stream';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let server;

function startBackend() {
  const expressApp = express();
  const upload = multer({ storage: multer.memoryStorage() });

  expressApp.use(express.json());

  const distPath = path.join(__dirname, 'dist');
  expressApp.use(express.static(distPath));

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://127.0.0.1:3000/api/auth/google/callback'
  );

  expressApp.get("/api/config", (req, res) => {
    const apiKey = req.headers['x-groq-api-key'] || process.env.GROQ_API_KEY;
    const isValidFormat = apiKey && apiKey.startsWith("gsk_");
    res.json({ 
      hasServerApiKey: !!apiKey,
      isApiKeyValidFormat: !!isValidFormat,
      isHardcoded: !process.env.GROQ_API_KEY && !req.headers['x-groq-api-key'],
      hasGoogleConfig: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
    });
  });

  expressApp.get("/api/auth/google/url", (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/documents'
      ],
      prompt: 'consent'
    });
    res.json({ url });
  });

  expressApp.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code);
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'GOOGLE_AUTH_SUCCESS', 
                  tokens: ${JSON.stringify(tokens)} 
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Autenticación exitosa. Esta ventana se cerrará automáticamente.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Google Auth Error:", error);
      res.status(500).send("Error en la autenticación con Google");
    }
  });

  expressApp.post("/api/drive/upload", upload.single("file"), async (req, res) => {
    const tokens = JSON.parse(req.headers['x-google-tokens'] || '{}');
    if (!tokens.access_token) {
      return res.status(401).json({ error: "No autenticado con Google" });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: "Configuración de Google Drive incompleta en el servidor" });
    }

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth });

    try {
      let folderId;
      try {
        const folderSearch = await drive.files.list({
          q: "name = 'EDUC.AI - Dictáfono' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
          fields: 'files(id, name)',
        });
        if (folderSearch.data.files && folderSearch.data.files.length > 0) {
          folderId = folderSearch.data.files[0].id;
        } else {
          const createFolder = await drive.files.create({
            requestBody: {
              name: 'EDUC.AI - Dictáfono',
              mimeType: 'application/vnd.google-apps.folder',
            },
            fields: 'id',
          });
          folderId = createFolder.data.id;
        }
      } catch (fErr) {
        console.warn("Could not create/find EDUC.AI folder:", fErr);
      }

      const fileMetadata = { name: req.body.name || 'grabacion.wav' };
      if (folderId) fileMetadata.parents = [folderId];

      const media = {
        mimeType: req.file.mimetype,
        body: Readable.from(req.file.buffer),
      };

      const file = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, webViewLink',
      });

      res.json({ id: file.data.id, link: file.data.webViewLink, tokens: auth.credentials });
    } catch (error) {
      console.error("Drive Upload Error:", error);
      res.status(500).json({ error: "Error al subir a Google Drive" });
    }
  });

  expressApp.post("/api/docs/create", async (req, res) => {
    const tokens = JSON.parse(req.headers['x-google-tokens'] || '{}');
    if (!tokens.access_token) return res.status(401).json({ error: "No autenticado con Google" });
    const { title, content } = req.body;
    if (!content) return res.status(400).json({ error: "No content provided" });

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: "Configuración de Google incompleta en el servidor" });
    }

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials(tokens);
    const docs = google.docs({ version: 'v1', auth });
    const drive = google.drive({ version: 'v3', auth });

    try {
      const doc = await docs.documents.create({ requestBody: { title: title || 'Transcripción Dictáfono AI' } });
      const docId = doc.data.documentId;
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests: [{ insertText: { location: { index: 1 }, text: content } }] },
      });

      try {
        const folderSearch = await drive.files.list({
          q: "name = 'EDUC.AI - Dictáfono' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
          fields: 'files(id)',
        });
        let folderId;
        if (folderSearch.data.files && folderSearch.data.files.length > 0) {
          folderId = folderSearch.data.files[0].id;
        } else {
          const createFolder = await drive.files.create({
            requestBody: { name: 'EDUC.AI - Dictáfono', mimeType: 'application/vnd.google-apps.folder' },
            fields: 'id',
          });
          folderId = createFolder.data.id;
        }
        if (folderId) {
          const file = await drive.files.get({ fileId: docId, fields: 'parents' });
          const previousParents = (file.data.parents || []).join(',');
          await drive.files.update({
            fileId: docId,
            addParents: folderId,
            removeParents: previousParents,
            fields: 'id, parents',
          });
        }
      } catch (moveErr) {}

      res.json({ id: docId, link: `https://docs.google.com/document/d/${docId}/edit`, tokens: auth.credentials });
    } catch (error) {
      console.error("Docs Create Error:", error);
      res.status(500).json({ error: "Error al crear Google Doc" });
    }
  });

  expressApp.post("/api/transcribe", upload.single("file"), async (req, res) => {
    const apiKey = req.headers['x-groq-api-key'] || process.env.GROQ_API_KEY;
    if (!apiKey || !apiKey.startsWith("gsk_")) {
      return res.status(401).json({ error: "GROQ_API_KEY no configurada o inválida" });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const formData = new FormData();
    formData.append("file", req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
    formData.append("model", "whisper-large-v3");
    formData.append("language", "es");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");
    if (req.body.prompt && typeof req.body.prompt === "string" && req.body.prompt.trim().length > 0) {
      formData.append("prompt", req.body.prompt.trim());
    }

    try {
      const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, ...formData.getHeaders() },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json(data);
      res.json(data);
    } catch (error) {
      console.error("Transcription error:", error);
      res.status(500).json({ error: "Error en la transcripción" });
    }
  });

  expressApp.post("/api/clean", async (req, res) => {
    const apiKey = req.headers['x-groq-api-key'] || process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(401).json({ error: "GROQ_API_KEY no configurada" });

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json(data);
      res.json(data);
    } catch (error) {
      console.error("Clean error:", error);
      res.status(500).json({ error: "Error al limpiar texto" });
    }
  });

  expressApp.get("*", (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  const PORT = 3000;
  return new Promise((resolve) => {
    server = expressApp.listen(PORT, "127.0.0.1", () => {
      console.log(`Backend Express running on http://127.0.0.1:${PORT}`);
      resolve();
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    title: "Dictáfono AI - EDUC.AI",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.loadURL('http://127.0.0.1:3000');

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', async () => {
  await startBackend();
  createWindow();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    if (server) server.close();
    app.quit();
  }
});
