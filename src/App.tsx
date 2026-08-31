import React, { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, Copy, Check, Trash2, Settings, Loader2, AlertCircle, Sparkles, Play, Pause, RotateCcw, Key, History, ChevronDown, ChevronUp, ChevronLeft, Calendar, Download, FileText, FileCode, Sun, Moon, Search, Volume2, Wind, Mic2, FileDown, ArrowUpRight, Clock, Bookmark, Activity, Maximize2, X, FileUp, Clipboard, HelpCircle, Monitor, Edit2, Lightbulb } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Toaster, toast } from "sonner";
import { cn } from "./lib/utils";
import { jsPDF } from "jspdf";
import WaveSurfer from "wavesurfer.js";
import Regions from "wavesurfer.js/dist/plugins/regions.esm.js";
import { VoiceRecorder } from "capacitor-voice-recorder";
import { Preferences } from "@capacitor/preferences";

interface Word {
  word: string;
  start: number;
  end: number;
}

interface HistoryItem {
  id: string;
  timestamp: number;
  raw: string;
  clean: string;
  words?: Word[];
  isFavorite?: boolean;
  summary?: string;
  keyPoints?: string[];
}

interface GlossaryItem {
  id: string;
  term: string;
  context: string;
}

interface DoubtfulWord {
  word: string;
  start: number;
  end: number;
  reason?: string;
}

const DEFAULT_GLOSSARY: GlossaryItem[] = [
  { id: '1', term: 'EDUC.AI', context: 'Marca' },
  { id: '2', term: 'Groq', context: 'Tecnología' },
  { id: '3', term: 'Vercel', context: 'Tecnología' },
  { id: '4', term: 'Whisper', context: 'Tecnología' },
  { id: '5', term: 'Vibe Coding', context: 'Metodología' },
];

const REFINEMENT_MODES = [
  { id: 'standard', label: 'Estándar', description: 'Limpieza profesional equilibrada', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'literal', label: 'Literal', description: 'Transcripción palabra por palabra', icon: <FileText className="w-4 h-4" /> },
  { id: 'email', label: 'Email', description: 'Formato de correo electrónico formal', icon: <FileText className="w-4 h-4" /> },
  { id: 'list', label: 'Lista', description: 'Organizado en puntos clave', icon: <Activity className="w-4 h-4" /> },
  { id: 'formal', label: 'Formal', description: 'Lenguaje académico y preciso', icon: <Bookmark className="w-4 h-4" /> },
  { id: 'creative', label: 'Creativo', description: 'Estilo narrativo y fluido', icon: <Wind className="w-4 h-4" /> },
  { id: 'ultra_clean', label: 'Ultra-Limpio (IA)', description: 'Eliminación agresiva de ruido y muletillas', icon: <Wind className="w-4 h-4" /> },
] as const;

const SUPPORTED_LANGUAGES = [
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'Inglés', flag: '🇺🇸' },
  { code: 'fr', label: 'Francés', flag: '🇫🇷' },
  { code: 'pt', label: 'Portugués', flag: '🇵🇹' },
  { code: 'he', label: 'Hebreo', flag: '🇮🇱' },
  { code: 'zh', label: 'Chino Mandarín', flag: '🇨🇳' },
  { code: 'de', label: 'Alemán', flag: '🇩🇪' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'ja', label: 'Japonés', flag: '🇯🇵' },
] as const;

const USAGE_TIPS = [
  { title: "Limpieza de Silencios", text: "Si tienes silencios largos al principio o al final, selecciona la parte con voz y usa 'Mantener selección'." },
  { title: "Corrección de Errores", text: "Si te equivocas al hablar, selecciona el fragmento del error y usa 'Eliminar selección'." },
  { title: "Límite de Tiempo", text: "La transcripción y traducción están optimizadas para audios de hasta 15 minutos." },
  { title: "Idiomas", text: "Soportamos Inglés, Francés, Hebreo, Portugués y Chino Mandarín. La IA traducirá automáticamente al español." },
];

type RefinementMode = typeof REFINEMENT_MODES[number]['id'];

const AUDIO_FORMATS = [
  { 
    id: "webm", 
    mimeType: "audio/webm;codecs=opus", 
    label: "WebM (Opus)", 
    description: "Alta calidad, tamaño pequeño. Estándar en Chrome/Firefox.",
    quality: "Excelente",
    size: "Mínimo"
  },
  { 
    id: "ogg", 
    mimeType: "audio/ogg;codecs=opus", 
    label: "Ogg (Opus)", 
    description: "Excelente compresión y calidad. Estándar abierto.",
    quality: "Excelente",
    size: "Mínimo"
  },
  { 
    id: "mp4", 
    mimeType: "audio/mp4", 
    label: "MP4 (AAC)", 
    description: "Compatibilidad universal, buena calidad. Estándar en Apple.",
    quality: "Muy Buena",
    size: "Medio"
  },
  { 
    id: "aac", 
    mimeType: "audio/aac", 
    label: "AAC", 
    description: "Alta calidad de audio, muy compatible.",
    quality: "Muy Buena",
    size: "Medio"
  },
  { 
    id: "wav", 
    mimeType: "audio/wav", 
    label: "WAV (PCM)", 
    description: "Sin pérdida, máxima calidad. Archivos muy grandes.",
    quality: "Máxima",
    size: "Máximo"
  }
];

const MAX_RECORDING_SECONDS = 900; // 15 minutes

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [rawTranscription, setRawTranscription] = useState(() => localStorage.getItem("whisper_raw_transcription") || "");
  const [cleanTranscription, setCleanTranscription] = useState(() => localStorage.getItem("whisper_clean_transcription") || "");
  const [transcriptionWords, setTranscriptionWords] = useState<Word[]>(() => {
    const saved = localStorage.getItem("whisper_words");
    return saved ? JSON.parse(saved) : [];
  });
  const [error, setError] = useState<string | null>(null);
  const [errorSuggestion, setErrorSuggestion] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem("whisper_history");
    return saved ? JSON.parse(saved) : [];
  });
  const [showHistory, setShowHistory] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem("app_theme") as 'light' | 'dark' | 'system') || "system";
  });

  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    
    const handleChange = () => {
      if (theme === "system") {
        setIsDarkMode(mediaQuery.matches);
      } else {
        setIsDarkMode(theme === "dark");
      }
    };

    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileTab, setMobileTab] = useState<'refined' | 'original' | 'summary'>('refined');
  const [activeView, setActiveView] = useState<'record' | 'history' | 'settings'>('record');

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile) {
      if (activeView === 'settings') {
        setShowSettings(true);
      } else {
        setShowSettings(false);
      }
    }
  }, [activeView, isMobile]);

  const [micGain, setMicGain] = useState(() => Number(localStorage.getItem("mic_gain")) || 1);
  const [noiseSuppression, setNoiseSuppression] = useState(() => localStorage.getItem("noise_suppression") !== "false");
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("sound_enabled") !== "false");
  const [audioFormat, setAudioFormat] = useState(() => localStorage.getItem("audio_format") || "webm");
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => localStorage.getItem("selected_mic_id") || "");
  const [supportedFormats, setSupportedFormats] = useState<typeof AUDIO_FORMATS>([]);
  const [hasServerApiKey, setHasServerApiKey] = useState(true);
  const [isApiKeyHardcoded, setIsApiKeyHardcoded] = useState(false);
  const [isEditingRaw, setIsEditingRaw] = useState(false);
  const [isEditingClean, setIsEditingClean] = useState(true);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [readingTheme, setReadingTheme] = useState<'light' | 'dark' | 'sepia'>('light');
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem("groq_api_key") || "");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem("tutorial_seen"));
  const [tutorialStep, setTutorialStep] = useState(0);
  const [hasDetectedSpeech, setHasDetectedSpeech] = useState(false);
  const [silenceDuration, setSilenceDuration] = useState(0);
  const [showSilenceWarning, setShowSilenceWarning] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [autoParagraph, setAutoParagraph] = useState(() => localStorage.getItem("auto_paragraph") === "true");
  const [autoDenoise, setAutoDenoise] = useState(() => localStorage.getItem("auto_denoise") === "true");
  const [autoSummarize, setAutoSummarize] = useState(() => localStorage.getItem("auto_summarize") === "true");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showProcessConfirm, setShowProcessConfirm] = useState(false);
  const [isRawEdited, setIsRawEdited] = useState(false);
  const [isCleanEdited, setIsCleanEdited] = useState(false);
  const [showHistoryClearConfirm, setShowHistoryClearConfirm] = useState(false);
  const [showDiscardSummaryConfirm, setShowDiscardSummaryConfirm] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isDraftRecovered, setIsDraftRecovered] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [isEditingAudio, setIsEditingAudio] = useState(false);
  const [activeRegion, setActiveRegion] = useState<{ start: number; end: number } | null>(null);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [isDenoising, setIsDenoising] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [refinementMode, setRefinementMode] = useState<RefinementMode>(() => (localStorage.getItem("refinement_mode") as RefinementMode) || "standard");
  const [summary, setSummary] = useState("");
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isSuggestingImprovements, setIsSuggestingImprovements] = useState(false);
  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
  const [tempSummary, setTempSummary] = useState("");
  const [tempKeyPoints, setTempKeyPoints] = useState("");
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const sourceLanguage = "es";
  const [showAuthorModal, setShowAuthorModal] = useState(false);
  const [googleTokens, setGoogleTokens] = useState<any>(() => {
    const saved = localStorage.getItem("google_tokens");
    return saved ? JSON.parse(saved) : null;
  });
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [hasGoogleConfig, setHasGoogleConfig] = useState(false);

  // --- GLOSSARY & VALIDATION STATES ---
  const [glossary, setGlossary] = useState<GlossaryItem[]>(() => {
    const saved = localStorage.getItem("whisper_glossary");
    return saved ? JSON.parse(saved) : DEFAULT_GLOSSARY;
  });

  useEffect(() => {
    localStorage.setItem("whisper_glossary", JSON.stringify(glossary));
  }, [glossary]);

  const [selectedContextTag, setSelectedContextTag] = useState<string>("todos");
  const [validationMode, setValidationMode] = useState<'realtime' | 'final'>(() => {
    return (localStorage.getItem("validation_mode") as 'realtime' | 'final') || "final";
  });
  const [doubtfulWords, setDoubtfulWords] = useState<DoubtfulWord[]>([]);
  const [selectedDoubtfulWord, setSelectedDoubtfulWord] = useState<DoubtfulWord | null>(null);
  const [showGlossaryModal, setShowGlossaryModal] = useState(false);
  const [newGlossaryTerm, setNewGlossaryTerm] = useState("");
  const [newGlossaryContext, setNewGlossaryContext] = useState("General");

  const getGlossaryPrompt = () => {
    let terms = glossary;
    if (selectedContextTag !== "todos") {
      terms = glossary.filter(g => g.context.toLowerCase() === selectedContextTag.toLowerCase());
    }
    if (terms.length === 0) return "";
    return terms.map(t => t.term).join(", ");
  };

  const addToGlossary = (term: string, context = "General") => {
    if (!term || !term.trim()) return;
    const cleanTerm = term.trim();
    if (glossary.some(g => g.term.toLowerCase() === cleanTerm.toLowerCase())) {
      toast.info(`"${cleanTerm}" ya está en el glosario`);
      return;
    }
    const newItem: GlossaryItem = {
      id: crypto.randomUUID(),
      term: cleanTerm,
      context: context.trim() || "General",
    };
    setGlossary(prev => [...prev, newItem]);
    toast.success(`"${cleanTerm}" agregado al Glosario`);
  };

  const removeFromGlossary = (id: string) => {
    setGlossary(prev => prev.filter(g => g.id !== id));
    toast.success("Término eliminado del Glosario");
  };

  const exportToGoogleDocs = async () => {
    if (!googleTokens) {
      handleGoogleLogin();
      return;
    }
    const textToExport = cleanTranscription || rawTranscription;
    if (!textToExport) {
      toast.error("No hay transcripción para exportar");
      return;
    }

    setIsUploadingToDrive(true);
    try {
      const response = await fetch("/api/docs/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-google-tokens": JSON.stringify(googleTokens),
        },
        body: JSON.stringify({
          title: `Transcripción Dictáfono AI - ${new Date().toLocaleDateString()}`,
          content: textToExport,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setGoogleTokens(null);
          localStorage.removeItem("google_tokens");
          toast.error("Sesión de Google expirada. Vuelve a conectar.");
          return;
        }
        throw new Error("Error al crear el documento");
      }

      const data = await response.json();
      if (data.tokens) {
        setGoogleTokens(data.tokens);
        localStorage.setItem("google_tokens", JSON.stringify(data.tokens));
      }

      toast.success("Documento creado en Google Docs", {
        description: "Guardado dentro de la carpeta 'EDUC.AI - Dictáfono'",
        action: {
          label: "Abrir Doc",
          onClick: () => window.open(data.link, "_blank"),
        },
        duration: 8000,
      });
    } catch (err) {
      console.error("Docs export error:", err);
      toast.error("Error al exportar a Google Docs");
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  const [isSaving, setIsSaving] = useState(false);
  const [showSavedStatus, setShowSavedStatus] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const isFirstRenderRef = useRef(true);
  const saveStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<{ raw: string; clean: string; words: Word[] }>({
    raw: "",
    clean: "",
    words: []
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<any>(null);
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const presentationRef = useRef<HTMLDivElement>(null);

  const playFeedbackSound = useCallback((type: 'copy' | 'save' | 'delete' | 'click') => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === 'copy') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'save') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'delete') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.15);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      }

      setTimeout(() => ctx.close(), 500);
    } catch (e) {
      console.error("Error playing feedback sound:", e);
    }
  }, [soundEnabled]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPresentationMode) {
        setIsPresentationMode(false);
      }
      
      if (isPresentationMode && presentationRef.current) {
        const scrollAmount = 300;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ') {
          e.preventDefault();
          presentationRef.current.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          presentationRef.current.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
        }
        return;
      }

      // Quick Record Shortcut: Space or 'g' when not inside an input/textarea
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (!isInput && (e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (isRecording) {
          stopRecording();
        } else if (audioUrl && !isTranscribing && !isCleaning) {
          startTranscription();
        } else if (!isRecording && !audioUrl) {
          startRecording();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPresentationMode, isRecording, audioUrl, isTranscribing, isCleaning, stopRecording, startTranscription, startRecording]);

  useEffect(() => {
    if (isPresentationMode) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isPresentationMode]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [cleanTranscription]);

  // Check for recovered draft on mount
  useEffect(() => {
    const hasRaw = localStorage.getItem("whisper_raw_transcription");
    const hasClean = localStorage.getItem("whisper_clean_transcription");
    if (hasRaw || hasClean) {
      setIsDraftRecovered(true);
      toast.info("Borrador recuperado automáticamente", {
        description: "Hemos restaurado tu última sesión de trabajo.",
        duration: 5000,
      });
    }
  }, []);

  // Check for summary edit draft on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem("summary_edit_draft");
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (draft.id && (draft.summary || draft.keyPoints)) {
          toast("Borrador de resumen encontrado", {
            description: "¿Deseas recuperar los cambios no guardados en el historial?",
            action: {
              label: "Recuperar",
              onClick: () => {
                setEditingSummaryId(draft.id);
                setTempSummary(draft.summary);
                setTempKeyPoints(draft.keyPoints);
                setActiveView('history');
                setExpandedItems(prev => new Set(prev).add(draft.id));
                toast.success("Borrador de resumen recuperado");
              }
            },
            cancel: {
              label: "Descartar",
              onClick: () => {
                localStorage.removeItem("summary_edit_draft");
              }
            },
            duration: 10000,
          });
        }
      } catch (e) {
        console.error("Error parsing summary draft", e);
      }
    }
  }, []);

  // Auto-save summary edit draft
  useEffect(() => {
    if (editingSummaryId) {
      localStorage.setItem("summary_edit_draft", JSON.stringify({
        id: editingSummaryId,
        summary: tempSummary,
        keyPoints: tempKeyPoints
      }));
    } else {
      localStorage.removeItem("summary_edit_draft");
    }
  }, [editingSummaryId, tempSummary, tempKeyPoints]);

  useEffect(() => {
    if (autoParagraph && cleanTranscription) {
      const formatted = formatParagraphs(cleanTranscription);
      if (formatted !== cleanTranscription) {
        setCleanTranscription(formatted);
      }
    }
  }, [autoParagraph]);

  useEffect(() => {
    if (regionsRef.current) {
      if (isEditingAudio) {
        regionsRef.current.enableDragSelection({
          color: 'rgba(249, 115, 22, 0.2)',
        });
      } else {
        regionsRef.current.clearRegions();
      }
    }
  }, [isEditingAudio]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!audioUrl || !waveformContainerRef.current) return;

    setIsAudioLoading(true);
    
    const ws = WaveSurfer.create({
      container: waveformContainerRef.current,
      waveColor: isDarkMode ? "#404040" : "#d4d4d4",
      progressColor: "#f97316",
      cursorColor: "#f97316",
      barWidth: 2,
      barRadius: 3,
      height: 60,
      normalize: true,
    });

    const regions = ws.registerPlugin(Regions.create());
    regionsRef.current = regions;

    ws.load(audioUrl);

    ws.on("ready", () => {
      setDuration(ws.getDuration());
      setIsAudioLoading(false);
    });

    ws.on("audioprocess", () => {
      setCurrentTime(ws.getCurrentTime());
    });

    ws.on("finish", () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));

    regions.on('region-updated', (region) => {
      setActiveRegion({ start: region.start, end: region.end });
    });

    regions.on('region-created', (region) => {
      regions.getRegions().forEach(r => {
        if (r !== region) r.remove();
      });
      setActiveRegion({ start: region.start, end: region.end });
    });

    wavesurferRef.current = ws;

    return () => {
      ws.destroy();
    };
  }, [audioUrl, isDarkMode]);

  const processAudioAction = async (action: 'trim' | 'delete') => {
    if (!wavesurferRef.current || !activeRegion || !audioBlob) return;

    setIsProcessingAudio(true);
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const { start, end } = activeRegion;
      const sampleRate = audioBuffer.sampleRate;
      const startSample = Math.floor(start * sampleRate);
      const endSample = Math.floor(end * sampleRate);

      let newBuffer: AudioBuffer;

      if (action === 'trim') {
        const duration = end - start;
        const length = Math.floor(duration * sampleRate);
        newBuffer = audioContext.createBuffer(
          audioBuffer.numberOfChannels,
          length,
          sampleRate
        );

        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
          const channelData = audioBuffer.getChannelData(i);
          const newChannelData = newBuffer.getChannelData(i);
          newChannelData.set(channelData.subarray(startSample, endSample));
        }
      } else {
        // delete
        const duration = audioBuffer.duration - (end - start);
        const length = Math.floor(duration * sampleRate);
        newBuffer = audioContext.createBuffer(
          audioBuffer.numberOfChannels,
          length,
          sampleRate
        );

        for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
          const channelData = audioBuffer.getChannelData(i);
          const newChannelData = newBuffer.getChannelData(i);
          newChannelData.set(channelData.subarray(0, startSample));
          newChannelData.set(channelData.subarray(endSample), startSample);
        }
      }

      const editedBlob = await audioBufferToWavBlob(newBuffer);
      const editedUrl = URL.createObjectURL(editedBlob);

      setAudioBlob(editedBlob);
      setAudioUrl(editedUrl);
      setActiveRegion(null);
      setIsEditingAudio(false);
      toast.success(action === 'trim' ? "Audio recortado" : "Sección eliminada");
    } catch (err) {
      console.error("Error processing audio:", err);
      toast.error("Error al procesar el audio");
    } finally {
      setIsProcessingAudio(false);
    }
  };

  // Update lastSavedRef whenever state changes
  useEffect(() => {
    lastSavedRef.current = {
      raw: rawTranscription,
      clean: cleanTranscription,
      words: transcriptionWords
    };
  }, [rawTranscription, cleanTranscription, transcriptionWords]);

  // Debounced auto-save current work (after 1 second of inactivity)
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    const performSave = () => {
      localStorage.setItem("whisper_raw_transcription", rawTranscription);
      localStorage.setItem("whisper_clean_transcription", cleanTranscription);
      localStorage.setItem("whisper_words", JSON.stringify(transcriptionWords));
      setIsSaving(false);
      setLastSaved(Date.now());
      setShowSavedStatus(true);
      
      if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);
      saveStatusTimeoutRef.current = setTimeout(() => {
        setShowSavedStatus(false);
        saveStatusTimeoutRef.current = null;
      }, 3000);
    };

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (saveStatusTimeoutRef.current) {
      clearTimeout(saveStatusTimeoutRef.current);
      setShowSavedStatus(false);
    }
    
    setIsSaving(true);
    saveTimeoutRef.current = setTimeout(performSave, 1500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);
    };
  }, [rawTranscription, cleanTranscription, transcriptionWords]);

  // Periodic save every 60 seconds as a backup
  useEffect(() => {
    const periodicSave = setInterval(() => {
      const { raw, clean, words } = lastSavedRef.current;
      localStorage.setItem("whisper_raw_transcription", raw);
      localStorage.setItem("whisper_clean_transcription", clean);
      localStorage.setItem("whisper_words", JSON.stringify(words));
      setLastSaved(Date.now());
      // We don't show the "Saved" status for periodic background saves to avoid distraction
    }, 60000);

    return () => clearInterval(periodicSave);
  }, []);

  const fetchWithRetry = async (url: string, options: RequestInit = {}, maxRetries = 3, initialDelay = 1000) => {
    let attempt = 0;
    
    // Sanitize headers to ensure they only contain ISO-8859-1 characters
    // This avoids the "Failed to construct 'Request': String contains non ISO-8859-1 code point" error
    const sanitizeHeaderValue = (value: string): string => {
      // Remove any character that is not in the ISO-8859-1 range (0-255)
      return value.replace(/[^\x00-\xFF]/g, "");
    };

    const headers = new Headers(options.headers || {});
    
    // Sanitize all existing headers
    const sanitizedHeaders: Record<string, string> = {};
    headers.forEach((value, key) => {
      sanitizedHeaders[key] = sanitizeHeaderValue(value);
    });
    
    // Add and sanitize API key if present
    if (userApiKey) {
      sanitizedHeaders["x-groq-api-key"] = sanitizeHeaderValue(userApiKey);
    }

    const finalOptions = { 
      ...options, 
      headers: sanitizedHeaders, 
      credentials: options.credentials || 'include' as RequestCredentials 
    };

    while (attempt < maxRetries) {
      try {
        const response = await fetch(url, finalOptions);
        if (response.ok) return response;
        
        // Retry on 429 (Rate Limit) or 5xx (Server Error)
        if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
          attempt++;
          if (attempt >= maxRetries) return response;
          const delay = initialDelay * Math.pow(2, attempt - 1);
          console.log(`API error ${response.status}, retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return response;
      } catch (err: any) {
        attempt++;
        if (attempt >= maxRetries) throw err;
        const delay = initialDelay * Math.pow(2, attempt - 1);
        console.log(`Network error, retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error("Max retries reached");
  };

  useEffect(() => {
    const getDevices = async (requestPermission = false) => {
      try {
        // Try to enumerate first
        let devices = await navigator.mediaDevices.enumerateDevices();
        
        // Check if we have labels. If not, and we are allowed to request, do it.
        const hasLabels = devices.some(device => device.label);
        
        if (!hasLabels && requestPermission) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Stop the stream immediately, we only wanted the permission for labels
            stream.getTracks().forEach(track => track.stop());
            devices = await navigator.mediaDevices.enumerateDevices();
          } catch (pErr: any) {
            if (pErr.name === 'NotAllowedError' || pErr.name === 'PermissionDeniedError') {
              console.warn("Microphone permission denied. Device labels will not be available.");
            } else {
              console.error("Error requesting microphone permission for labels:", pErr);
            }
          }
        }

        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        setAvailableDevices(audioInputs);
        
        // If no device selected or selected device no longer exists, pick default
        if (!selectedDeviceId || !audioInputs.find(d => d.deviceId === selectedDeviceId)) {
          if (audioInputs.length > 0) {
            // Prefer 'default' if it exists, otherwise first one
            const defaultDevice = audioInputs.find(d => d.deviceId === 'default') || audioInputs[0];
            setSelectedDeviceId(defaultDevice.deviceId);
          }
        }
      } catch (err) {
        console.error("Error listing devices:", err);
      }
    };

    // Initial check without forcing permission prompt on mount (to avoid intrusive popups)
    getDevices(false);
    
    // Listen for device changes
    const handleDeviceChange = () => getDevices(false);
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    
    // We can also expose a way to "Unlock Labels" in the UI if needed
    (window as any).refreshAudioDevices = () => getDevices(true);

    return () => navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
  }, [selectedDeviceId]);

  useEffect(() => {
    localStorage.setItem("selected_mic_id", selectedDeviceId);
  }, [selectedDeviceId]);

  useEffect(() => {
    localStorage.setItem("whisper_history", JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    let testInterval: NodeJS.Timeout | null = null;
    let testStream: MediaStream | null = null;
    let testAudioContext: AudioContext | null = null;

    const stopTest = () => {
      if (testInterval) clearInterval(testInterval);
      if (testStream) testStream.getTracks().forEach(t => t.stop());
      if (testAudioContext) testAudioContext.close();
      setAudioLevel(0);
    };

    if (isTestingMic) {
      const startTest = async () => {
        try {
          testStream = await navigator.mediaDevices.getUserMedia({ 
            audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true 
          });
          testAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const source = testAudioContext.createMediaStreamSource(testStream);
          const analyser = testAudioContext.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          
          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          
          testInterval = setInterval(() => {
            analyser.getByteFrequencyData(dataArray);
            let max = 0;
            for (let i = 0; i < bufferLength; i++) {
              if (dataArray[i] > max) max = dataArray[i];
            }
            setAudioLevel(max);
          }, 100);
        } catch (err) {
          console.error("Mic test error:", err);
          setIsTestingMic(false);
          toast.error("Error al probar el micrófono", {
            description: "Asegúrate de haber concedido los permisos necesarios."
          });
        }
      };
      startTest();
    } else {
      stopTest();
    }

    return stopTest;
  }, [isTestingMic]);

  useEffect(() => {
    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.pause();
      }
      if (vadIntervalRef.current) {
        clearInterval(vadIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("sound_enabled", JSON.stringify(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem("app_theme", theme);
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme, isDarkMode]);

  useEffect(() => {
    localStorage.setItem("mic_gain", micGain.toString());
  }, [micGain]);

  useEffect(() => {
    localStorage.setItem("auto_paragraph", autoParagraph.toString());
  }, [autoParagraph]);

  useEffect(() => {
    localStorage.setItem("auto_denoise", autoDenoise.toString());
  }, [autoDenoise]);

  useEffect(() => {
    localStorage.setItem("auto_summarize", autoSummarize.toString());
  }, [autoSummarize]);

  useEffect(() => {
    localStorage.setItem("audio_format", audioFormat);
  }, [audioFormat]);

  useEffect(() => {
    if (typeof MediaRecorder !== 'undefined') {
      const supported = AUDIO_FORMATS.filter(f => MediaRecorder.isTypeSupported(f.mimeType));
      setSupportedFormats(supported);
      
      const savedFormat = localStorage.getItem("audio_format");
      if (savedFormat && supported.some(f => f.id === savedFormat)) {
        setAudioFormat(savedFormat);
      } else if (supported.length > 0) {
        const defaultFormat = supported.find(f => f.id === "webm") || supported[0];
        setAudioFormat(defaultFormat.id);
      }
    }
  }, []);

  const checkConfig = async () => {
    try {
      const response = await fetchWithRetry("/api/config");
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        if (text.includes("<title>Cookie check</title>") || text.includes("Action required to load your app")) {
          console.warn("Cookie check detected in checkConfig");
        }
        return;
      }

      const data = await response.json();
      setHasServerApiKey(data.hasServerApiKey);
      setIsApiKeyHardcoded(data.isHardcoded);
      setHasGoogleConfig(data.hasGoogleConfig);
    } catch (err) {
      console.error("Error checking config:", err);
    }
  };

  // Listen for Google Auth message
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        const tokens = event.data.tokens;
        setGoogleTokens(tokens);
        localStorage.setItem("google_tokens", JSON.stringify(tokens));
        toast.success("Conectado con Google Drive");
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
      const { url } = await response.json();
      window.open(url, 'google_auth', 'width=600,height=700');
    } catch (err) {
      console.error("Error getting auth URL:", err);
      toast.error("Error al iniciar sesión con Google");
    }
  };

  const handleGoogleLogout = () => {
    setGoogleTokens(null);
    localStorage.removeItem("google_tokens");
    toast.success("Desconectado de Google Drive");
  };

  const uploadToDrive = async () => {
    if (!audioBlob || !googleTokens) return;

    setIsUploadingToDrive(true);
    const formData = new FormData();
    formData.append("file", audioBlob, audioFileName || "grabacion.wav");
    formData.append("name", audioFileName || "grabacion.wav");

    try {
      const response = await fetch("/api/drive/upload", {
        method: "POST",
        headers: {
          'x-google-tokens': JSON.stringify(googleTokens)
        },
        body: formData
      });

      if (!response.ok) {
        if (response.status === 401) {
          setGoogleTokens(null);
          localStorage.removeItem("google_tokens");
          toast.error("Sesión de Google expirada. Por favor, vuelve a conectar.");
          return;
        }
        throw new Error("Upload failed");
      }

      const data = await response.json();
      
      // Update tokens if they were refreshed
      if (data.tokens) {
        setGoogleTokens(data.tokens);
        localStorage.setItem("google_tokens", JSON.stringify(data.tokens));
      }

      toast.success("Archivo guardado en Google Drive", {
        description: "Puedes verlo en tu unidad de Drive.",
        action: {
          label: "Ver en Drive",
          onClick: () => window.open(data.link, '_blank')
        }
      });
    } catch (err) {
      console.error("Drive upload error:", err);
      toast.error("Error al subir a Google Drive");
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  useEffect(() => {
    localStorage.setItem("groq_api_key", userApiKey);
    checkConfig();
  }, [userApiKey]);

  useEffect(() => {
    checkConfig();
  }, []);

  const startRecording = async () => {
    playFeedbackSound('click');
    setError(null);
    setRawTranscription("");
    setCleanTranscription("");
    setTranscriptionWords([]);
    setCurrentTime(0);
    setShowComparison(false);
    setHasDetectedSpeech(false);
    setSilenceDuration(0);
    setShowSilenceWarning(false);
    setRecordingDuration(0);
    try {
      // Initialize AudioContext early to ensure it's ready and resumed
      if (audioContextRef.current && (audioContextRef.current.state === 'closed' || audioContextRef.current.state === 'suspended')) {
        try {
          await audioContextRef.current.close();
        } catch (e) {}
        audioContextRef.current = null;
      }
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          noiseSuppression: noiseSuppression,
          echoCancellation: true,
          autoGainControl: true
        } 
      });

      const activeTrack = stream.getAudioTracks()[0];
      console.log(`Grabando con dispositivo: ${activeTrack.label} (${activeTrack.id})`);
      console.log(`Configuración: ${JSON.stringify(activeTrack.getSettings())}`);
      console.log(`AudioContext state: ${audioContext.state}, sampleRate: ${audioContext.sampleRate}`);

      let recordingStream = stream;

      // VAD setup
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);

      // Apply gain if needed
      if (micGain !== 1) {
        const gainNode = audioContext.createGain();
        gainNode.gain.value = micGain;
        const destination = audioContext.createMediaStreamDestination();
        
        source.connect(gainNode);
        gainNode.connect(destination);
        gainNode.connect(analyser); // Connect gain node to analyser for VAD
        recordingStream = destination.stream;
      } else {
        source.connect(analyser);
      }

      const selectedFormat = AUDIO_FORMATS.find(f => f.id === audioFormat) || AUDIO_FORMATS[0];
      const mediaRecorder = new MediaRecorder(recordingStream, {
        mimeType: MediaRecorder.isTypeSupported(selectedFormat.mimeType) ? selectedFormat.mimeType : undefined
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      let speechDetected = false;
      let silentSeconds = 0;

      vadIntervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        let max = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
          if (dataArray[i] > max) max = dataArray[i];
        }
        const average = sum / bufferLength;
        
        // Update audio level for UI feedback
        setAudioLevel(max);
        
        // Even more sensitive threshold for speech detection
        // average > 2 or max > 15 is very sensitive
        if (average > 2 || max > 15) {
          if (!speechDetected) {
            speechDetected = true;
            setHasDetectedSpeech(true);
            setShowSilenceWarning(false);
          }
          silentSeconds = 0;
        } else {
          silentSeconds += 0.2;
          if (!speechDetected && silentSeconds >= 5) {
            setShowSilenceWarning(true);
          }
        }
      }, 200);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
        if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
        setAudioLevel(0);
        
        if (audioChunksRef.current.length === 0) {
          toast.error("Error de grabación", {
            description: "No se capturaron datos de audio. Por favor, verifica los permisos del micrófono."
          });
          setIsRecording(false);
          return;
        }

        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        
        if (blob.size < 100) { // Very small blob usually means empty recording
          toast.error("Grabación vacía", {
            description: "La grabación parece estar vacía. Intenta hablar más cerca del micrófono o aumentar la ganancia."
          });
          setIsRecording(false);
          return;
        }

        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setAudioFileName(`Grabación ${new Date().toLocaleTimeString()}`);
        
        // Cleanup
        stream.getTracks().forEach(track => track.stop());
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      // Start recording timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= MAX_RECORDING_SECONDS - 1) {
            // Stop recording when limit reached
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
              mediaRecorderRef.current.stop();
              setIsRecording(false);
              if (recordingIntervalRef.current) {
                clearInterval(recordingIntervalRef.current);
                recordingIntervalRef.current = null;
              }
              toast.error("Límite de tiempo alcanzado", {
                description: "La grabación se detuvo automáticamente al alcanzar los 15 minutos (límite máximo).",
                duration: 8000,
              });
            }
            return MAX_RECORDING_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error("Error accessing microphone:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError("Permiso denegado para el micrófono. Por favor, habilita el acceso al micrófono en la configuración de tu navegador para este sitio.");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError("No se encontró ningún micrófono conectado. Por favor, conecta uno e inténtalo de nuevo.");
      } else {
        setError(`Error al acceder al micrófono: ${err.message || "Verifica los permisos."}`);
      }
    }
  };

  const stopRecording = () => {
    playFeedbackSound('click');
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };

  const activeWordRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (activeWordRef.current && isPlaying) {
      activeWordRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentTime, isPlaying]);

  const togglePlayback = () => {
    if (!wavesurferRef.current) return;
    
    if (isPlaying) {
      wavesurferRef.current.pause();
    } else {
      wavesurferRef.current.play();
    }
  };

  const handleSeek = (time: number) => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setTime(time);
      setCurrentTime(time);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const parseTimestamp = (ts: string) => {
    const match = ts.match(/\[(\d+):(\d+)\]/);
    if (!match) return 0;
    const [_, min, sec] = match;
    return parseInt(min) * 60 + parseInt(sec);
  };

  const insertTimestamp = () => {
    const timestamp = `[${formatTime(currentTime)}]`;
    
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const newText = cleanTranscription.substring(0, start) + timestamp + cleanTranscription.substring(end);
      setCleanTranscription(newText);
      
      // Restore focus and cursor position after state update
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(start + timestamp.length, start + timestamp.length);
        }
      }, 0);
    } else {
      // If not in edit mode or textarea not available, append to the end
      const prefix = cleanTranscription && !cleanTranscription.endsWith('\n') ? '\n' : '';
      setCleanTranscription(prev => prev + prefix + timestamp + ' ');
      setIsEditingClean(true);
    }
    
    toast.success(`Marcador añadido en ${formatTime(currentTime)}`);
  };

  const renderTextWithMarkers = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\[\d+:\d+\])/g);
    return parts.map((part, i) => {
      if (part.match(/\[\d+:\d+\]/)) {
        const time = parseTimestamp(part);
        return (
          <button
            key={i}
            onClick={() => {
              if (wavesurferRef.current) {
                wavesurferRef.current.setTime(time);
                if (!isPlaying) {
                  wavesurferRef.current.play();
                }
              }
            }}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-sm font-bold hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors group/marker"
            title={`Saltar a ${part}`}
          >
            <Play className="w-2.5 h-2.5 fill-current group-hover/marker:scale-110 transition-transform" />
            {part}
          </button>
        );
      }
      return part;
    });
  };

  const renderInteractiveWords = (words: Word[], text: string, isSmall = false) => {
    if (words.length === 0) return text;
    
    return words.map((w, i) => {
      const isActive = currentTime >= w.start && currentTime <= w.end;
      return (
        <motion.span
          key={i}
          ref={isActive ? activeWordRef : null}
          initial={false}
          animate={isActive ? {
            scale: 1.12,
            y: -1,
            boxShadow: "0 10px 15px -3px rgba(249, 115, 22, 0.3), 0 4px 6px -4px rgba(249, 115, 22, 0.3)",
          } : {
            scale: 1,
            y: 0,
            boxShadow: "0 0px 0px rgba(0, 0, 0, 0)",
          }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 25
          }}
          className={cn(
            "rounded px-1 cursor-pointer inline-block relative",
            isActive 
              ? "bg-blue-500 text-white font-bold z-10 ring-2 ring-blue-500/20" 
              : "hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200"
          )}
          onClick={() => {
            if (wavesurferRef.current) {
              wavesurferRef.current.setTime(w.start);
              if (!isPlaying) wavesurferRef.current.play();
            }
          }}
        >
          {w.word}{" "}
        </motion.span>
      );
    });
  };

  const startTranscription = async (force = false) => {
    playFeedbackSound('click');
    
    if (!force && (isRawEdited || isCleanEdited || rawTranscription || cleanTranscription)) {
      setShowProcessConfirm(true);
      return;
    }

    setShowProcessConfirm(false);
    if (audioBlob) {
      await transcribeAudio(audioBlob);
      setIsRawEdited(false);
      setIsCleanEdited(false);
    }
  };

  const discardRecording = () => {
    playFeedbackSound('delete');
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setAudioBlob(null);
    setAudioFileName(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setHasDetectedSpeech(false);
    setShowSilenceWarning(false);
    setIsEditingAudio(false);
    setActiveRegion(null);
    if (wavesurferRef.current) {
      wavesurferRef.current.pause();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      toast.error("Formato no válido", {
        description: "Por favor, selecciona un archivo de audio válido."
      });
      return;
    }

    // Reset current state
    discardRecording();
    setRawTranscription("");
    setCleanTranscription("");
    setTranscriptionWords([]);
    setCurrentTime(0);
    setShowComparison(false);
    setHasDetectedSpeech(true); // Assume speech for uploaded files
    setShowSilenceWarning(false);

    const url = URL.createObjectURL(file);
    setAudioBlob(file);
    setAudioUrl(url);
    setAudioFileName(file.name);
    
    toast.success("Archivo cargado", {
      description: `${file.name} listo para procesar.`
    });

    // Reset input value to allow re-uploading the same file
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      toast.error("Formato no válido", {
        description: "Por favor, suelta un archivo de audio válido."
      });
      return;
    }

    // Reset current state
    discardRecording();
    setRawTranscription("");
    setCleanTranscription("");
    setTranscriptionWords([]);
    setCurrentTime(0);
    setShowComparison(false);
    setHasDetectedSpeech(true);

    const url = URL.createObjectURL(file);
    setAudioBlob(file);
    setAudioUrl(url);
    setAudioFileName(file.name);
    
    toast.success("Archivo cargado", {
      description: `${file.name} listo para procesar.`
    });
  };

  const saveToHistory = () => {
    if (!rawTranscription && !cleanTranscription) return;
    
    playFeedbackSound('save');
    const newItem: HistoryItem = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      raw: rawTranscription,
      clean: cleanTranscription,
      words: transcriptionWords,
      summary,
      keyPoints,
    };
    setHistory(prev => [newItem, ...prev]);
    toast.success("Versión guardada en el historial");
  };

  const saveEditedSummary = (id: string) => {
    const updatedKeyPoints = tempKeyPoints
      .split("\n")
      .map(p => p.trim())
      .filter(p => p.length > 0);

    setHistory(prev => prev.map(item => 
      item.id === id 
        ? { ...item, summary: tempSummary, keyPoints: updatedKeyPoints } 
        : item
    ));

    // If it's the current item being viewed in the main editor, update the main state too
    if (summary && keyPoints.length > 0) {
      // Simple heuristic: if the summary matches or text matches
      // But better to just check if the ID is the one we just loaded if we had a state for that.
      // For now, let's just update if the summary matches the one in state
      const item = history.find(h => h.id === id);
      if (item && item.summary === summary) {
        setSummary(tempSummary);
        setKeyPoints(updatedKeyPoints);
      }
    }

    setEditingSummaryId(null);
    toast.success("Resumen actualizado");
  };

  const handleCancelSummaryEdit = (id: string) => {
    const item = history.find(h => h.id === id);
    if (!item) {
      setEditingSummaryId(null);
      return;
    }

    const hasChanges = tempSummary !== (item.summary || "") || 
                      tempKeyPoints !== (item.keyPoints || []).join("\n");

    if (hasChanges) {
      setShowDiscardSummaryConfirm(true);
    } else {
      setEditingSummaryId(null);
    }
  };

  const getEnhancedErrorInfo = (err: any): { message: string; suggestion: string | null } => {
    const message = err.message || String(err);
    
    if (message.includes("401") || message.includes("API Key") || message.includes("invalid_api_key")) {
      return {
        message: "Error de autenticación: La API Key de Groq es inválida o ha expirado.",
        suggestion: "Por favor, ve a la configuración (icono de engranaje) y asegúrate de que tu API Key sea correcta. Si eres el administrador, revisa las variables de entorno."
      };
    }
    
    if (message.includes("429") || message.includes("Rate limit") || message.includes("rate_limit_exceeded")) {
      return {
        message: "Límite de velocidad excedido: Has realizado demasiadas solicitudes en poco tiempo.",
        suggestion: "Espera unos segundos antes de intentar de nuevo. Si el problema persiste, considera usar un modelo más ligero o revisar los límites de tu cuenta de Groq."
      };
    }
    
    if (err.name === 'TypeError' && message.includes('Failed to fetch')) {
      return {
        message: "Error de conexión: No se pudo contactar con el servidor.",
        suggestion: "Verifica tu conexión a internet. Si estás usando una VPN o proxy, intenta desactivarlos. También asegúrate de que el servidor esté en línea."
      };
    }
    
    if (message.includes("Cookie check") || message.includes("Action required to load your app")) {
      return {
        message: "Cookies bloqueadas: El entorno de AI Studio requiere cookies para funcionar.",
        suggestion: "Habilita las cookies de terceros en tu navegador o intenta abrir la aplicación en una pestaña nueva (fuera del iframe de AI Studio)."
      };
    }

    if (message.includes("413") || message.includes("Payload Too Large")) {
      return {
        message: "Archivo demasiado grande: El audio excede el límite permitido.",
        suggestion: "Intenta grabar un audio más corto (menos de 15 minutos) o comprimir el archivo antes de subirlo."
      };
    }

    if (message.includes("500") || message.includes("Internal Server Error")) {
      return {
        message: "Error interno del servidor: Algo salió mal en el procesamiento.",
        suggestion: "Intenta de nuevo en unos momentos. Si el error persiste, puede haber un problema temporal con los servicios de Groq."
      };
    }

    if (message.includes("El servidor no devolvió el texto de la transcripción")) {
      return {
        message: "Respuesta incompleta: El servidor no devolvió el texto esperado.",
        suggestion: "Esto puede ocurrir si el audio está vacío o si hay un problema con el formato. Intenta grabar de nuevo asegurándote de que el micrófono esté capturando sonido."
      };
    }

    if (message.includes("No se detectó voz")) {
      return {
        message: "Silencio detectado: No se encontró voz en el audio.",
        suggestion: "Asegúrate de que el micrófono esté bien configurado y de que estés hablando lo suficientemente alto."
      };
    }

    return {
      message: message.startsWith("Error al transcribir") || message.startsWith("Error al limpiar") ? message : `Error inesperado: ${message}`,
      suggestion: "Si el problema continúa, intenta recargar la página o revisar la consola para más detalles técnicos."
    };
  };

  const denoiseAudio = async (blob: Blob): Promise<Blob> => {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      const offlineCtx = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
      );
      
      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;
      
      // 1. High-pass filter to remove low-frequency hum (below 150Hz)
      const hpFilter = offlineCtx.createBiquadFilter();
      hpFilter.type = "highpass";
      hpFilter.frequency.value = 150;
      hpFilter.Q.value = 1.0;
      
      // 2. Notch filter to remove power line hum (50Hz/60Hz)
      const notchFilter = offlineCtx.createBiquadFilter();
      notchFilter.type = "notch";
      notchFilter.frequency.value = sourceLanguage === "es" ? 50 : 60; // Heuristic for region
      notchFilter.Q.value = 10;

      // 3. Peaking filter to boost voice presence (around 3kHz)
      const presenceFilter = offlineCtx.createBiquadFilter();
      presenceFilter.type = "peaking";
      presenceFilter.frequency.value = 3000;
      presenceFilter.gain.value = 4;
      presenceFilter.Q.value = 1.0;
      
      // 4. Low-pass filter to remove high-frequency hiss (above 7000Hz)
      const lpFilter = offlineCtx.createBiquadFilter();
      lpFilter.type = "lowpass";
      lpFilter.frequency.value = 7000;
      lpFilter.Q.value = 1.0;
      
      // 5. Advanced Dynamics compressor for aggressive noise floor reduction
      const compressor = offlineCtx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-32, offlineCtx.currentTime);
      compressor.knee.setValueAtTime(40, offlineCtx.currentTime);
      compressor.ratio.setValueAtTime(15, offlineCtx.currentTime);
      compressor.attack.setValueAtTime(0.002, offlineCtx.currentTime);
      compressor.release.setValueAtTime(0.1, offlineCtx.currentTime);

      // 6. Noise Gate using WaveShaper to zero out low-level background noise
      const gate = offlineCtx.createWaveShaper();
      const curve = new Float32Array(4096);
      const gateThreshold = 0.015; 
      for (let i = 0; i < 4096; i++) {
        const x = (i - 2048) / 2048;
        curve[i] = Math.abs(x) < gateThreshold ? 0 : x;
      }
      gate.curve = curve;

      // 7. Final Gain stage to normalize
      const gainNode = offlineCtx.createGain();
      gainNode.gain.value = 1.2;
      
      // Chain: Source -> HP -> Notch -> Presence -> LP -> Compressor -> Gate -> Gain -> Destination
      source.connect(hpFilter);
      hpFilter.connect(notchFilter);
      notchFilter.connect(presenceFilter);
      presenceFilter.connect(lpFilter);
      lpFilter.connect(compressor);
      compressor.connect(gate);
      gate.connect(gainNode);
      gainNode.connect(offlineCtx.destination);
      
      source.start(0);
      const renderedBuffer = await offlineCtx.startRendering();
      
      return await audioBufferToWavBlob(renderedBuffer);
    } catch (err) {
      console.error("Error denoising audio:", err);
      return blob;
    }
  };

  const transcribeAudio = async (blob: Blob) => {
    if (!hasServerApiKey) {
      setError("El servidor no tiene configurada una API Key de Groq.");
      setErrorSuggestion("Configura la variable de entorno GROQ_API_KEY en el panel de control o introduce tu propia clave en la configuración de la app.");
      return;
    }

    setIsTranscribing(true);
    setIsUploading(true);
    setError(null);
    setErrorSuggestion(null);

    try {
      let audioToProcess = blob;
      
      if (autoDenoise) {
        toast.info("Reduciendo ruido de fondo...", { duration: 2000 });
        audioToProcess = await denoiseAudio(blob);
      }

      const formData = new FormData();
      formData.append("file", audioToProcess, "recording.wav");
      formData.append("model", "whisper-large-v3");
      formData.append("language", sourceLanguage);
      const activePrompt = getGlossaryPrompt();
      if (activePrompt) {
        formData.append("prompt", activePrompt);
      }

      const response = await fetchWithRetry("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      setIsUploading(false);

      if (!response.ok) {
        let errorMessage = `Error ${response.status}: ${response.statusText}`;
        const contentType = response.headers.get("content-type");
        
        if (contentType && contentType.includes("application/json")) {
          try {
            const errorData = await response.json();
            if (errorData.error) {
              errorMessage = typeof errorData.error === 'string' ? errorData.error : (errorData.error.message || errorMessage);
            } else if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch (e) {
            // Fallback
          }
        }
        
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        if (text.includes("<title>Cookie check</title>") || text.includes("Action required to load your app")) {
          throw new Error("Sesión de AI Studio expirada. Por favor, recarga la página para continuar.");
        }
        throw new Error(`Respuesta no válida del servidor (${response.status}). Es posible que la sesión haya expirado.`);
      }

      const data = await response.json();
      
      if (typeof data.text !== 'string') {
        console.error("Unexpected response format from Groq:", data);
        throw new Error("El servidor no devolvió el texto de la transcripción. Por favor, revisa la consola para más detalles.");
      }

      if (!data.text.trim()) {
        setHasDetectedSpeech(false);
        throw new Error("No se detectó voz en el audio. Por favor, asegúrate de que el micrófono esté funcionando y que estés hablando claramente.");
      }

      setHasDetectedSpeech(true);
      setRawTranscription(data.text);
      if (data.words) {
        setTranscriptionWords(data.words);
      }
      await cleanText(data.text, data.words);
    } catch (err: any) {
      console.error("Transcription error:", err);
      const { message, suggestion } = getEnhancedErrorInfo(err);
      setError(`Error al transcribir: ${message}`);
      setErrorSuggestion(suggestion);
      if (message.includes("autenticación")) {
        setShowSettings(true);
      }
    } finally {
      setIsTranscribing(false);
      setIsUploading(false);
    }
  };

  const formatParagraphs = (text: string) => {
    if (!text) return "";
    // Normalize existing line breaks to spaces first to re-calculate paragraphs
    let processed = text.replace(/\n+/g, " ").trim();
    // Split by sentence endings (. ! ?) followed by space
    // We use a positive lookbehind to keep the punctuation
    const sentences = processed.split(/(?<=[.!?])\s+/);
    
    if (sentences.length <= 3) return processed;
    
    let result = "";
    let sentenceCount = 0;
    
    for (let i = 0; i < sentences.length; i++) {
      result += sentences[i] + " ";
      sentenceCount++;
      
      // Heuristic: New paragraph every 4 sentences
      if (sentenceCount >= 4 && i !== sentences.length - 1) {
        result = result.trim() + "\n\n";
        sentenceCount = 0;
      }
    }
    return result.trim();
  };

  const cleanText = async (text: string, words?: Word[]) => {
    if (!text || typeof text !== 'string' || !text.trim()) return;

    setIsCleaning(true);
    setError(null);
    setErrorSuggestion(null);
    setSummary("");
    setKeyPoints([]);
    
    const modePrompts: Record<RefinementMode, string> = {
      standard: "Eres un asistente experto en limpieza de textos. Tu tarea es eliminar muletillas, pausas, repeticiones y sonidos no léxicos de las transcripciones de voz. Mantén el sentido original pero hazlo fluido y profesional. Devuelve SOLO el texto limpio, sin comentarios ni introducciones.",
      literal: "Eres un asistente experto en transcripción. Tu tarea es devolver la transcripción palabra por palabra, manteniendo todas las expresiones, incluso muletillas, pero con puntuación correcta para legibilidad. Devuelve SOLO el texto literal, sin comentarios.",
      email: "Eres un asistente experto en redacción de correos. Tu tarea es convertir esta transcripción en un correo electrónico profesional, bien estructurado, con saludo y despedida apropiados. Mantén el tono profesional.",
      list: "Eres un asistente experto en organización. Tu tarea es convertir esta transcripción en una lista clara y concisa de puntos clave o tareas pendientes (bullet points).",
      formal: "Eres un asistente experto en lenguaje formal. Tu tarea es reescribir esta transcripción usando un lenguaje académico, preciso y formal, eliminando cualquier rastro de informalidad o muletillas.",
      creative: "Eres un asistente experto en narrativa. Tu tarea es convertir esta transcripción en un texto fluido, narrativo y creativo, mejorando la estructura y el vocabulario sin perder la esencia del mensaje.",
      ultra_clean: "Eres un experto en reducción de ruido lingüístico y limpieza profunda. Tu tarea es actuar como un filtro de IA sofisticado: elimina absolutamente todas las muletillas, tartamudeos, repeticiones, frases incompletas y ruidos de fondo transcritos. Reconstruye las oraciones para que sean perfectas, fluidas y de alta calidad, como si hubieran sido escritas por un profesional, pero manteniendo estrictamente la información original. Devuelve SOLO el texto ultra-limpio."
    };

    let systemPrompt = modePrompts[refinementMode];
    if (sourceLanguage !== 'es') {
      const langName = SUPPORTED_LANGUAGES.find(l => l.code === sourceLanguage)?.label || sourceLanguage;
      systemPrompt += `\n\nIMPORTANTE: El texto original está en ${langName}. Debes TRADUCIRLO AL ESPAÑOL mientras aplicas la limpieza y el formato solicitado.`;
    }

    systemPrompt += `\n\nDebes devolver la respuesta en formato JSON con la siguiente estructura:
{
  "cleanedText": "El texto procesado aquí",
  "syncedWords": [
    {"word": "palabra", "start": 0.0, "end": 0.5},
    ...
  ],
  "doubtfulWords": [
    {"word": "palabra_dudosa", "start": 0.0, "end": 0.5, "reason": "Breve explicación de la posible ambigüedad"}
  ]
}
Para 'syncedWords', utiliza las marcas de tiempo originales de las palabras proporcionadas en la entrada para estimar la posición de las palabras en el texto limpio. Si eliminas palabras repetidas o muletillas, asegúrate de que las marcas de tiempo de las palabras restantes sean coherentes.
Para 'doubtfulWords', identifica hasta 5 términos del texto original o limpio que sean nombres propios ambiguos, palabras técnicas poco comunes o vacilaciones que pudieran requerir revisión humana.`;

    try {
      const response = await fetchWithRetry("/api/clean", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(userApiKey && { "x-groq-api-key": userApiKey })
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: `Procesa este texto y sus marcas de tiempo:\n\nTexto: ${text}\n\nPalabras con marcas de tiempo: ${JSON.stringify(words || [])}`,
            },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" }
        }),
      });

      if (!response.ok) {
        let errorMessage = `Error ${response.status}: ${response.statusText}`;
        const contentType = response.headers.get("content-type");
        
        if (contentType && contentType.includes("application/json")) {
          try {
            const errorData = await response.json();
            if (errorData.error) {
              errorMessage = typeof errorData.error === 'string' ? errorData.error : (errorData.error.message || errorMessage);
            } else if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch (e) {
            // Fallback
          }
        }
        
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textResponse = await response.text();
        if (textResponse.includes("<title>Cookie check</title>") || textResponse.includes("Action required to load your app")) {
          throw new Error("Cookie check");
        }
        throw new Error(`Respuesta no válida del servidor (${response.status})`);
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message || typeof data.choices[0].message.content !== 'string') {
        setCleanTranscription(text); // Fallback
        return;
      }

      let cleanedText = "";
      let syncedWords: Word[] = words || [];
      let doubtful: DoubtfulWord[] = [];

      try {
        const jsonResponse = JSON.parse(data.choices[0].message.content);
        cleanedText = jsonResponse.cleanedText || "";
        if (jsonResponse.syncedWords && Array.isArray(jsonResponse.syncedWords)) {
          syncedWords = jsonResponse.syncedWords;
        }
        if (jsonResponse.doubtfulWords && Array.isArray(jsonResponse.doubtfulWords)) {
          doubtful = jsonResponse.doubtfulWords;
        }
      } catch (e) {
        // Fallback if JSON parsing fails
        cleanedText = data.choices[0].message.content.trim();
      }
      
      setDoubtfulWords(doubtful);
      if (validationMode === 'realtime' && doubtful.length > 0) {
        setSelectedDoubtfulWord(doubtful[0]);
        toast.info(`Se detectaron ${doubtful.length} términos para revisión`, {
          description: "Revisa los términos dudosos marcados en el panel.",
        });
      }
      
      if (autoParagraph) {
        cleanedText = formatParagraphs(cleanedText);
      }
      
      setCleanTranscription(cleanedText);
      setTranscriptionWords(syncedWords);
      
      if (autoSummarize) {
        generateSummary(cleanedText);
      }

      // Add to history
      const newItem: HistoryItem = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        raw: text,
        clean: cleanedText,
        words: syncedWords,
      };
      setHistory(prev => [newItem, ...prev]);
    } catch (err: any) {
      console.error("Cleanup error:", err);
      const { message, suggestion } = getEnhancedErrorInfo(err);
      setError(`Error al limpiar el texto: ${message}`);
      setErrorSuggestion(suggestion);
      if (message.includes("autenticación")) {
        setShowSettings(true);
      }
    } finally {
      setIsCleaning(false);
    }
  };

  const generateSummary = async (text: string, historyId?: string) => {
    if (!text || !text.trim()) return;

    if (historyId) {
      setExpandedItems(prev => new Set(prev).add(historyId));
    }
    
    setIsGeneratingSummary(true);
    try {
      const response = await fetchWithRetry("/api/clean", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(userApiKey && { "x-groq-api-key": userApiKey })
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: "Eres un experto en síntesis de información. Tu tarea es generar un resumen ejecutivo conciso y una lista de puntos clave a partir del texto proporcionado. Devuelve la respuesta en formato JSON con las llaves 'summary' (string) y 'keyPoints' (array de strings).",
            },
            {
              role: "user",
              content: `Genera un resumen y puntos clave para este texto:\n\n${text}`,
            },
          ],
          temperature: 0.3,
          response_format: { type: "json_object" }
        }),
      });

      const data = await response.json();
      const content = JSON.parse(data.choices[0].message.content);
      
      if (historyId) {
        setHistory(prev => prev.map(item => 
          item.id === historyId ? { ...item, summary: content.summary, keyPoints: content.keyPoints } : item
        ));
      } else {
        setSummary(content.summary);
        setKeyPoints(content.keyPoints);
        
        // Update current history item if it exists (for the active recording)
        setHistory(prev => prev.map(item => 
          item.clean === text ? { ...item, summary: content.summary, keyPoints: content.keyPoints } : item
        ));
      }
      
      toast.success("Resumen generado con éxito");
    } catch (err) {
      console.error("Summary error:", err);
      toast.error("Error al generar el resumen");
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const suggestImprovements = async (id: string) => {
    const item = history.find(h => h.id === id);
    if (!item || !item.clean) return;

    setIsSuggestingImprovements(true);
    try {
      const response = await fetchWithRetry("/api/clean", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(userApiKey && { "x-groq-api-key": userApiKey })
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: "Eres un analista crítico. Tu tarea es revisar un resumen y puntos clave existentes comparándolos con el texto original para sugerir mejoras o puntos adicionales omitidos. Devuelve la respuesta en formato JSON con las llaves 'suggestedSummary' (string con el resumen mejorado) y 'additionalPoints' (array de strings con puntos nuevos o mejorados).",
            },
            {
              role: "user",
              content: `Texto Original:\n${item.clean}\n\nResumen Actual:\n${item.summary}\n\nPuntos Clave Actuales:\n${(item.keyPoints || []).join("\n")}\n\nPor favor, sugiere una versión mejorada del resumen y puntos adicionales que falten.`,
            },
          ],
          temperature: 0.5,
          response_format: { type: "json_object" }
        }),
      });

      const data = await response.json();
      const content = JSON.parse(data.choices[0].message.content);
      
      // We enter edit mode with the suggested content
      setEditingSummaryId(id);
      setTempSummary(content.suggestedSummary);
      setTempKeyPoints(content.additionalPoints.join("\n"));
      
      toast.success("Sugerencias generadas. Puedes revisarlas y guardarlas.");
    } catch (err) {
      console.error("Suggestion error:", err);
      toast.error("Error al generar sugerencias");
    } finally {
      setIsSuggestingImprovements(false);
    }
  };

  const toggleFavorite = (id: string) => {
    setHistory(prev => prev.map(item => 
      item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
    ));
    playFeedbackSound('click');
  };

  const downloadRawTranscription = () => {
    if (rawTranscription) {
      const blob = new Blob([rawTranscription], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `original_${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Transcripción original descargada");
    }
  };

  const copyToClipboard = () => {
    const textToCopy = cleanTranscription || rawTranscription;
    if (textToCopy) {
      playFeedbackSound('copy');
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success("Texto copiado al portapapeles");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyAllToClipboard = () => {
    if (rawTranscription && cleanTranscription) {
      playFeedbackSound('copy');
      const textToCopy = `--- Cleaned Transcription ---\n${cleanTranscription}\n\n--- Raw Transcription ---\n${rawTranscription}`;
      navigator.clipboard.writeText(textToCopy);
      setCopiedAll(true);
      toast.success("Todo el contenido copiado al portapapeles");
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  const copyRawToClipboard = () => {
    if (rawTranscription) {
      playFeedbackSound('copy');
      navigator.clipboard.writeText(rawTranscription);
      setCopiedRaw(true);
      toast.success("Transcripción original copiada");
      setTimeout(() => setCopiedRaw(false), 2000);
    }
  };

  const exportFile = (type: 'txt' | 'md' | 'pdf', source: 'clean' | 'raw', customText?: string) => {
    const text = customText || (source === 'clean' ? cleanTranscription : rawTranscription);
    if (!text) return;

    const date = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString().replace(/:/g, '-');
    const filename = `transcripcion-${source}-${date}-${time}.${type}`;
    
    if (type === 'pdf') {
      const doc = new jsPDF();
      const margin = 20;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const title = `Transcripción (${source === 'clean' ? 'Limpia' : 'Original'})`;
      const dateStr = new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date());

      // Header
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(title, margin, 20);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(`Fecha: ${dateStr}`, margin, 30);
      
      doc.setDrawColor(200);
      doc.line(margin, 35, pageWidth - margin, 35);

      // Content
      doc.setFontSize(12);
      doc.setTextColor(0);
      const splitText = doc.splitTextToSize(text, pageWidth - (margin * 2));
      
      let y = 45;
      const lineHeight = 7;
      
      for (let i = 0; i < splitText.length; i++) {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(splitText[i], margin, y);
        y += lineHeight;
      }
      
      doc.save(filename);
    } else {
      let content = text;
      if (type === 'md') {
        content = `# Transcripción (${source === 'clean' ? 'Limpia' : 'Original'})\n\n` +
                  `**Fecha:** ${new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date())}\n\n` +
                  `---\n\n` +
                  text;
      }

      const blob = new Blob([content], { type: type === 'txt' ? 'text/plain' : 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    setShowExportMenu(false);
  };

  const downloadAudio = () => {
    if (!audioBlob) return;
    
    const extension = audioBlob.type.split('/')[1]?.split(';')[0] || 'webm';
    const date = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString().replace(/:/g, '-');
    const filename = `grabacion-${date}-${time}.${extension}`;
    
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success("Audio descargado correctamente");
  };

  const clearAll = () => {
    playFeedbackSound('delete');
    setRawTranscription("");
    setCleanTranscription("");
    setTranscriptionWords([]);
    setSummary("");
    setKeyPoints([]);
    setIsRawEdited(false);
    setIsCleanEdited(false);
    localStorage.removeItem("whisper_raw_transcription");
    localStorage.removeItem("whisper_clean_transcription");
    localStorage.removeItem("whisper_words");
    setError(null);
    discardRecording();
    if (wavesurferRef.current) {
      wavesurferRef.current.pause();
    }
    setLastSaved(null);
    setIsDraftRecovered(false);
    setShowClearConfirm(false);
    toast.success("Todo el contenido ha sido eliminado");
  };

  const toggleHistoryItem = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllHistory = (expand: boolean) => {
    if (expand) {
      setExpandedItems(new Set(filteredHistory.map(item => item.id)));
    } else {
      setExpandedItems(new Set());
    }
  };

  const filteredHistory = history.filter(item => {
    const matchesSearch = item.raw.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         (item.clean || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFavorite = showOnlyFavorites ? item.isFavorite : true;
    return matchesSearch && matchesFavorite;
  });

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playFeedbackSound('delete');
    setHistory(prev => prev.filter(item => item.id !== id));
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const clearHistory = () => {
    playFeedbackSound('delete');
    setHistory([]);
    setShowHistoryClearConfirm(false);
    toast.success("Historial eliminado permanentemente");
  };

  const copyHistoryItem = (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playFeedbackSound('copy');
    navigator.clipboard.writeText(text);
    toast.success("Texto copiado al portapapeles");
  };

  const formatDate = (timestamp: number) => {
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp));
  };

  const finishTutorial = () => {
    localStorage.setItem("tutorial_seen", "true");
    setShowTutorial(false);
  };

  const tutorialSteps = [
    {
      title: "¡Bienvenido a Dictáfono!",
      description: hasServerApiKey 
        ? "Convierte tus pensamientos en texto limpio y profesional. Ya hemos configurado todo por ti, ¡estás listo para empezar!" 
        : "Convierte tus pensamientos en texto limpio y profesional en segundos. Deja que te mostremos cómo funciona.",
      icon: <Sparkles className="w-12 h-12 text-blue-500" />,
    },
    ...(!hasServerApiKey ? [{
      title: "Configuración Inicial",
      description: "Para empezar, ve a Ajustes e ingresa tu API Key de Groq. Esto permite que la magia de la transcripción suceda.",
      icon: <Settings className="w-12 h-12 text-blue-500" />,
    }] : []),
    {
      title: "Graba tus Ideas",
      description: "Presiona el botón del micrófono para empezar a hablar. Cuando termines, presiona el botón de detener.",
      icon: <Mic className="w-12 h-12 text-red-500" />,
    },
    {
      title: "Limpieza Inteligente",
      description: "Dictáfono no solo transcribe; también elimina muletillas y repeticiones automáticamente para que tu texto sea perfecto.",
      icon: <Wind className="w-12 h-12 text-teal-500" />,
    },
    {
      title: "Historial y Exportación",
      description: "Accede a tus grabaciones pasadas en el Historial. Puedes copiar el texto o guardarlo directamente en tu Google Drive.",
      icon: <History className="w-12 h-12 text-purple-500" />,
    },
  ];

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-500 relative overflow-x-hidden font-sans selection:bg-blue-100 dark:selection:bg-blue-900/30",
      theme === 'dark' ? "dark bg-neutral-950" : "bg-neutral-50"
    )}>
      {/* Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-blue-500/5 rounded-full blur-[100px] animate-pulse delay-700" />
        <div className="absolute -bottom-[10%] left-[20%] w-[35%] h-[35%] bg-cyan-500/5 rounded-full blur-[110px] animate-pulse delay-1000" />
      </div>

      <Toaster position="bottom-center" richColors />

      {/* Tutorial Overlay */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white dark:bg-neutral-900 rounded-[32px] p-8 max-w-md w-full shadow-2xl border border-neutral-200 dark:border-neutral-800 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-neutral-100 dark:bg-neutral-800">
                <motion.div 
                  className="h-full bg-blue-500"
                  initial={{ width: "0%" }}
                  animate={{ width: `${((tutorialStep + 1) / tutorialSteps.length) * 100}%` }}
                />
              </div>

              <div className="flex flex-col items-center text-center space-y-6 pt-4">
                <motion.div
                  key={tutorialStep}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-3xl"
                >
                  {tutorialSteps[tutorialStep].icon}
                </motion.div>

                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight">
                    {tutorialSteps[tutorialStep].title}
                  </h2>
                  <p className="text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    {tutorialSteps[tutorialStep].description}
                  </p>
                </div>

                <div className="flex items-center gap-3 w-full pt-4">
                  {tutorialStep > 0 && (
                    <button
                      onClick={() => setTutorialStep(prev => prev - 1)}
                      className="flex-1 px-6 py-3 rounded-2xl font-bold text-sm bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                    >
                      Anterior
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (tutorialStep < tutorialSteps.length - 1) {
                        setTutorialStep(prev => prev + 1);
                      } else {
                        finishTutorial();
                      }
                    }}
                    className="flex-[2] px-6 py-3 rounded-2xl font-bold text-sm bg-blue-500 text-white hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20"
                  >
                    {tutorialStep === tutorialSteps.length - 1 ? "¡Empezar!" : "Siguiente"}
                  </button>
                </div>

                <button 
                  onClick={finishTutorial}
                  className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors mt-4"
                >
                  Saltar tutorial
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Información del Autor & EDUC.AI */}
      <AnimatePresence>
        {showAuthorModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
            onClick={() => setShowAuthorModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-neutral-900 rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-neutral-200 dark:border-neutral-800 space-y-6 relative overflow-hidden"
            >
              <button
                onClick={() => setShowAuthorModal(false)}
                className="absolute top-6 right-6 p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors rounded-xl bg-neutral-100 dark:bg-neutral-800"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-4 pt-2">
                <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-cyan-500 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-500/30">
                  MF
                </div>
                <div>
                  <h2 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">Mariano Fischer</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[10px] font-extrabold uppercase tracking-wider rounded-md border border-blue-200 dark:border-blue-800">
                      EDUC.AI
                    </span>
                    <span className="text-xs text-neutral-400 font-medium">Creador & Desarrollador</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed font-medium">
                Dictáfono AI es un proyecto de aprendizaje e impacto educativo ("Vibe Coding"). Diseñado 100% en idioma español con tecnología Whisper y Llama 3 para una toma de notas ágil por voz.
              </p>

              <div className="space-y-3 pt-2">
                <a
                  href="https://www.linkedin.com/in/educaailatam/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-2xl border border-neutral-200/60 dark:border-neutral-800 text-sm font-bold text-neutral-700 dark:text-neutral-200 hover:text-blue-600 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">in</div>
                    <span>LinkedIn (EDUC.AI)</span>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-neutral-400 group-hover:text-blue-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </a>

                <a
                  href="https://simple.bio/ARIfischer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded-2xl border border-neutral-200/60 dark:border-neutral-800 text-sm font-bold text-neutral-700 dark:text-neutral-200 hover:text-cyan-600 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-cyan-500" />
                    <span>Contacto / Bio (simple.bio)</span>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-neutral-400 group-hover:text-cyan-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </a>

                <a
                  href="https://dictafono-ai-qxsnswy.gamma.site/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-2xl border border-neutral-200/60 dark:border-neutral-800 text-sm font-bold text-neutral-700 dark:text-neutral-200 hover:text-amber-600 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <HelpCircle className="w-5 h-5 text-amber-500" />
                    <span>Instructivo Web Oficial (Gamma)</span>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-neutral-400 group-hover:text-amber-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </a>

                <a
                  href="mailto:educaailatam@gmail.com?subject=Contacto%20Dict%C3%A1fono%20AI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-2xl border border-neutral-200/60 dark:border-neutral-800 text-sm font-bold text-neutral-700 dark:text-neutral-200 hover:text-green-600 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-green-500" />
                    <span>Email: educaailatam@gmail.com</span>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-neutral-400 group-hover:text-green-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <header className="sticky top-0 z-50 bg-white/70 dark:bg-neutral-950/70 backdrop-blur-2xl border-b border-white/20 dark:border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4 group cursor-default">
            <motion.div 
              whileHover={{ rotate: 5, scale: 1.05 }}
              className="w-8 h-8 sm:w-12 sm:h-12 bg-blue-500 rounded-lg sm:rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/30 transition-all duration-500"
            >
              <Mic className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
            </motion.div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-base sm:text-xl tracking-tighter leading-none uppercase">Dictafono <span className="text-blue-500">AI</span></h1>
                <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[9px] font-extrabold uppercase tracking-wider rounded-md border border-blue-200 dark:border-blue-800">EDUC.AI</span>
              </div>
              <p className="hidden sm:block text-[10px] text-neutral-400 dark:text-neutral-500 uppercase tracking-[0.3em] font-bold mt-1.5">Voz a Texto AI & Precision DSP</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            {!isMobile && (
              <>
                <button
                  onClick={() => setShowAuthorModal(true)}
                  className="min-w-[44px] min-h-[44px] px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors text-neutral-700 dark:text-neutral-200 flex items-center gap-1.5 font-bold text-xs"
                  title="Acerca del Autor (Mariano Fischer / EDUC.AI)"
                  aria-label="Acerca del Autor"
                >
                  <Activity className="w-4 h-4 text-blue-500" />
                  <span className="hidden md:inline">Autor</span>
                </button>
                <button
                  onClick={() => setShowGlossaryModal(true)}
                  className="min-w-[44px] min-h-[44px] px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-xl transition-colors text-amber-600 dark:text-amber-400 flex items-center gap-1.5 font-bold text-xs"
                  title="Glosario Dinámico de Términos"
                  aria-label="Glosario de términos"
                >
                  <Bookmark className="w-4 h-4" />
                  <span className="hidden md:inline">Glosario</span>
                  <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-[10px] rounded-full font-bold">{glossary.length}</span>
                </button>
                <a
                  href="https://dictafono-ai-qxsnswy.gamma.site/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-[44px] min-h-[44px] px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors text-neutral-600 dark:text-neutral-300 flex items-center gap-1 font-bold text-xs"
                  title="Instructivo Oficial Gamma"
                  aria-label="Ver instructivo oficial"
                >
                  <HelpCircle className="w-4 h-4" />
                  <span className="hidden lg:inline">Instructivo</span>
                </a>
                <a
                  href="mailto:educaailatam@gmail.com?subject=Feedback%20Dict%C3%A1fono%20AI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-[44px] min-h-[44px] px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors text-blue-600 dark:text-blue-400 flex items-center gap-1 font-bold text-xs"
                  title="Enviar Feedback a EDUC.AI"
                  aria-label="Enviar Feedback"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span className="hidden lg:inline">Feedback</span>
                </a>
                <button
                  onClick={() => setShowGuide(true)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors text-neutral-600 dark:text-neutral-300"
                  title="Guía de Usuario"
                  aria-label="Abrir guía de usuario"
                >
                  <FileText className="w-5 h-5" />
                </button>
                <button
                  onClick={() => {
                    const themes: ('light' | 'dark' | 'system')[] = ['light', 'dark', 'system'];
                    const nextTheme = themes[(themes.indexOf(theme) + 1) % themes.length];
                    setTheme(nextTheme);
                    toast.info(`Tema cambiado a ${nextTheme === 'system' ? 'automático' : nextTheme === 'dark' ? 'oscuro' : 'claro'}`);
                  }}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors text-neutral-600 dark:text-neutral-300"
                  title={`Tema: ${theme === 'system' ? 'Automático' : theme === 'dark' ? 'Oscuro' : 'Claro'}`}
                  aria-label="Cambiar tema de color"
                >
                  {theme === 'system' ? <Monitor className="w-5 h-5" /> : theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                </button>
              </>
            )}
            <button
              onClick={() => {
                if (isMobile) {
                  setActiveView(prev => prev === 'settings' ? 'record' : 'settings');
                } else {
                  setShowSettings(prev => !prev);
                }
              }}
              className={cn(
                "min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-all",
                (showSettings || (isMobile && activeView === 'settings'))
                  ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20" 
                  : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
              )}
              title="Configuración"
              aria-label="Configuración de la aplicación"
              aria-expanded={showSettings || (isMobile && activeView === 'settings')}
            >
              <Settings className={cn("w-5 h-5 transition-transform", (showSettings || (isMobile && activeView === 'settings')) && "rotate-90")} />
            </button>
          </div>
        </div>
      </header>

      <main 
        className={cn(
          "max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-12 space-y-8 sm:space-y-20 relative z-10",
          isMobile ? "pb-32 pt-4" : "pb-24"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <AnimatePresence>
          {isDragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-blue-500/10 backdrop-blur-sm border-4 border-dashed border-blue-500 m-4 rounded-[3rem] pointer-events-none"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-20 h-20 bg-white dark:bg-neutral-900 rounded-3xl flex items-center justify-center shadow-2xl">
                  <FileUp className="w-10 h-10 text-blue-500 animate-bounce" />
                </div>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">Suelta para cargar el audio</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recording Section */}
        <div className={cn(
          "space-y-12 mb-16",
          isMobile && activeView !== 'record' && "hidden"
        )}>
          {!isMobile && (
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                { step: "1", text: "Presiona Grabar y habla claro", icon: <Mic2 className="w-4 h-4" /> },
                { step: "2", text: "Procesa con IA para limpiar", icon: <Sparkles className="w-4 h-4" /> },
                { step: "3", text: "Copia o exporta el resultado", icon: <FileDown className="w-4 h-4" /> }
              ].map((item) => (
                <div key={item.step} className="flex flex-col items-center text-center p-6 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm border border-white/20 dark:border-white/5 rounded-3xl shadow-sm group hover:shadow-md transition-all duration-500">
                  <div className="w-10 h-10 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl mb-4 group-hover:scale-110 transition-transform duration-500">
                    {item.icon}
                  </div>
                  <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200 leading-tight tracking-tight">
                    {item.text}
                  </p>
                </div>
              ))}
            </section>
          )}

        {/* Process Confirmation Modal */}
        <AnimatePresence>
          {showProcessConfirm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowProcessConfirm(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-sm bg-white dark:bg-neutral-900 rounded-[2.5rem] p-8 shadow-2xl border border-neutral-200 dark:border-neutral-800"
              >
                <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                  <Sparkles className="w-8 h-8 text-blue-500" />
                </div>
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white text-center mb-2">¿Volver a procesar?</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center mb-8 leading-relaxed">
                  Ya tienes una transcripción. Si continúas, se generará una nueva y podrías perder los cambios manuales que hayas realizado.
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => startTranscription(true)}
                    className="w-full py-3 bg-blue-500 rounded-2xl text-sm font-bold text-white hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20"
                  >
                    Sí, procesar de nuevo
                  </button>
                  <button
                    onClick={() => setShowProcessConfirm(false)}
                    className="w-full py-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl text-sm font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Clear Confirmation Modal */}
        <AnimatePresence>
          {showClearConfirm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowClearConfirm(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-sm bg-white dark:bg-neutral-900 rounded-[2.5rem] p-8 shadow-2xl border border-neutral-200 dark:border-neutral-800"
              >
                <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                  <Trash2 className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white text-center mb-2">¿Eliminar todo?</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center mb-8 leading-relaxed">
                  Esta acción borrará permanentemente la transcripción actual y el borrador guardado. No se puede deshacer.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1 py-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl text-sm font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={clearAll}
                    className="flex-1 py-3 bg-red-500 rounded-2xl text-sm font-bold text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                  >
                    Eliminar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* History Clear Confirmation Modal */}
        <AnimatePresence>
          {showHelp && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowHelp(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-[2.5rem] p-8 shadow-2xl border border-neutral-200 dark:border-neutral-800 max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center">
                      <HelpCircle className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Centro de Ayuda</h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">Aprende a usar Dictafono AI</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowHelp(false)}
                    className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
                  >
                    <X className="w-5 h-5 text-neutral-400" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20 rounded-2xl">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-3 flex items-center gap-2">
                      <Sparkles className="w-3 h-3" /> Consejos de Uso
                    </h4>
                    <div className="grid gap-3">
                      {USAGE_TIPS.map((tip, i) => (
                        <div key={i} className="space-y-1">
                          <p className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200">{tip.title}</p>
                          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-relaxed">{tip.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center shrink-0">
                      <Mic className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <h4 className="font-bold text-neutral-900 dark:text-white mb-1">Grabación de Audio</h4>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                        Pulsa el botón central para empezar a grabar. Puedes pausar y reanudar en cualquier momento. El indicador visual te mostrará si estamos recibiendo sonido.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center shrink-0">
                      <Sparkles className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <h4 className="font-bold text-neutral-900 dark:text-white mb-1">Transcripción Inteligente</h4>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                        Usamos Whisper de OpenAI para convertir tu voz en texto. Una vez transcrito, puedes usar la IA para "Limpiar" el texto, corrigiendo gramática y puntuación.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-green-50 dark:bg-green-900/20 rounded-xl flex items-center justify-center shrink-0">
                      <Activity className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <h4 className="font-bold text-neutral-900 dark:text-white mb-1">Transcripción Interactiva</h4>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                        Haz clic en cualquier palabra del texto transcrito para saltar a ese momento exacto en el audio. Las palabras se resaltan automáticamente mientras escuchas.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/20 rounded-xl flex items-center justify-center shrink-0">
                      <History className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                      <h4 className="font-bold text-neutral-900 dark:text-white mb-1">Historial y Exportación</h4>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                        Tus transcripciones se guardan automáticamente. Puedes buscarlas, copiarlas o exportarlas en diferentes formatos (TXT, MD, JSON) desde el historial.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-10">
                  <button
                    onClick={() => setShowHelp(false)}
                    className="w-full py-4 bg-blue-500 rounded-2xl text-sm font-bold text-white hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20"
                  >
                    Entendido
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* User Guide Modal */}
        <AnimatePresence>
          {showGuide && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowGuide(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-2xl bg-white dark:bg-neutral-900 rounded-[2.5rem] p-8 shadow-2xl border border-neutral-200 dark:border-neutral-800 max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/20">
                      <FileText className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Guía de Usuario</h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">Características e Instrucciones</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowGuide(false)}
                    className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
                  >
                    <X className="w-5 h-5 text-neutral-400" />
                  </button>
                </div>

                <div className="space-y-10">
                  {/* Section: What is Dictafono AI? */}
                  <section className="space-y-4">
                    <h4 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-blue-500" /> ¿Qué es Dictafono AI?
                    </h4>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      Dictafono AI es una herramienta avanzada de productividad diseñada para transformar tus pensamientos hablados en documentos profesionales listos para compartir. Utiliza inteligencia artificial de vanguardia para transcribir, limpiar y estructurar tus audios de manera automática.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-100 dark:border-neutral-800/50">
                        <h5 className="text-xs font-bold uppercase tracking-widest text-blue-500 mb-2">Utilidad</h5>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                          Ideal para profesionales, estudiantes y creadores que necesitan capturar ideas, reuniones, entrevistas o clases sin perder tiempo en transcripciones manuales.
                        </p>
                      </div>
                      <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-100 dark:border-neutral-800/50">
                        <h5 className="text-xs font-bold uppercase tracking-widest text-red-500 mb-2">Puntos de Dolor Solucionados</h5>
                        <ul className="text-[11px] text-neutral-500 dark:text-neutral-400 space-y-1 list-disc pl-4">
                          <li>Elimina muletillas y errores gramaticales.</li>
                          <li>Ahorra horas de escritura manual.</li>
                          <li>Organiza notas de voz desordenadas.</li>
                          <li>Rompe barreras lingüísticas con traducción.</li>
                        </ul>
                      </div>
                    </div>
                  </section>

                  {/* Section: Initial Configuration */}
                  <section className="space-y-4">
                    <h4 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                      <Settings className="w-5 h-5 text-blue-500" /> 1. Configuración Inicial
                    </h4>
                    <div className="space-y-3">
                      <div className="flex gap-4">
                        <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center shrink-0 text-blue-500 font-bold text-xs">1</div>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400">
                          <strong>API Key:</strong> Ve a Ajustes y asegúrate de tener una API Key configurada. Puedes usar Groq (gratuita) para una velocidad increíble o Gemini.
                        </p>
                      </div>
                      <div className="flex gap-4">
                        <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center shrink-0 text-blue-500 font-bold text-xs">2</div>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400">
                          <strong>Google Drive:</strong> Si deseas guardar tus audios en la nube, conecta tu cuenta de Google en la sección de Drive dentro de Ajustes.
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* Section: Usage Procedure */}
                  <section className="space-y-4">
                    <h4 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                      <Activity className="w-5 h-5 text-blue-500" /> 2. Procedimiento de Uso
                    </h4>
                    <div className="grid gap-4">
                      <div className="flex gap-4">
                        <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center shrink-0 text-blue-500 font-bold text-xs">A</div>
                        <div>
                          <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Grabar o Subir</p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">Pulsa el micrófono para grabar en vivo o arrastra un archivo de audio a la aplicación.</p>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center shrink-0 text-blue-500 font-bold text-xs">B</div>
                        <div>
                          <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Editar y Recortar</p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">Usa el editor de ondas para seleccionar fragmentos. Puedes "Eliminar" errores o "Mantener" solo lo importante.</p>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center shrink-0 text-blue-500 font-bold text-xs">C</div>
                        <div>
                          <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Procesar con IA</p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">Elige un modo (Estándar, Formal, Email, etc.) y el idioma. La IA transcribirá y limpiará el texto automáticamente.</p>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center shrink-0 text-blue-500 font-bold text-xs">D</div>
                        <div>
                          <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Interactuar y Exportar</p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">Haz clic en las palabras para escuchar el audio. Exporta el resultado final a TXT, PDF o Google Drive.</p>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Section: Advanced Features */}
                  <section className="space-y-4">
                    <h4 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                      <Maximize2 className="w-5 h-5 text-blue-500" /> 3. Funciones Avanzadas
                    </h4>
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20 rounded-2xl space-y-3">
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        <strong>Modo Presentación:</strong> Ideal para leer tus transcripciones con comodidad. Incluye temas visuales y navegación por teclado.
                      </p>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        <strong>Traducción:</strong> Traduce tus audios a más de 9 idiomas manteniendo la coherencia y el contexto.
                      </p>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        <strong>Historial Offline:</strong> Todo se guarda en tu navegador. Puedes acceder a tus notas anteriores incluso sin conexión.
                      </p>
                    </div>
                  </section>
                </div>

                <div className="mt-10">
                  <button
                    onClick={() => setShowGuide(false)}
                    className="w-full py-4 bg-blue-500 rounded-2xl text-sm font-bold text-white hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20"
                  >
                    ¡Empezar a usar!
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Glossary Management Modal */}
        <AnimatePresence>
          {showGlossaryModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowGlossaryModal(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-xl bg-white dark:bg-neutral-900 rounded-[2.5rem] p-8 shadow-2xl border border-neutral-200 dark:border-neutral-800 max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center shadow-xl shadow-amber-500/20">
                      <Bookmark className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Glosario Dinámico</h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">Guía la transcripción de términos complejos en Whisper</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowGlossaryModal(false)}
                    className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
                  >
                    <X className="w-5 h-5 text-neutral-400" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-2xl">
                    <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                      💡 Los términos de este glosario se inyectan en el prompt del modelo <strong>Whisper Large V3</strong> para forzar la correcta ortografía de nombres propios, marcas y jerga técnica.
                    </p>
                  </div>

                  {/* Add Term Form */}
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      addToGlossary(newGlossaryTerm, newGlossaryContext);
                      setNewGlossaryTerm("");
                    }}
                    className="flex flex-col sm:flex-row gap-3"
                  >
                    <input
                      type="text"
                      placeholder="Nuevo término (ej: EDUC.AI, VibeCoding)..."
                      value={newGlossaryTerm}
                      onChange={(e) => setNewGlossaryTerm(e.target.value)}
                      className="flex-1 px-4 py-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                    <input
                      type="text"
                      placeholder="Etiqueta/Contexto..."
                      value={newGlossaryContext}
                      onChange={(e) => setNewGlossaryContext(e.target.value)}
                      className="w-36 px-4 py-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs shadow-md shadow-amber-500/20 transition-all"
                    >
                      Añadir
                    </button>
                  </form>

                  {/* Context Filter */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Contexto Activo para Transcripción</label>
                    <div className="flex flex-wrap gap-2">
                      {["todos", ...Array.from(new Set(glossary.map(g => g.context)))].map(ctx => (
                        <button
                          key={ctx}
                          onClick={() => setSelectedContextTag(ctx)}
                          className={cn(
                            "px-3 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border",
                            selectedContextTag === ctx
                              ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                              : "bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-500"
                          )}
                        >
                          {ctx}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Terms List */}
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {glossary.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-100 dark:border-neutral-800">
                        <div>
                          <span className="text-sm font-bold text-neutral-800 dark:text-neutral-200">{item.term}</span>
                          <span className="ml-2 text-[9px] px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold rounded-full">
                            {item.context}
                          </span>
                        </div>
                        <button
                          onClick={() => removeFromGlossary(item.id)}
                          className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
                          title="Eliminar del glosario"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 flex justify-between items-center pt-4 border-t border-neutral-100 dark:border-neutral-800">
                  <span className="text-[10px] text-neutral-400 font-medium truncate max-w-[300px]">
                    Prompt activo: <strong className="text-neutral-700 dark:text-neutral-300">{getGlossaryPrompt() || "(Ninguno)"}</strong>
                  </span>
                  <button
                    onClick={() => setShowGlossaryModal(false)}
                    className="px-6 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-opacity"
                  >
                    Guardar y Cerrar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showHistoryClearConfirm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowHistoryClearConfirm(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-sm bg-white dark:bg-neutral-900 rounded-[2.5rem] p-8 shadow-2xl border border-neutral-200 dark:border-neutral-800"
              >
                <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                  <History className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white text-center mb-2">¿Borrar historial?</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center mb-8 leading-relaxed">
                  Esta acción borrará permanentemente todas las grabaciones y transcripciones guardadas en el historial. No se puede deshacer.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowHistoryClearConfirm(false)}
                    className="flex-1 py-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl text-sm font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={clearHistory}
                    className="flex-1 py-3 bg-red-500 rounded-2xl text-sm font-bold text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                  >
                    Borrar todo
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showDiscardSummaryConfirm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowDiscardSummaryConfirm(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-sm bg-white dark:bg-neutral-900 rounded-[2.5rem] p-8 shadow-2xl border border-neutral-200 dark:border-neutral-800"
              >
                <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/20 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                  <AlertCircle className="w-8 h-8 text-amber-500" />
                </div>
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white text-center mb-2">¿Descartar cambios?</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center mb-8 leading-relaxed">
                  Tienes cambios sin guardar en el resumen. Si sales ahora, perderás estas modificaciones.
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => {
                      setEditingSummaryId(null);
                      setShowDiscardSummaryConfirm(false);
                    }}
                    className="w-full py-3 bg-red-500 rounded-2xl text-sm font-bold text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                  >
                    Descartar cambios
                  </button>
                  <button
                    onClick={() => setShowDiscardSummaryConfirm(false)}
                    className="w-full py-3 bg-neutral-100 dark:bg-neutral-800 rounded-2xl text-sm font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                  >
                    Continuar editando
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(showSettings || (isMobile && activeView === 'settings')) && (
            <motion.div
              initial={isMobile ? { opacity: 0, x: 100 } : { height: 0, opacity: 0 }}
              animate={isMobile ? { opacity: 1, x: 0 } : { height: "auto", opacity: 1 }}
              exit={isMobile ? { opacity: 0, x: 100 } : { height: 0, opacity: 0 }}
              className={cn(
                "overflow-hidden",
                isMobile && "fixed inset-0 z-[60] bg-white dark:bg-neutral-950 p-6 overflow-y-auto"
              )}
            >
              <div className={cn(
                "bg-white dark:bg-neutral-900 border border-neutral-200/50 dark:border-neutral-800/50 rounded-3xl p-8 shadow-sm space-y-8",
                isMobile && "border-none shadow-none px-0 pt-0 pb-32"
              )}>
                <div className={cn(
                  "flex items-center justify-between",
                  isMobile && "sticky top-0 z-10 bg-white dark:bg-neutral-950 py-4 mb-6 border-b border-neutral-100 dark:border-neutral-800"
                )}>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                    <Settings className="w-4 h-4" /> Configuración
                  </h2>
                  <button 
                    onClick={() => {
                      if (isMobile) {
                        setActiveView('record');
                      } else {
                        setShowSettings(false);
                      }
                    }}
                    className="p-3 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
                  >
                    {isMobile ? <ChevronLeft className="w-6 h-6 text-neutral-400" /> : <ChevronUp className="w-5 h-5 text-neutral-400" />}
                  </button>
                </div>

                <div className="grid sm:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="flex flex-col gap-4 p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-100 dark:border-neutral-800/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white dark:bg-neutral-900 rounded-xl flex items-center justify-center shadow-sm">
                            {isDarkMode ? <Moon className="w-5 h-5 text-blue-500" /> : <Sun className="w-5 h-5 text-blue-500" />}
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Tema Visual</p>
                            <p className="text-[10px] text-neutral-400">Personaliza tu interfaz</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl">
                        {(['light', 'dark', 'system'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setTheme(t)}
                            className={cn(
                              "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[10px] font-bold transition-all uppercase tracking-wider",
                              theme === t 
                                ? "bg-white dark:bg-neutral-900 text-blue-500 shadow-sm" 
                                : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                            )}
                          >
                            {t === 'light' && <Sun className="w-3.5 h-3.5" />}
                            {t === 'dark' && <Moon className="w-3.5 h-3.5" />}
                            {t === 'system' && <Monitor className="w-3.5 h-3.5" />}
                            <span>{t === 'system' ? 'Auto' : t === 'light' ? 'Claro' : 'Oscuro'}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                          <Mic className="w-3.5 h-3.5" /> Micrófono
                        </label>
                        <select
                          value={selectedDeviceId}
                          onChange={(e) => setSelectedDeviceId(e.target.value)}
                          className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-800 rounded-xl px-4 py-3 text-sm font-medium text-neutral-600 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none cursor-pointer"
                        >
                          {availableDevices.length > 0 ? (
                            availableDevices.map((device) => (
                              <option key={device.deviceId} value={device.deviceId}>
                                {device.label || `Micrófono ${device.deviceId.slice(0, 5)}`}
                              </option>
                            ))
                          ) : (
                            <option value="">No se encontraron micrófonos</option>
                          )}
                        </select>
                        {!availableDevices.some(d => d.label) && availableDevices.length > 0 && (
                          <button
                            onClick={() => (window as any).refreshAudioDevices()}
                            className="text-[10px] font-bold uppercase tracking-widest text-blue-500 hover:text-blue-600 transition-colors flex items-center gap-1 mt-1 px-1"
                          >
                            <Key className="w-3 h-3" /> Mostrar nombres de dispositivos
                          </button>
                        )}
                        {selectedDeviceId && availableDevices.find(d => d.deviceId === selectedDeviceId)?.label && (
                          <p className="text-[10px] text-neutral-400 mt-1 px-1 italic">
                            Activo: {availableDevices.find(d => d.deviceId === selectedDeviceId)?.label}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                            <Volume2 className="w-3.5 h-3.5" /> Ganancia ({micGain.toFixed(1)}x)
                          </label>
                          <button
                            onClick={() => setIsTestingMic(!isTestingMic)}
                            className={cn(
                              "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg transition-all",
                              isTestingMic 
                                ? "bg-red-500 text-white shadow-lg shadow-red-500/20" 
                                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                            )}
                          >
                            {isTestingMic ? "Detener Prueba" : "Probar Micrófono"}
                          </button>
                        </div>
                        
                        {isTestingMic && (
                          <div className="h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden relative">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(audioLevel / 255) * 100}%` }}
                              className={cn(
                                "h-full transition-all duration-75",
                                audioLevel > 200 ? "bg-red-500" : audioLevel > 100 ? "bg-amber-500" : "bg-green-500"
                              )}
                            />
                            <div className="absolute inset-0 flex justify-between px-1">
                              {[...Array(10)].map((_, i) => (
                                <div key={i} className="w-px h-full bg-black/5 dark:bg-white/5" />
                              ))}
                            </div>
                          </div>
                        )}

                        <input
                          type="range"
                          min="0.5"
                          max="3"
                          step="0.1"
                          value={micGain}
                          onChange={(e) => setMicGain(parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <div className="flex justify-between text-[10px] font-bold text-neutral-300 uppercase">
                          <span>Suave</span>
                          <span>Fuerte</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-100 dark:border-neutral-800/50">
                        <div className="space-y-0.5">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5" /> Auto-párrafos
                          </label>
                          <p className="text-[10px] text-neutral-400">Divide el texto en párrafos lógicos</p>
                        </div>
                        <button
                          onClick={() => setAutoParagraph(!autoParagraph)}
                          className={cn(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                            autoParagraph ? "bg-blue-500" : "bg-neutral-300 dark:bg-neutral-700"
                          )}
                        >
                          <span
                            className={cn(
                              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                              autoParagraph ? "translate-x-6" : "translate-x-1"
                            )}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-100 dark:border-neutral-800/50">
                        <div className="space-y-0.5">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                            <Volume2 className="w-3.5 h-3.5" /> Efectos de Sonido
                          </label>
                          <p className="text-[10px] text-neutral-400">Sonidos al copiar o eliminar</p>
                        </div>
                        <button
                          onClick={() => {
                            setSoundEnabled(!soundEnabled);
                            if (!soundEnabled) {
                              // Play a test sound when enabling
                              setTimeout(() => {
                                try {
                                  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                                  const osc = ctx.createOscillator();
                                  const gain = ctx.createGain();
                                  osc.connect(gain);
                                  gain.connect(ctx.destination);
                                  osc.frequency.setValueAtTime(880, ctx.currentTime);
                                  gain.gain.setValueAtTime(0.05, ctx.currentTime);
                                  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
                                  osc.start();
                                  osc.stop(ctx.currentTime + 0.1);
                                  setTimeout(() => ctx.close(), 200);
                                } catch (e) {}
                              }, 50);
                            }
                          }}
                          className={cn(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                            soundEnabled ? "bg-blue-500" : "bg-neutral-300 dark:bg-neutral-700"
                          )}
                        >
                          <span
                            className={cn(
                              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                              soundEnabled ? "translate-x-6" : "translate-x-1"
                            )}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-100 dark:border-neutral-800/50">
                        <div className="space-y-0.5">
                          <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                            <Wind className="w-3.5 h-3.5" /> Supresión
                          </label>
                          <p className="text-[10px] text-neutral-400">Reduce el ruido de fondo</p>
                        </div>
                        <button
                          onClick={() => setNoiseSuppression(!noiseSuppression)}
                          className={cn(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                            noiseSuppression ? "bg-blue-500" : "bg-neutral-300 dark:bg-neutral-700"
                          )}
                        >
                          <span
                            className={cn(
                              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                              noiseSuppression ? "translate-x-6" : "translate-x-1"
                            )}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-purple-50/30 dark:bg-purple-900/10 rounded-2xl border border-purple-100/30 dark:border-purple-900/20">
                        <div className="space-y-0.5">
                          <label className="text-xs font-bold uppercase tracking-widest text-purple-600 dark:text-purple-400 flex items-center gap-2">
                            <Sparkles className="w-3.5 h-3.5" /> Resumen Automático
                          </label>
                          <p className="text-[10px] text-purple-500/70">Genera un resumen al finalizar la limpieza</p>
                        </div>
                        <button
                          onClick={() => setAutoSummarize(!autoSummarize)}
                          className={cn(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                            autoSummarize ? "bg-purple-500" : "bg-neutral-300 dark:bg-neutral-700"
                          )}
                        >
                          <span
                            className={cn(
                              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                              autoSummarize ? "translate-x-6" : "translate-x-1"
                            )}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-blue-50/30 dark:bg-blue-900/10 rounded-2xl border border-blue-100/30 dark:border-blue-900/20">
                        <div className="space-y-0.5">
                          <label className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 flex items-center gap-2">
                            <Sparkles className="w-3.5 h-3.5" /> Reducción de Ruido Pro
                          </label>
                          <p className="text-[10px] text-blue-500/70">Filtra eco y ruido ambiental con DSP</p>
                        </div>
                        <button
                          onClick={() => setAutoDenoise(!autoDenoise)}
                          className={cn(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                            autoDenoise ? "bg-blue-500" : "bg-neutral-300 dark:bg-neutral-700"
                          )}
                        >
                          <span
                            className={cn(
                              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                              autoDenoise ? "translate-x-6" : "translate-x-1"
                            )}
                          />
                        </button>
                      </div>
                    </div>

                    {supportedFormats.length > 0 && (
                      <div className="space-y-4 pt-4 border-t border-neutral-100 dark:border-neutral-800/50">
                        <label className="text-xs font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                          <Mic2 className="w-3.5 h-3.5" /> Formato de Grabación
                        </label>
                        <div className="grid grid-cols-1 gap-3">
                          {supportedFormats.map((format) => (
                            <button
                              key={format.id}
                              onClick={() => setAudioFormat(format.id)}
                              className={cn(
                                "flex flex-col p-4 rounded-2xl border transition-all text-left group",
                                audioFormat === format.id
                                  ? "bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/20"
                                  : "bg-neutral-50 dark:bg-neutral-800/50 border-neutral-100 dark:border-neutral-800/50 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                              )}
                            >
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-bold uppercase tracking-wider">{format.label}</span>
                                {audioFormat === format.id && <Check className="w-3 h-3" />}
                              </div>
                              <p className={cn(
                                "text-[10px] leading-relaxed mb-2",
                                audioFormat === format.id ? "text-blue-100" : "text-neutral-400"
                              )}>
                                {format.description}
                              </p>
                              <div className="flex gap-2">
                                <span className={cn(
                                  "text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter",
                                  audioFormat === format.id ? "bg-white/20 text-white" : "bg-neutral-200 dark:bg-neutral-700 text-neutral-500"
                                )}>
                                  Calidad: {format.quality}
                                </span>
                                <span className={cn(
                                  "text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter",
                                  audioFormat === format.id ? "bg-white/20 text-white" : "bg-neutral-200 dark:bg-neutral-700 text-neutral-500"
                                )}>
                                  Tamaño: {format.size}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-6 bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/20">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white dark:bg-neutral-900 rounded-xl flex items-center justify-center shadow-sm">
                          <Sparkles className="w-6 h-6 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Estado del Sistema</p>
                          <p className="text-[10px] text-neutral-400">
                            {hasServerApiKey 
                              ? (isApiKeyHardcoded ? "API Key Grabada (Groq AI)" : "Conectado a Groq AI (Entorno)") 
                              : "Esperando configuración del servidor"}
                          </p>
                        </div>
                      </div>
                      <div className={cn(
                        "w-3 h-3 rounded-full animate-pulse",
                        hasServerApiKey ? "bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)]" : "bg-red-500"
                      )} />
                    </div>

                    <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-100 dark:border-neutral-800/50">
                      <p className="text-[10px] text-neutral-400 leading-relaxed italic">
                        La aplicación está configurada para usar la infraestructura del servidor automáticamente. No necesitas gestionar llaves API manualmente.
                      </p>
                    </div>

                    <div className="space-y-2 p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-100 dark:border-neutral-800/50">
                      <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                        <Key className="w-3.5 h-3.5" /> Groq API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKey ? "text" : "password"}
                          value={userApiKey}
                          onChange={(e) => setUserApiKey(e.target.value)}
                          placeholder="gsk_..."
                          className="w-full px-4 py-2 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all pr-10"
                        />
                        <button
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-blue-500 transition-colors"
                        >
                          {showApiKey ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-neutral-400">
                        Puedes cambiar la API Key aquí si es necesario. Se guarda localmente.
                      </p>
                    </div>

                    {hasGoogleConfig && (
                      <div className="space-y-3 p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-100 dark:border-neutral-800/50">
                        <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                          <Monitor className="w-3.5 h-3.5" /> Google Drive
                        </label>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center",
                              googleTokens ? "bg-green-100 dark:bg-green-900/30 text-green-600" : "bg-neutral-200 dark:bg-neutral-700 text-neutral-400"
                            )}>
                              <Monitor className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-neutral-700 dark:text-neutral-300">
                                {googleTokens ? "Conectado" : "Desconectado"}
                              </p>
                              <p className="text-[9px] text-neutral-400">
                                {googleTokens ? "Puedes guardar audios directamente" : "Conecta para guardar en la nube"}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={googleTokens ? handleGoogleLogout : handleGoogleLogin}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                              googleTokens 
                                ? "bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100" 
                                : "bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-500/20"
                            )}
                          >
                            {googleTokens ? "Desconectar" : "Conectar"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                    <div className="space-y-4 pt-6 border-t border-neutral-100 dark:border-neutral-800/50">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Diagnóstico</h3>
                      <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-100 dark:border-neutral-800/50 space-y-3">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-neutral-500">Nivel de Audio (VAD):</span>
                          <span className={cn("font-mono font-bold", audioLevel > 15 ? "text-green-500" : "text-neutral-400")}>
                            {audioLevel.toFixed(0)} / 255
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-neutral-500">Habla Detectada:</span>
                          <span className={cn("font-bold", hasDetectedSpeech ? "text-green-500" : "text-red-500")}>
                            {hasDetectedSpeech ? "SÍ" : "NO"}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-neutral-500">Dispositivo Activo:</span>
                          <span className="text-neutral-400 truncate max-w-[150px] text-right">
                            {availableDevices.find(d => d.deviceId === selectedDeviceId)?.label || "Predeterminado"}
                          </span>
                        </div>
                        <p className="text-[9px] text-neutral-400 italic leading-tight pt-1">
                          * Si el nivel no sube de 15 mientras hablas, intenta aumentar la Ganancia o cambiar el Micrófono.
                        </p>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-neutral-100 dark:border-neutral-800/50 flex justify-between items-center">
                      <button
                        onClick={() => {
                          if (confirm("¿Estás seguro de que quieres restablecer toda la configuración? Se borrará el historial y las preferencias.")) {
                            localStorage.clear();
                            window.location.reload();
                          }
                        }}
                        className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-600 transition-colors"
                      >
                        Restablecer Configuración
                      </button>
                      <button 
                        onClick={() => setShowSettings(false)}
                        className="px-6 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-opacity"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col items-center justify-center py-16 space-y-10">
          {/* Language Selector */}
          {!isRecording && !isTranscribing && !isCleaning && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Idioma de entrada</p>
              <div className="flex flex-wrap justify-center gap-2 max-w-2xl px-4">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setSourceLanguage(lang.code);
                      localStorage.setItem("source_language", lang.code);
                      playFeedbackSound('click');
                    }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border",
                      sourceLanguage === lang.code
                        ? "bg-blue-500 border-blue-500 text-white shadow-md shadow-blue-500/20 scale-105"
                        : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:border-blue-200"
                    )}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.label}</span>
                  </button>
                ))}
              </div>
              {sourceLanguage !== 'es' && (
                <p className="text-[9px] text-blue-500 font-bold uppercase tracking-widest animate-pulse">
                  Se traducirá automáticamente al español
                </p>
              )}
            </motion.div>
          )}

          {/* Refinement Mode Selector */}
          {!isRecording && !isTranscribing && !isCleaning && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex justify-center gap-2 mb-2 max-w-xl",
                isMobile ? "overflow-x-auto pb-4 px-4 w-full justify-start no-scrollbar" : "flex-wrap"
              )}
            >
              {REFINEMENT_MODES.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => {
                    setRefinementMode(mode.id);
                    localStorage.setItem("refinement_mode", mode.id);
                    playFeedbackSound('click');
                  }}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all duration-300 border shadow-sm shrink-0",
                    refinementMode === mode.id
                      ? "bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/20 scale-105"
                      : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-400 hover:border-blue-200 dark:hover:border-blue-900/50"
                  )}
                  title={mode.description}
                >
                  {mode.icon}
                  {mode.label}
                </button>
              ))}
            </motion.div>
          )}
          <AnimatePresence>
            {audioUrl && !isRecording && !isTranscribing && !isCleaning && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm"
              >
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <Volume2 className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Audio listo</span>
                  <span className="text-xs font-semibold truncate max-w-[200px]">{audioFileName}</span>
                </div>
                <div className="ml-2 w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative flex items-center gap-10">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="audio/*"
              className="hidden"
            />
            <AnimatePresence>
              {!isRecording && !isTranscribing && !isCleaning && (
                <div className="flex items-center gap-4">
                  <motion.button
                    initial={{ opacity: 0, x: -20, scale: 0.8 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -20, scale: 0.8 }}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-14 h-14 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-blue-500 hover:border-blue-200 dark:hover:border-blue-900/50 transition-all duration-300 shadow-sm group"
                    title="Subir audio"
                  >
                    <FileUp className="w-6 h-6 group-hover:scale-110 transition-transform" />
                  </motion.button>

                  {audioUrl && (
                    <motion.button
                      initial={{ opacity: 0, x: 20, scale: 0.8 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 20, scale: 0.8 }}
                      onClick={discardRecording}
                      className="w-14 h-14 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-red-500 hover:border-red-200 dark:hover:border-red-900/50 transition-all duration-300 shadow-sm group"
                      title="Descartar"
                    >
                      <RotateCcw className="w-6 h-6 group-hover:rotate-[-45deg] transition-transform" />
                    </motion.button>
                  )}
                </div>
              )}
            </AnimatePresence>

            <div className="relative group">
              <AnimatePresence>
                {isRecording && (
                  <>
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ 
                        scale: 1.2 + (audioLevel / 255) * 0.6, 
                        opacity: 0.2
                      }}
                      className="absolute inset-0 bg-red-500 rounded-full blur-2xl pulse-bg"
                    />
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 2.5, opacity: 0 }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                      className="absolute inset-0 bg-red-500/30 rounded-full"
                    />
                  </>
                )}
              </AnimatePresence>
              
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={isRecording ? stopRecording : audioUrl ? startTranscription : startRecording}
                disabled={isUploading || isTranscribing || isCleaning}
                aria-label={
                  isRecording 
                    ? "Detener grabación de audio" 
                    : audioUrl 
                      ? "Procesar y transcribir audio con Inteligencia Artificial" 
                      : "Iniciar grabación de audio"
                }
                className={cn(
                  "relative z-10 w-32 h-32 rounded-[2.5rem] flex flex-col items-center justify-center transition-all duration-500 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden border-4 border-white dark:border-neutral-900",
                  isRecording 
                    ? "bg-red-500 shadow-red-500/40" 
                    : audioUrl 
                      ? "bg-green-600 shadow-green-500/40" 
                      : "bg-blue-600 shadow-blue-500/40"
                )}
              >
                {isRecording && (
                  <motion.div 
                    className="absolute inset-0 bg-white/10"
                    animate={{ 
                      height: `${(audioLevel / 255) * 100}%` 
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                {isRecording ? (
                  <>
                    <Square className="w-10 h-10 text-white fill-current relative z-10" />
                    <span className="text-xs font-bold mt-2 uppercase tracking-wider text-white relative z-10">Detener</span>
                  </>
                ) : audioUrl ? (
                  <>
                    <Sparkles className="w-10 h-10 text-white" />
                    <span className="text-xs font-bold mt-2 uppercase tracking-wider text-white">Procesar</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-12 h-12 text-white" />
                    <span className="text-xs font-bold mt-2 uppercase tracking-wider text-white">Grabar</span>
                  </>
                )}
              </motion.button>
            </div>

            {/* Screen Reader Live Region for Voice / State Feedback */}
            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {isRecording 
                ? "Grabación en curso. Nivel de voz activo." 
                : isTranscribing 
                  ? "Transcribiendo audio con inteligencia artificial..." 
                  : isCleaning 
                    ? "Limpiando y refinando transcripción..." 
                    : audioUrl 
                      ? "Audio listo para procesar." 
                      : ""}
            </div>

            <AnimatePresence>
              {audioUrl && !isRecording && !isTranscribing && !isCleaning && (
                <motion.button
                  initial={{ opacity: 0, x: -20, scale: 0.8 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -20, scale: 0.8 }}
                  onClick={togglePlayback}
                  className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-sm border",
                    isPlaying 
                      ? "bg-blue-500 border-blue-500 text-white shadow-blue-500/20" 
                      : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-400 hover:text-blue-500 hover:border-blue-200 dark:hover:border-blue-900/50"
                  )}
                  title={isPlaying ? "Pausar" : "Escuchar"}
                >
                  {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          
          <div className="text-center space-y-4">
            <AnimatePresence>
              {showSilenceWarning && isRecording && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-xl px-4 py-2 flex items-center gap-2 text-amber-700 dark:text-amber-400 mx-auto w-fit shadow-sm"
                >
                  <Volume2 className="w-4 h-4 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-widest">No se detecta voz...</span>
                </motion.div>
              )}
              {recordingDuration > 840 && isRecording && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-xl px-4 py-2 flex items-center gap-2 text-red-700 dark:text-red-400 mx-auto w-fit shadow-sm"
                >
                  <AlertCircle className="w-4 h-4 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-widest">Límite de 15 min cerca ({formatTime(900 - recordingDuration)})</span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {audioUrl && !isRecording && !hasDetectedSpeech && !isTranscribing && !isCleaning && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl p-4 space-y-3 max-w-xs mx-auto shadow-sm"
                >
                  <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400 justify-center">
                    <Wind className="w-5 h-5" />
                    <p className="text-xs font-bold uppercase tracking-widest">Grabación silenciosa</p>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    No parece haber habla en esta grabación. Revisa el micrófono en Configuración o intenta procesarla de todos modos.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={discardRecording}
                      className="flex-1 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl text-[10px] font-bold uppercase tracking-widest text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                    >
                      Descartar
                    </button>
                    <button
                      onClick={startTranscription}
                      className="flex-1 py-2 bg-neutral-200 dark:bg-neutral-700 rounded-xl text-[10px] font-bold uppercase tracking-widest text-neutral-600 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                    >
                      Procesar igual
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-col items-center gap-3">
              <div className="h-8 flex items-center justify-center">
                <AnimatePresence mode="wait">
                  {isRecording ? (
                    <motion.div
                      key="recording-status"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="flex flex-col items-center gap-1"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-xl font-mono font-bold tracking-tighter text-red-500 tabular-nums">
                            {formatTime(recordingDuration)}
                          </span>
                        </div>
                        <div className="flex items-end gap-1 h-4">
                          {[...Array(6)].map((_, i) => (
                            <div 
                              key={i} 
                              className="waveform-bar w-0.5 bg-red-500/40" 
                              style={{ 
                                animationDelay: `${i * 0.1}s`,
                                height: '100%'
                              }} 
                            />
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="status-text"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "text-lg font-bold tracking-tight",
                        isUploading || isTranscribing || isCleaning ? "text-blue-500" : "text-neutral-800 dark:text-white"
                      )}
                    >
                      {isUploading ? "Subiendo..." : isTranscribing ? "Transcribiendo..." : isCleaning ? "Limpiando texto..." : audioUrl ? "Grabación lista" : "Listo para grabar"}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="max-w-xs mx-auto space-y-1.5">
              <p className="text-sm text-neutral-600 dark:text-neutral-300 font-medium leading-relaxed">
                {isRecording 
                  ? "Habla con claridad, estamos capturando cada palabra." 
                  : audioUrl && !isUploading && !isTranscribing && !isCleaning 
                    ? "Revisa tu audio o procésalo con Inteligencia Artificial." 
                    : "Tus ideas, convertidas en texto perfecto al instante."}
              </p>
              {!isMobile && !isRecording && !audioUrl && (
                <p className="text-xs text-neutral-400 dark:text-neutral-500 font-medium">
                  Atajo: pulsa <kbd className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-[11px] font-mono font-semibold text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-700">Espacio</kbd> o <kbd className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-[11px] font-mono font-semibold text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-700">G</kbd> para grabar
                </p>
              )}
            </div>
          </div>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-2xl p-4 flex items-start gap-3 text-red-700 dark:text-red-400"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">Ocurrió un error</p>
              <p className="text-sm opacity-90">{error}</p>
              {errorSuggestion && (
                <div className="mt-2 p-2 bg-red-100/50 dark:bg-red-900/40 rounded-lg border border-red-200/50 dark:border-red-800/50">
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-1">Sugerencia:</p>
                  <p className="text-xs italic leading-relaxed">{errorSuggestion}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Transcription Area */}
        <div className={cn(
          "space-y-4",
          isMobile && activeView !== 'record' && "hidden"
        )}>
          <div className={cn(
            "flex items-center justify-between px-1",
            isMobile && "flex-col gap-4 items-stretch"
          )}>
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Resultado</h3>
              {isDraftRecovered && (rawTranscription || cleanTranscription) && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-[9px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
                  <Bookmark className="w-2.5 h-2.5" />
                  Borrador
                </div>
              )}
              {rawTranscription && cleanTranscription && (
                <button
                  onClick={() => setShowComparison(!showComparison)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all",
                    showComparison 
                      ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20" 
                      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                  )}
                >
                  <Sparkles className="w-3 h-3" />
                  {showComparison ? "Vista Normal" : "Comparar"}
                </button>
              )}
              <AnimatePresence mode="wait">
                {isSaving ? (
                  <motion.div
                    key="saving"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-blue-500/80 uppercase tracking-widest bg-blue-50/50 dark:bg-blue-500/10 px-2 py-1 rounded-full border border-blue-100/50 dark:border-blue-500/20"
                  >
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Guardando cambios...
                  </motion.div>
                ) : showSavedStatus && (
                  <motion.div
                    key="saved"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-green-600/80 uppercase tracking-widest bg-green-50/50 dark:bg-green-500/10 px-2 py-1 rounded-full border border-green-100/50 dark:border-green-500/20"
                  >
                    <Check className="w-3 h-3" />
                    Cambios guardados
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-2">
              {cleanTranscription && (
                <button
                  onClick={() => setIsPresentationMode(true)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-500 dark:text-neutral-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
                  title="Modo Presentación (Lectura inmersiva)"
                  aria-label="Activar modo lectura"
                >
                  <Maximize2 className="w-5 h-5" />
                </button>
              )}
              {audioUrl && (rawTranscription || cleanTranscription) && (
                <button
                  onClick={insertTimestamp}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-500 dark:text-neutral-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
                  title="Insertar marcador de tiempo actual"
                  aria-label="Insertar marca de tiempo en el texto"
                >
                  <Clock className="w-5 h-5" />
                </button>
              )}
              {(rawTranscription || cleanTranscription) && (
                <button
                  onClick={saveToHistory}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-500 dark:text-neutral-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
                  title="Guardar versión en historial"
                  aria-label="Guardar versión actual en historial"
                >
                  <History className="w-5 h-5" />
                </button>
              )}
              {(rawTranscription || cleanTranscription) && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-500 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                  title="Limpiar todo"
                  aria-label="Limpiar transcripción actual"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  disabled={!rawTranscription && !cleanTranscription}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-500 dark:text-neutral-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors disabled:opacity-50"
                  title="Exportar"
                  aria-label="Opciones de exportación"
                  aria-expanded={showExportMenu}
                >
                  <Download className="w-5 h-5" />
                </button>
                
                <AnimatePresence>
                  {showExportMenu && (
                    <>
                      <div 
                        className="fixed inset-0 z-20" 
                        onClick={() => setShowExportMenu(false)} 
                      />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xl z-30 py-2 overflow-hidden"
                      >
                        <div className="px-3 py-1.5 text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Texto Limpio</div>
                        <button
                          onClick={() => exportFile('txt', 'clean')}
                          className="w-full px-4 py-2.5 min-h-[44px] text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 flex items-center gap-2"
                        >
                          <FileText className="w-4 h-4 text-neutral-400" /> Exportar .txt
                        </button>
                        <button
                          onClick={() => exportFile('md', 'clean')}
                          className="w-full px-4 py-2.5 min-h-[44px] text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 flex items-center gap-2"
                        >
                          <FileCode className="w-4 h-4 text-neutral-400" /> Exportar .md
                        </button>
                        <button
                          onClick={() => exportFile('pdf', 'clean')}
                          className="w-full px-4 py-2.5 min-h-[44px] text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 flex items-center gap-2"
                        >
                          <FileText className="w-4 h-4 text-neutral-400" /> Exportar .pdf
                        </button>
                        
                        <div className="h-px bg-neutral-100 dark:bg-neutral-800 my-1" />
                        
                        <div className="px-3 py-1.5 text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Original</div>
                        <button
                          onClick={() => exportFile('txt', 'raw')}
                          className="w-full px-4 py-2.5 min-h-[44px] text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 flex items-center gap-2"
                        >
                          <FileText className="w-4 h-4 text-neutral-400" /> Exportar .txt
                        </button>
                        <button
                          onClick={() => exportFile('md', 'raw')}
                          className="w-full px-4 py-2.5 min-h-[44px] text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 flex items-center gap-2"
                        >
                          <FileCode className="w-4 h-4 text-neutral-400" /> Exportar .md
                        </button>
                        <button
                          onClick={() => exportFile('pdf', 'raw')}
                          className="w-full px-4 py-2.5 min-h-[44px] text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 flex items-center gap-2"
                        >
                          <FileText className="w-4 h-4 text-neutral-400" /> Exportar .pdf
                        </button>

                        {hasGoogleConfig && (
                          <>
                            <div className="h-px bg-neutral-100 dark:bg-neutral-800 my-1" />
                            <div className="px-3 py-1.5 text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Google Workspace</div>
                            <button
                              onClick={() => {
                                setShowExportMenu(false);
                                exportToGoogleDocs();
                              }}
                              className="w-full px-4 py-2.5 min-h-[44px] text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 flex items-center gap-2"
                            >
                              <FileText className="w-4 h-4 text-blue-500" /> Exportar a Google Doc
                            </button>
                            <button
                              onClick={() => {
                                setShowExportMenu(false);
                                if (googleTokens) uploadToDrive();
                                else handleGoogleLogin();
                              }}
                              disabled={isUploadingToDrive || !audioBlob}
                              className="w-full px-4 py-2.5 min-h-[44px] text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 flex items-center gap-2 disabled:opacity-50"
                            >
                              {isUploadingToDrive ? (
                                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                              ) : (
                                <Monitor className={cn("w-4 h-4", googleTokens ? "text-green-500" : "text-neutral-400")} />
                              )}
                              {googleTokens ? "Guardar Audio en Drive" : "Conectar Drive"}
                            </button>
                            {googleTokens && (
                              <button
                                onClick={() => {
                                  setShowExportMenu(false);
                                  handleGoogleLogout();
                                }}
                                className="w-full px-4 py-2.5 min-h-[44px] text-left text-xs hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 flex items-center gap-2"
                              >
                                <X className="w-3.5 h-3.5" /> Desconectar Google
                              </button>
                            )}
                          </>
                        )}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={copyToClipboard}
                disabled={!rawTranscription && !cleanTranscription}
                className={cn(
                  "min-h-[44px] flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
                  copied ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50"
                )}
                aria-label="Copiar texto al portapapeles"
              >
                <AnimatePresence mode="wait">
                  {copied ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <Check className="w-4 h-4" /> Copiado
                    </motion.div>
                  ) : (
                    <motion.div
                      key="copy"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <Copy className="w-4 h-4" /> Copiar
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={copyAllToClipboard}
                disabled={!rawTranscription || !cleanTranscription}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                  copiedAll ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50"
                )}
              >
                <AnimatePresence mode="wait">
                  {copiedAll ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <Check className="w-4 h-4" /> Todo Copiado
                    </motion.div>
                  ) : (
                    <motion.div
                      key="copy"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <Copy className="w-4 h-4" /> Copiar Todo
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={copyRawToClipboard}
                disabled={!rawTranscription}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                  copiedRaw ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50"
                )}
              >
                <AnimatePresence mode="wait">
                  {copiedRaw ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <Check className="w-4 h-4" /> Copiado
                    </motion.div>
                  ) : (
                    <motion.div
                      key="copy"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <Clipboard className="w-4 h-4" /> Copy Raw
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>

              <button
                onClick={() => exportFile('txt', cleanTranscription ? 'clean' : 'raw')}
                disabled={!rawTranscription && !cleanTranscription}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 transition-all"
                title="Exportar como .txt"
              >
                <FileDown className="w-4 h-4" /> .txt
              </button>

              <button
                onClick={() => exportFile('md', cleanTranscription ? 'clean' : 'raw')}
                disabled={!rawTranscription && !cleanTranscription}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 transition-all"
                title="Exportar como .md"
              >
                <FileCode className="w-4 h-4" /> .md
              </button>

              <button
                onClick={() => exportFile('pdf', cleanTranscription ? 'clean' : 'raw')}
                disabled={!rawTranscription && !cleanTranscription}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 transition-all"
                title="Exportar como .pdf"
              >
                <FileText className="w-4 h-4" /> .pdf
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200/50 dark:border-neutral-800/50 rounded-[2.5rem] shadow-2xl shadow-neutral-200/40 dark:shadow-none overflow-hidden min-h-[400px] flex flex-col transition-all">
            <div className="p-10 flex-1 relative">
              <AnimatePresence>
                {(isUploading || isTranscribing || (isCleaning && !rawTranscription)) && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-white/90 dark:bg-neutral-950/90 backdrop-blur-md flex flex-col items-center justify-center z-30"
                  >
                    <div className="relative mb-8">
                      <div className="w-20 h-20 border-4 border-blue-500/20 rounded-full animate-pulse" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                      </div>
                    </div>
                    <div className="text-center space-y-2">
                      <p className="text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-[0.2em]">
                        {isUploading ? "Subiendo Audio" : isTranscribing ? "Procesando Audio" : "Refinando Texto"}
                      </p>
                      <p className="text-xs text-neutral-400 font-medium">Esto tomará solo unos segundos...</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {isCleaning && rawTranscription && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-4 right-10 z-20 flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-blue-500/20"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Refinando...
                </motion.div>
              )}

              {/* Active Term Validation Banner */}
              {doubtfulWords.length > 0 && (
                <div className="mb-6 p-4 bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center font-bold text-sm shrink-0">
                      <Bookmark className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                          Revisión Activa de Términos ({doubtfulWords.length})
                        </span>
                        <span className="text-[9px] px-2 py-0.5 bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-200 font-bold rounded-full uppercase">
                          Modo {validationMode === 'realtime' ? 'Nota Corta' : 'Pensamiento Largo'}
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        Haz clic en cualquiera de los términos dudosos identificados por la IA para escuchar su audio original y corregirlo.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => setValidationMode(prev => prev === 'realtime' ? 'final' : 'realtime')}
                      className="px-3 py-1.5 bg-white dark:bg-neutral-800 border border-amber-200 dark:border-amber-800 rounded-xl text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider hover:bg-amber-100 transition-colors"
                    >
                      Modo: {validationMode === 'realtime' ? 'Nota Corta' : 'Pensamiento Largo'}
                    </button>
                    <button
                      onClick={() => setDoubtfulWords([])}
                      className="p-1.5 text-amber-500 hover:text-amber-700 transition-colors"
                      title="Ocultar alertas"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Selected Doubtful Word Inspector */}
              {selectedDoubtfulWord && (
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> Término Seleccionado: <span className="underline decoration-amber-500 text-neutral-900 dark:text-white font-extrabold">{selectedDoubtfulWord.word}</span>
                    </span>
                    <button
                      onClick={() => setSelectedDoubtfulWord(null)}
                      className="text-neutral-400 hover:text-neutral-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {selectedDoubtfulWord.reason && (
                    <p className="text-[11px] text-neutral-600 dark:text-neutral-300 italic">
                      Motivo: {selectedDoubtfulWord.reason}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      onClick={() => {
                        if (wavesurferRef.current) {
                          wavesurferRef.current.setTime(selectedDoubtfulWord.start);
                          wavesurferRef.current.play();
                        }
                      }}
                      className="px-3 py-1.5 bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/20"
                    >
                      <Play className="w-3.5 h-3.5" /> Escuchar Audio ({selectedDoubtfulWord.start.toFixed(1)}s - {selectedDoubtfulWord.end.toFixed(1)}s)
                    </button>
                    <button
                      onClick={() => {
                        addToGlossary(selectedDoubtfulWord.word);
                        setSelectedDoubtfulWord(null);
                      }}
                      className="px-3 py-1.5 bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-500/20"
                    >
                      <Bookmark className="w-3.5 h-3.5" /> + Añadir al Glosario
                    </button>
                  </div>
                </div>
              )}

              {!rawTranscription && !isTranscribing && !isCleaning && (
                <div className="h-full flex flex-col items-center justify-center text-neutral-300 dark:text-neutral-700 py-20 px-6">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-32 h-32 bg-neutral-50 dark:bg-neutral-900/50 rounded-[3rem] flex items-center justify-center mb-10 relative"
                  >
                    <div className="absolute inset-0 bg-blue-500/5 rounded-[3rem] blur-2xl animate-pulse" />
                    <Sparkles className="w-16 h-16 text-blue-500/20 relative z-10" />
                  </motion.div>
                  <h3 className="text-2xl font-bold text-neutral-800 dark:text-neutral-200 tracking-tight">Tu lienzo en blanco</h3>
                  <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-3 max-w-[280px] text-center leading-relaxed font-medium">
                    Graba tus pensamientos o sube un audio para ver cómo la IA los transforma en texto perfecto.
                  </p>
                  <div className="mt-12 grid grid-cols-2 gap-4 w-full max-w-sm">
                    <div className="p-4 rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 flex flex-col items-center gap-2">
                      <Mic className="w-5 h-5 text-neutral-300" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Graba Voz</span>
                    </div>
                    <div className="p-4 rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 flex flex-col items-center gap-2">
                      <FileUp className="w-5 h-5 text-neutral-300" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Sube Audio</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-8">
                {isMobile && (rawTranscription || cleanTranscription) && (
                  <div className="flex p-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-[1.25rem] mb-6 shadow-inner">
                    <button
                      onClick={() => setMobileTab('refined')}
                      className={cn(
                        "flex-1 py-3 text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all duration-300",
                        mobileTab === 'refined' ? "bg-white dark:bg-neutral-700 text-blue-500 shadow-md scale-[1.02]" : "text-neutral-400 hover:text-neutral-600"
                      )}
                    >
                      Refinado
                    </button>
                    <button
                      onClick={() => setMobileTab('original')}
                      className={cn(
                        "flex-1 py-3 text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all duration-300",
                        mobileTab === 'original' ? "bg-white dark:bg-neutral-700 text-blue-500 shadow-md scale-[1.02]" : "text-neutral-400 hover:text-neutral-600"
                      )}
                    >
                      Original
                    </button>
                    {(summary || keyPoints.length > 0) && (
                      <button
                        onClick={() => setMobileTab('summary')}
                        className={cn(
                          "flex-1 py-3 text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all duration-300",
                          mobileTab === 'summary' ? "bg-white dark:bg-neutral-700 text-blue-500 shadow-md scale-[1.02]" : "text-neutral-400 hover:text-neutral-600"
                        )}
                      >
                        Resumen
                      </button>
                    )}
                  </div>
                )}

                {showComparison && rawTranscription && cleanTranscription && !isMobile ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Original</span>
                      </div>
                      <div className="p-6 bg-neutral-50 dark:bg-neutral-900/50 rounded-3xl border border-neutral-100 dark:border-neutral-800 text-lg leading-relaxed text-neutral-600 dark:text-neutral-400 italic">
                        {renderInteractiveWords(transcriptionWords, rawTranscription, true)}
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Refinado</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => setIsPresentationMode(true)}
                            className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-blue-500 transition-colors flex items-center gap-1"
                            title="Modo Presentación"
                          >
                            <Maximize2 className="w-3 h-3" /> Presentar
                          </button>
                          {audioUrl && (
                            <button
                              onClick={insertTimestamp}
                              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase tracking-widest hover:bg-blue-200 dark:hover:bg-blue-800 transition-all"
                              title="Insertar marcador de tiempo actual"
                            >
                              <Clock className="w-3 h-3" />
                              {formatTime(currentTime)}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="p-8 bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-200/60 dark:border-neutral-800/60 text-lg leading-relaxed text-neutral-800 dark:text-neutral-100 font-medium shadow-[0_10px_40px_rgba(0,0,0,0.02)] dark:shadow-none whitespace-pre-wrap relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-green-500/20" />
                        {renderTextWithMarkers(cleanTranscription)}
                      </div>
                    </motion.div>
                  </div>
                ) : (
                  <>
                    {cleanTranscription && (!isMobile || mobileTab === 'refined') && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="prose prose-neutral dark:prose-invert max-w-none"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Texto Refinado</span>
                            {audioUrl && (
                              <button
                                onClick={insertTimestamp}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase tracking-widest hover:bg-blue-200 dark:hover:bg-blue-800 transition-all ml-2"
                                title="Insertar marcador de tiempo actual"
                              >
                                <Clock className="w-3 h-3" />
                                {formatTime(currentTime)}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {cleanTranscription && !summary && (
                            <button
                              onClick={() => generateSummary(cleanTranscription)}
                              disabled={isGeneratingSummary}
                              className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-blue-500 transition-colors flex items-center gap-1 disabled:opacity-50"
                              title="Generar resumen con IA"
                            >
                              {isGeneratingSummary ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                              Resumir
                            </button>
                          )}
                          <button
                            onClick={() => setIsPresentationMode(true)}
                            className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-blue-500 transition-colors flex items-center gap-1"
                            title="Modo Presentación"
                          >
                            <Maximize2 className="w-3 h-3" /> Presentar
                          </button>
                          <button
                            onClick={() => setIsEditingClean(!isEditingClean)}
                            className="text-[10px] font-bold uppercase tracking-widest text-green-600 hover:text-green-700 transition-colors"
                          >
                            {isEditingClean ? "Ver interactivo" : "Editar texto"}
                          </button>
                        </div>
                        
                        {isEditingClean ? (
                          <div className="relative group">
                            <textarea
                              ref={textareaRef}
                              value={cleanTranscription}
                              onChange={(e) => {
                                setCleanTranscription(e.target.value);
                                setIsCleanEdited(true);
                              }}
                              className="w-full text-2xl leading-relaxed text-neutral-800 dark:text-neutral-100 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-10 focus:ring-4 focus:ring-blue-500/5 outline-none resize-none font-medium tracking-tight min-h-[300px] shadow-[0_20px_50px_rgba(0,0,0,0.02)] dark:shadow-none transition-all"
                              placeholder="Edita el texto aquí..."
                            />
                            <div className="absolute bottom-6 right-8 text-[10px] font-bold text-neutral-300 uppercase tracking-widest pointer-events-none group-focus-within:text-blue-500/40 transition-colors">
                              Modo Edición
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-10">
                            <div className="text-2xl leading-relaxed text-neutral-800 dark:text-neutral-100 font-medium tracking-tight whitespace-pre-wrap p-2 selection:bg-blue-500/20">
                              {renderTextWithMarkers(cleanTranscription)}
                            </div>

                            {/* Summary & Key Points Section */}
                            <AnimatePresence>
                              {isGeneratingSummary && (
                                <motion.div
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -10 }}
                                  className="p-8 bg-neutral-50 dark:bg-neutral-900/50 rounded-[2.5rem] border border-neutral-100 dark:border-neutral-800 flex items-center justify-center gap-3"
                                >
                                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                                  <span className="text-sm font-bold uppercase tracking-widest text-neutral-400">Generando resumen con IA...</span>
                                </motion.div>
                              )}
                              {(summary || keyPoints.length > 0) && !isMobile && (
                                <motion.div
                                  initial={{ opacity: 0, y: 20 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="p-8 bg-blue-50/50 dark:bg-blue-900/10 rounded-[2.5rem] border border-blue-100/50 dark:border-blue-900/20 space-y-6"
                                >
                                  <div className="flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-blue-500" />
                                    <h4 className="text-sm font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Resumen IA</h4>
                                  </div>
                                  
                                  {summary && (
                                    <p className="text-lg text-neutral-700 dark:text-neutral-300 leading-relaxed font-medium">
                                      {summary}
                                    </p>
                                  )}

                                  {keyPoints.length > 0 && (
                                    <div className="space-y-3">
                                      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Puntos Clave</p>
                                      <ul className="space-y-2">
                                        {keyPoints.map((point, i) => (
                                          <li key={i} className="flex items-start gap-3 text-neutral-600 dark:text-neutral-400">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
                                            <span className="text-base">{point}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </motion.div>
                    )}

                    {rawTranscription && (!isMobile || mobileTab === 'original') && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "prose prose-neutral dark:prose-invert max-w-none transition-all duration-500",
                          cleanTranscription && !isMobile ? "opacity-30 blur-[0.5px] hover:opacity-100 hover:blur-0" : "opacity-100"
                        )}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Transcripción Original</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <button
                              onClick={downloadRawTranscription}
                              className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-blue-500 transition-colors flex items-center gap-1"
                              title="Descargar transcripción original (.txt)"
                            >
                              <FileDown className="w-3 h-3" /> Descargar TXT
                            </button>
                            <button
                              onClick={() => setIsEditingRaw(!isEditingRaw)}
                              className="text-[10px] font-bold uppercase tracking-widest text-blue-500 hover:text-blue-600 transition-colors"
                            >
                              {isEditingRaw ? "Ver interactivo" : "Editar original"}
                            </button>
                          </div>
                        </div>
                        
                        {isEditingRaw ? (
                          <textarea
                            value={rawTranscription}
                            onChange={(e) => {
                              setRawTranscription(e.target.value);
                              setIsRawEdited(true);
                              // Clear words if raw text is manually edited to avoid sync issues
                              if (transcriptionWords.length > 0) setTranscriptionWords([]);
                            }}
                            className="w-full text-lg leading-relaxed text-neutral-800 dark:text-neutral-200 bg-transparent border-none focus:ring-0 p-0 resize-none"
                            rows={Math.max(3, rawTranscription.split('\n').length)}
                            placeholder="Edita la transcripción original..."
                          />
                        ) : (
                          <p className={cn(
                            "leading-relaxed text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap",
                            cleanTranscription ? "text-lg" : "text-2xl font-medium tracking-tight"
                          )}>
                            {renderInteractiveWords(transcriptionWords, rawTranscription)}
                          </p>
                        )}
                      </motion.div>
                    )}

                    {isMobile && mobileTab === 'summary' && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-8"
                      >
                        {isGeneratingSummary && (
                          <div className="p-6 bg-neutral-50 dark:bg-neutral-900/50 rounded-3xl border border-neutral-100 dark:border-neutral-800 flex items-center justify-center gap-3">
                            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                            <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">Generando resumen...</span>
                          </div>
                        )}
                        {(summary || keyPoints.length > 0) && (
                          <div className="p-6 bg-blue-50/50 dark:bg-blue-900/10 rounded-3xl border border-blue-100/50 dark:border-blue-900/20 space-y-6"
                          >
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-5 h-5 text-blue-500" />
                              <h4 className="text-sm font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Resumen IA</h4>
                            </div>
                            
                            {summary && (
                              <p className="text-lg text-neutral-700 dark:text-neutral-300 leading-relaxed font-medium">
                                {summary}
                              </p>
                            )}

                            {keyPoints.length > 0 && (
                              <div className="space-y-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Puntos Clave</p>
                                <ul className="space-y-2">
                                  {keyPoints.map((point, i) => (
                                    <li key={i} className="flex items-start gap-3 text-neutral-600 dark:text-neutral-400">
                                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
                                      <span className="text-base">{point}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </>
                )}

                {audioUrl && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-12 p-6 bg-neutral-50 dark:bg-neutral-900/50 rounded-3xl border border-neutral-100 dark:border-neutral-800 flex flex-col gap-6"
                  >
                    <div className="flex items-center gap-6">
                      <button
                        onClick={togglePlayback}
                        disabled={isAudioLoading}
                        className={cn(
                          "w-14 h-14 bg-blue-500 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/20 hover:bg-blue-600 transition-all duration-300 shrink-0 group disabled:opacity-50",
                          isAudioLoading && "animate-pulse"
                        )}
                      >
                        {isAudioLoading ? (
                          <Loader2 className="w-6 h-6 animate-spin" />
                        ) : isPlaying ? (
                          <Pause className="w-6 h-6 group-hover:scale-110 transition-transform" />
                        ) : (
                          <Play className="w-6 h-6 ml-1 group-hover:scale-110 transition-transform" />
                        )}
                      </button>
                      
                      <div className="flex-1 space-y-3">
                        <div className="flex justify-between items-end">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Reproducción</span>
                              {isPlaying && (
                                <motion.div 
                                  animate={{ scale: [1, 1.2, 1] }}
                                  transition={{ repeat: Infinity, duration: 1 }}
                                  className="w-1.5 h-1.5 rounded-full bg-blue-500" 
                                />
                              )}
                            </div>
                            <div className="text-sm font-bold text-neutral-700 dark:text-neutral-300 tabular-nums">
                              {formatTime(currentTime)} <span className="text-neutral-400 font-medium mx-1">/</span> {formatTime(duration)}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => setIsEditingAudio(!isEditingAudio)}
                              className={cn(
                                "p-2 transition-colors flex items-center gap-2 rounded-lg",
                                isEditingAudio 
                                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" 
                                  : "text-neutral-400 hover:text-blue-500 dark:hover:text-blue-400"
                              )}
                              title={isEditingAudio ? "Cancelar edición" : "Editar audio (recortar/eliminar)"}
                            >
                              <Activity className="w-4 h-4" />
                              <span className="text-[10px] font-bold uppercase tracking-widest">{isEditingAudio ? "Editando" : "Editar"}</span>
                            </button>
                            <button 
                              onClick={downloadAudio}
                              className="p-2 text-neutral-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                              title="Descargar audio"
                            >
                              <Download className="w-4 h-4" />
                            </button>

                            {hasGoogleConfig && (
                              <button 
                                onClick={googleTokens ? uploadToDrive : handleGoogleLogin}
                                disabled={isUploadingToDrive}
                                className={cn(
                                  "p-2 transition-colors flex items-center gap-2 rounded-lg",
                                  googleTokens 
                                    ? "text-neutral-400 hover:text-green-500 dark:hover:text-green-400" 
                                    : "text-neutral-400 hover:text-blue-500 dark:hover:text-blue-400"
                                )}
                                title={googleTokens ? "Guardar en Google Drive" : "Conectar con Google Drive"}
                              >
                                {isUploadingToDrive ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Monitor className={cn("w-4 h-4", googleTokens && "text-green-500")} />
                                )}
                                <span className="text-[10px] font-bold uppercase tracking-widest">
                                  {isUploadingToDrive ? "Subiendo..." : googleTokens ? "Drive" : "Conectar Drive"}
                                </span>
                              </button>
                            )}

                            <button 
                              onClick={() => {
                                if (wavesurferRef.current) {
                                  wavesurferRef.current.setTime(Math.max(0, wavesurferRef.current.getCurrentTime() - 5));
                                }
                              }}
                              className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                              title="Retroceder 5s"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>

                            <button 
                              onClick={async () => {
                                if (!audioBlob) return;
                                setIsDenoising(true);
                                playFeedbackSound('click');
                                try {
                                  const denoised = await denoiseAudio(audioBlob);
                                  const url = URL.createObjectURL(denoised);
                                  setAudioBlob(denoised);
                                  setAudioUrl(url);
                                  toast.success("Ruido reducido con éxito");
                                } catch (e) {
                                  toast.error("Error al reducir ruido");
                                } finally {
                                  setIsDenoising(false);
                                }
                              }}
                              disabled={isDenoising || !audioBlob}
                              className={cn(
                                "p-2 rounded-lg transition-all",
                                isDenoising 
                                  ? "text-blue-500 bg-blue-50 dark:bg-blue-900/20" 
                                  : "text-neutral-400 hover:text-blue-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                              )}
                              title="Reducción de Ruido Pro"
                            >
                              {isDenoising ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wind className="w-4 h-4" />}
                            </button>
                            <div className="flex items-center gap-1 px-2 py-1 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 shadow-sm">
                              <Activity className={cn("w-3 h-3", isPlaying ? "text-blue-500" : "text-neutral-400")} />
                              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                                {isPlaying ? "En vivo" : "Pausado"}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="relative">
                          {isAudioLoading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-neutral-50/50 dark:bg-neutral-900/50 z-10 rounded-xl">
                              <div className="flex gap-1">
                                {[1, 2, 3].map(i => (
                                  <motion.div
                                    key={i}
                                    animate={{ height: [4, 12, 4] }}
                                    transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                                    className="w-1 bg-blue-500 rounded-full"
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          <div 
                            ref={waveformContainerRef} 
                            className="w-full h-[60px] transition-all duration-300 hover:bg-neutral-50 dark:hover:bg-white/5 rounded-xl cursor-pointer hover:scale-[1.01] hover:shadow-sm border border-transparent hover:border-neutral-100 dark:hover:border-neutral-800" 
                          />
                        </div>

                        <AnimatePresence>
                          {isEditingAudio && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="flex flex-col gap-3 pt-2">
                                {(rawTranscription || cleanTranscription) && (
                                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-xl text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                    <AlertCircle className="w-3 h-3" />
                                    <span>Editar el audio puede desincronizar la transcripción actual.</span>
                                  </div>
                                )}
                                <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-widest">
                                  {activeRegion 
                                    ? `Selección: ${activeRegion.start.toFixed(2)}s - ${activeRegion.end.toFixed(2)}s (${(activeRegion.end - activeRegion.start).toFixed(2)}s)`
                                    : "Arrastra sobre la onda para seleccionar una sección"}
                                </p>
                                
                                {activeRegion && (
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => processAudioAction('trim')}
                                      disabled={isProcessingAudio}
                                      className="flex-1 py-2 bg-blue-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-blue-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                      {isProcessingAudio ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                      Mantener selección (Recortar)
                                    </button>
                                    <button
                                      onClick={() => processAudioAction('delete')}
                                      disabled={isProcessingAudio}
                                      className="flex-1 py-2 bg-red-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                      {isProcessingAudio ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                      Eliminar selección
                                    </button>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
            
            {(rawTranscription || cleanTranscription) && (
              <div className="bg-neutral-50/50 dark:bg-neutral-900/50 px-10 py-6 border-t border-neutral-100 dark:border-neutral-800/50 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Palabras</span>
                    <span className="text-sm font-bold text-neutral-700 dark:text-neutral-300">
                      {(cleanTranscription || rawTranscription).split(/\s+/).filter(Boolean).length}
                    </span>
                  </div>
                  <div className="w-px h-8 bg-neutral-200 dark:bg-neutral-800" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Estado</span>
                    <span className="text-sm font-bold text-green-500">Completado</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {(rawTranscription || cleanTranscription) && (
                    <button
                      onClick={saveToHistory}
                      className="p-3 text-neutral-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-2xl transition-all"
                      title="Guardar versión en historial"
                    >
                      <History className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={clearAll}
                    className="p-3 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-2xl transition-all"
                    title="Limpiar todo"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* History Section */}
        {history.length > 0 && (
          <div className={cn(
            "space-y-6",
            isMobile && activeView !== 'history' && "hidden",
            isMobile && "fixed inset-0 z-[55] bg-white dark:bg-neutral-950 p-6 overflow-y-auto pb-32"
          )}>
            <div className={cn(
              "flex items-center justify-between px-1",
              isMobile && "sticky top-0 z-10 bg-white dark:bg-neutral-950 py-4 mb-4 border-b border-neutral-100 dark:border-neutral-800"
            )}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center">
                  <History className="w-4 h-4 text-neutral-500" />
                </div>
                <h3 className="font-bold text-neutral-800 dark:text-white">Historial</h3>
              </div>
              <div className="flex items-center gap-2">
                {isMobile && (
                  <button
                    onClick={() => setActiveView('record')}
                    className="p-3 text-neutral-400 hover:text-blue-500 transition-colors"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                )}
                {!isMobile && (
                  <button
                    onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
                    className={cn(
                      "p-2 rounded-xl transition-all flex items-center gap-2 border",
                      showOnlyFavorites 
                        ? "bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/20" 
                        : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-400 hover:text-blue-500"
                    )}
                    title="Ver solo favoritos"
                  >
                    <Bookmark className={cn("w-4 h-4", showOnlyFavorites && "fill-current")} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Favoritos</span>
                  </button>
                )}
              </div>
            </div>
            
            {isMobile && (
              <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl mb-4">
                <button
                  onClick={() => setShowOnlyFavorites(false)}
                  className={cn(
                    "flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                    !showOnlyFavorites ? "bg-white dark:bg-neutral-700 text-blue-500 shadow-sm" : "text-neutral-400"
                  )}
                >
                  Todos
                </button>
                <button
                  onClick={() => setShowOnlyFavorites(true)}
                  className={cn(
                    "flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                    showOnlyFavorites ? "bg-white dark:bg-neutral-700 text-blue-500 shadow-sm" : "text-neutral-400"
                  )}
                >
                  Favoritos
                </button>
              </div>
            )}
            {!isMobile && (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => toggleAllHistory(expandedItems.size < filteredHistory.length)}
                  className="text-xs font-bold text-blue-500 hover:text-blue-600 uppercase tracking-widest"
                >
                  {expandedItems.size < filteredHistory.length ? "Expandir todo" : "Colapsar todo"}
                </button>
                <button
                  onClick={() => setShowHistoryClearConfirm(true)}
                  className="text-xs font-bold text-neutral-400 hover:text-red-500 uppercase tracking-widest transition-colors"
                >
                  Borrar
                </button>
              </div>
            )}
            
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Buscar en tus transcripciones..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white dark:bg-neutral-900 border border-neutral-200/50 dark:border-neutral-800/50 rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
              />
            </div>

            <div className="grid gap-4">
              <AnimatePresence initial={false}>
                {filteredHistory.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-neutral-400 font-medium">No se encontraron resultados para "{searchQuery}"</p>
                  </div>
                ) : (
                  filteredHistory.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="group bg-white dark:bg-neutral-900 border border-neutral-200/50 dark:border-neutral-800/50 rounded-2xl overflow-hidden hover:shadow-md transition-all"
                    >
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-md">
                                {item.clean ? "Limpio" : "Original"}
                              </span>
                              {editingSummaryId === item.id && (
                                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-md animate-pulse">
                                  Borrador
                                </span>
                              )}
                              <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium">
                                <Calendar className="w-3 h-3" />
                                {formatDate(item.timestamp)}
                              </div>
                            </div>
                            <p className={cn(
                              "text-neutral-700 dark:text-neutral-300 leading-relaxed transition-all",
                              expandedItems.has(item.id) ? "" : "line-clamp-2"
                            )}>
                              {item.clean || item.raw}
                            </p>
                          </div>
                          <div className={cn(
                            "flex items-center gap-1",
                            isMobile && "gap-2 pt-2"
                          )}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavorite(item.id);
                              }}
                              className={cn(
                                "p-2.5 rounded-xl transition-all",
                                item.isFavorite 
                                  ? "text-blue-500 bg-blue-50 dark:bg-blue-900/20" 
                                  : "text-neutral-400 hover:text-blue-500 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                              )}
                              title={item.isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
                            >
                              <Bookmark className={cn("w-5 h-5", item.isFavorite && "fill-current")} />
                            </button>
                            <button
                              onClick={() => {
                                setRawTranscription(item.raw);
                                setCleanTranscription(item.clean || "");
                                setTranscriptionWords(item.words || []);
                                setSummary(item.summary || "");
                                setKeyPoints(item.keyPoints || []);
                                toast.success("Transcripción cargada en el editor");
                                setActiveView('record');
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="p-2.5 text-neutral-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-xl transition-all"
                              title="Cargar en el editor"
                            >
                              <ArrowUpRight className="w-5 h-5" />
                            </button>
                            <button
                              onClick={(e) => copyHistoryItem(item.clean || item.raw, e)}
                              className="p-2.5 text-neutral-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all"
                              title="Copiar"
                            >
                              <Copy className="w-5 h-5" />
                            </button>
                            <button
                              onClick={(e) => deleteHistoryItem(item.id, e)}
                              className="p-2.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                              title="Eliminar"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => toggleHistoryItem(item.id)}
                              className="p-2.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-xl transition-all"
                            >
                              {expandedItems.has(item.id) ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </button>
                          </div>
                        </div>

                        <AnimatePresence>
                          {expandedItems.has(item.id) && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="pt-5 mt-5 border-t border-neutral-100 dark:border-neutral-800 space-y-6">
                                {item.clean && (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 flex items-center gap-2">
                                        <Sparkles className="w-3 h-3 text-blue-500" />
                                        Texto Limpio
                                      </h4>
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => {
                                            navigator.clipboard.writeText(item.clean);
                                            toast.success("Texto limpio copiado");
                                          }}
                                          className="p-1.5 text-neutral-400 hover:text-blue-500 transition-colors"
                                          title="Copiar texto limpio"
                                        >
                                          <Copy className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => exportFile('txt', 'clean', item.clean)}
                                          className="p-1.5 text-neutral-400 hover:text-blue-500 transition-colors"
                                          title="Exportar .txt"
                                        >
                                          <FileDown className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => exportFile('md', 'clean', item.clean)}
                                          className="p-1.5 text-neutral-400 hover:text-green-500 transition-colors"
                                          title="Exportar .md"
                                        >
                                          <FileCode className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => exportFile('pdf', 'clean', item.clean)}
                                          className="p-1.5 text-neutral-400 hover:text-red-500 transition-colors"
                                          title="Exportar .pdf"
                                        >
                                          <FileText className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                    <p className="text-sm text-neutral-800 dark:text-neutral-200 leading-relaxed whitespace-pre-wrap bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-xl border border-neutral-100 dark:border-neutral-800/50">
                                      {item.clean}
                                    </p>
                                  </div>
                                )}

                                {item.clean && !item.summary && (!item.keyPoints || item.keyPoints.length === 0) && (
                                  <div className="pt-2">
                                    <button
                                      onClick={() => generateSummary(item.clean, item.id)}
                                      disabled={isGeneratingSummary}
                                      className="w-full py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all flex items-center justify-center gap-2 border border-blue-100/50 dark:border-blue-900/30 disabled:opacity-50"
                                    >
                                      {isGeneratingSummary ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                      Generar Resumen con IA
                                    </button>
                                  </div>
                                )}

                                {(item.summary || (item.keyPoints && item.keyPoints.length > 0)) && (
                                  <div className="p-4 bg-blue-50/30 dark:bg-blue-900/10 rounded-xl border border-blue-100/30 dark:border-blue-900/20 space-y-4">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <Sparkles className="w-3 h-3 text-blue-500" />
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Resumen IA</h4>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {editingSummaryId === item.id ? (
                                          <>
                                            <button
                                              onClick={() => saveEditedSummary(item.id)}
                                              className="text-[10px] font-bold uppercase tracking-widest text-green-600 hover:text-green-700 transition-colors flex items-center gap-1"
                                            >
                                              <Check className="w-3 h-3" /> Guardar
                                            </button>
                                            <button
                                              onClick={() => handleCancelSummaryEdit(item.id)}
                                              className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-500 transition-colors flex items-center gap-1"
                                            >
                                              <X className="w-3 h-3" /> Cancelar
                                            </button>
                                          </>
                                        ) : (
                                          <div className="flex items-center gap-3">
                                            <button
                                              onClick={() => suggestImprovements(item.id)}
                                              disabled={isSuggestingImprovements}
                                              className="text-[10px] font-bold uppercase tracking-widest text-amber-600 hover:text-amber-700 transition-colors flex items-center gap-1 disabled:opacity-50"
                                              title="Sugerir mejoras con IA"
                                            >
                                              {isSuggestingImprovements ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lightbulb className="w-3 h-3" />}
                                              Sugerir Mejoras
                                            </button>
                                            <button
                                              onClick={() => {
                                                setEditingSummaryId(item.id);
                                                setTempSummary(item.summary || "");
                                                setTempKeyPoints((item.keyPoints || []).join("\n"));
                                              }}
                                              className="text-[10px] font-bold uppercase tracking-widest text-blue-500 hover:text-blue-600 transition-colors flex items-center gap-1"
                                            >
                                              <Edit2 className="w-3 h-3" /> Editar
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {editingSummaryId === item.id ? (
                                      <div className="space-y-4">
                                        <div className="space-y-2">
                                          <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Resumen</label>
                                          <textarea
                                            value={tempSummary}
                                            onChange={(e) => setTempSummary(e.target.value)}
                                            className="w-full text-sm p-3 bg-white dark:bg-neutral-900 border border-blue-100 dark:border-blue-900/30 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none resize-none min-h-[80px]"
                                            placeholder="Escribe el resumen..."
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Puntos Clave (uno por línea)</label>
                                          <textarea
                                            value={tempKeyPoints}
                                            onChange={(e) => setTempKeyPoints(e.target.value)}
                                            className="w-full text-sm p-3 bg-white dark:bg-neutral-900 border border-blue-100 dark:border-blue-900/30 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none resize-none min-h-[120px]"
                                            placeholder="Escribe los puntos clave..."
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        {item.summary && (
                                          <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed font-medium">
                                            {item.summary}
                                          </p>
                                        )}
                                        {item.keyPoints && item.keyPoints.length > 0 && (
                                          <ul className="space-y-1.5">
                                            {item.keyPoints.map((point, i) => (
                                              <li key={i} className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                                                <div className="w-1 h-1 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                                                <span>{point}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}

                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 flex items-center gap-2">
                                      <FileText className="w-3 h-3" />
                                      Transcripción Original
                                    </h4>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => {
                                          navigator.clipboard.writeText(item.raw);
                                          toast.success("Transcripción original copiada");
                                        }}
                                        className="p-1.5 text-neutral-400 hover:text-blue-500 transition-colors"
                                        title="Copiar texto original"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => exportFile('txt', 'raw', item.raw)}
                                        className="p-1.5 text-neutral-400 hover:text-blue-500 transition-colors"
                                        title="Exportar .txt"
                                      >
                                        <FileDown className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => exportFile('md', 'raw', item.raw)}
                                        className="p-1.5 text-neutral-400 hover:text-green-500 transition-colors"
                                        title="Exportar .md"
                                      >
                                        <FileCode className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => exportFile('pdf', 'raw', item.raw)}
                                        className="p-1.5 text-neutral-400 hover:text-red-500 transition-colors"
                                        title="Exportar .pdf"
                                      >
                                        <FileText className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                  <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed whitespace-pre-wrap italic bg-neutral-50/50 dark:bg-neutral-900/30 p-4 rounded-xl border border-neutral-100 dark:border-neutral-800/30">
                                    {item.words && item.words.length > 0 ? (
                                      item.words.map((w, i) => {
                                        const isActive = currentTime >= w.start && currentTime <= w.end;
                                        return (
                                          <span
                                            key={i}
                                            className={cn(
                                              "transition-all duration-200 rounded px-0.5 cursor-pointer inline-block",
                                              isActive 
                                                ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-110 font-bold z-10 relative" 
                                                : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                            )}
                                            onClick={() => {
                                              if (wavesurferRef.current) {
                                                wavesurferRef.current.setTime(w.start);
                                                if (!isPlaying) wavesurferRef.current.play();
                                              }
                                            }}
                                          >
                                            {w.word}{" "}
                                          </span>
                                        );
                                      })
                                    ) : (
                                      item.raw
                                    )}
                                  </p>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </main>

      <footer className="max-w-3xl mx-auto px-4 py-12 text-center space-y-6">
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button 
              onClick={() => setShowAuthorModal(true)}
              className="group flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl text-xs font-bold text-neutral-700 dark:text-neutral-300 hover:border-blue-500 hover:text-blue-500 transition-all shadow-sm"
            >
              <Activity className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform" />
              <span>Mariano Fischer (EDUC.AI)</span>
            </button>
            <a 
              href="https://www.linkedin.com/in/educaailatam/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl text-xs font-bold text-blue-600 dark:text-blue-400 hover:border-blue-500 transition-all shadow-sm flex items-center gap-1.5"
            >
              <span>LinkedIn</span>
              <ArrowUpRight className="w-3 h-3 opacity-60" />
            </a>
            <a 
              href="https://dictafono-ai-qxsnswy.gamma.site/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl text-xs font-bold text-amber-600 dark:text-amber-400 hover:border-amber-500 transition-all shadow-sm flex items-center gap-1.5"
            >
              <span>Instructivo Gamma</span>
              <ArrowUpRight className="w-3 h-3 opacity-60" />
            </a>
          </div>
          <p className="text-[10px] text-neutral-400 dark:text-neutral-600 font-bold uppercase tracking-widest">
            Contacto: educaailatam@gmail.com | superpollo02@hotmail.com
          </p>
        </div>
        <p className="text-[10px] text-neutral-400 dark:text-neutral-600">
          Procesamiento de Voz a Texto en Español nativo con Groq API (Whisper V3 & Llama 3)
        </p>
      </footer>
      <Toaster position="bottom-right" richColors />

      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-neutral-950/90 backdrop-blur-xl border-t border-neutral-200 dark:border-neutral-800 px-6 py-3.5 flex items-center justify-around z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
          <button 
            onClick={() => {
              setActiveView('record');
              playFeedbackSound('click');
            }}
            className={cn(
              "flex flex-col items-center gap-1 transition-all duration-300 min-w-[56px] py-1",
              activeView === 'record' ? "text-blue-500 scale-105 font-extrabold" : "text-neutral-400 hover:text-neutral-600"
            )}
          >
            <Mic className={cn("w-6 h-6", activeView === 'record' && "fill-current")} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Grabar</span>
          </button>

          <button 
            onClick={() => {
              setActiveView('history');
              playFeedbackSound('click');
            }}
            className={cn(
              "flex flex-col items-center gap-1 transition-all duration-300 relative min-w-[56px] py-1",
              activeView === 'history' ? "text-blue-500 scale-105 font-extrabold" : "text-neutral-400 hover:text-neutral-600"
            )}
          >
            <History className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Historial</span>
            {editingSummaryId && (
              <span className="absolute top-1 right-3 w-2 h-2 bg-amber-500 rounded-full border-2 border-white dark:border-neutral-950" />
            )}
          </button>

          <button 
            onClick={() => {
              setShowGlossaryModal(true);
              playFeedbackSound('click');
            }}
            className="flex flex-col items-center gap-1 transition-all duration-300 text-amber-500 min-w-[56px] py-1"
          >
            <Bookmark className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Glosario</span>
          </button>

          <button 
            onClick={() => {
              setActiveView('settings');
              playFeedbackSound('click');
            }}
            className={cn(
              "flex flex-col items-center gap-1 transition-all duration-300 min-w-[56px] py-1",
              activeView === 'settings' ? "text-blue-500 scale-105 font-extrabold" : "text-neutral-400 hover:text-neutral-600"
            )}
          >
            <Settings className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Ajustes</span>
          </button>

          <button 
            onClick={() => {
              setShowAuthorModal(true);
              playFeedbackSound('click');
            }}
            className="flex flex-col items-center gap-1 transition-all duration-300 text-blue-600 dark:text-blue-400 min-w-[56px] py-1"
          >
            <Activity className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Autor</span>
          </button>
        </nav>
      )}

      <AnimatePresence>
        {isPresentationMode && (
          <motion.div
            ref={presentationRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed inset-0 z-[100] flex flex-col overflow-y-auto transition-colors duration-500",
              readingTheme === 'light' && "bg-white text-neutral-900",
              readingTheme === 'dark' && "bg-neutral-950 text-neutral-100",
              readingTheme === 'sepia' && "bg-[#f4ecd8] text-[#5b4636]"
            )}
          >
            <div className="max-w-4xl mx-auto w-full px-8 md:px-12 py-12 md:py-24 space-y-16">
              <div className={cn(
                "flex items-center justify-between border-b pb-8 sticky top-0 z-10 backdrop-blur-md pt-4",
                readingTheme === 'light' && "border-neutral-100 bg-white/80",
                readingTheme === 'dark' && "border-neutral-800 bg-neutral-950/80",
                readingTheme === 'sepia' && "border-[#e6d5b8] bg-[#f4ecd8]/80"
              )}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/20">
                    <Maximize2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black tracking-tighter uppercase">Modo Lectura</h2>
                    <div className="flex items-center gap-3 mt-1">
                      <button 
                        onClick={() => setReadingTheme('light')}
                        className={cn("w-4 h-4 rounded-full border", readingTheme === 'light' ? "ring-2 ring-blue-500 border-white" : "border-neutral-300 bg-white")}
                      />
                      <button 
                        onClick={() => setReadingTheme('dark')}
                        className={cn("w-4 h-4 rounded-full border", readingTheme === 'dark' ? "ring-2 ring-blue-500 border-white" : "border-neutral-700 bg-neutral-900")}
                      />
                      <button 
                        onClick={() => setReadingTheme('sepia')}
                        className={cn("w-4 h-4 rounded-full border", readingTheme === 'sepia' ? "ring-2 ring-blue-500 border-white" : "border-[#d3c1a5] bg-[#f4ecd8]")}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(cleanTranscription);
                      toast.success("Texto copiado");
                    }}
                    className={cn(
                      "p-3 rounded-2xl transition-all",
                      readingTheme === 'light' && "bg-neutral-100 hover:bg-neutral-200 text-neutral-500",
                      readingTheme === 'dark' && "bg-neutral-800 hover:bg-neutral-700 text-neutral-400",
                      readingTheme === 'sepia' && "bg-[#e6d5b8] hover:bg-[#d3c1a5] text-[#5b4636]"
                    )}
                    title="Copiar texto"
                  >
                    <Copy className="w-6 h-6" />
                  </button>
                  <button
                    onClick={() => setIsPresentationMode(false)}
                    className={cn(
                      "p-3 rounded-2xl transition-all group",
                      readingTheme === 'light' && "bg-neutral-100 hover:bg-red-50 text-neutral-500 hover:text-red-500",
                      readingTheme === 'dark' && "bg-neutral-800 hover:bg-red-900/20 text-neutral-400 hover:text-red-400",
                      readingTheme === 'sepia' && "bg-[#e6d5b8] hover:bg-red-900/10 text-[#5b4636] hover:text-red-600"
                    )}
                    title="Cerrar (Esc)"
                  >
                    <X className="w-6 h-6 group-hover:rotate-90 transition-transform" />
                  </button>
                </div>
              </div>

              <div className={cn(
                "text-3xl md:text-4xl lg:text-5xl leading-tight md:leading-tight lg:leading-tight font-medium tracking-tight whitespace-pre-wrap selection:bg-blue-500/20",
                readingTheme === 'sepia' ? "font-serif" : "font-sans"
              )}>
                {renderTextWithMarkers(cleanTranscription)}
              </div>
              
              <div className="h-24" />
            </div>
            
            <div className={cn(
              "fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 backdrop-blur-xl rounded-full text-[10px] font-bold uppercase tracking-[0.3em] shadow-2xl flex items-center gap-6",
              readingTheme === 'light' && "bg-white/80 text-neutral-400 border border-neutral-100",
              readingTheme === 'dark' && "bg-neutral-900/80 text-neutral-500 border border-neutral-800",
              readingTheme === 'sepia' && "bg-[#f4ecd8]/80 text-[#5b4636]/60 border border-[#e6d5b8]"
            )}>
              <div className="flex items-center gap-2">
                <span className="opacity-50">Navegar:</span>
                <div className="flex gap-1">
                  <div className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">↑</div>
                  <div className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">↓</div>
                </div>
              </div>
              <div className="w-px h-3 bg-neutral-200 dark:bg-neutral-800" />
              <button 
                onClick={() => presentationRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                className="hover:text-blue-500 transition-colors"
              >
                Volver arriba
              </button>
              <div className="w-px h-3 bg-neutral-200 dark:bg-neutral-800" />
              <div>
                Presiona <span className="text-blue-500">ESC</span> para salir
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function audioBufferToWavBlob(buffer: AudioBuffer): Promise<Blob> {
  return new Promise((resolve) => {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArr = new ArrayBuffer(length);
    const view = new DataView(bufferArr);
    const channels = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;

    function setUint16(data: number) {
      view.setUint16(pos, data, true);
      pos += 2;
    }

    function setUint32(data: number) {
      view.setUint32(pos, data, true);
      pos += 4;
    }

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    // write interleaved data
    for (i = 0; i < buffer.numberOfChannels; i++)
      channels.push(buffer.getChannelData(i));

    while (pos < length) {
      for (i = 0; i < numOfChan; i++) {
        // interleave channels
        sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
        sample = (sample < 0 ? sample * 0x8000 : sample * 0x7fff) | 0; // scale to 16-bit signed int
        view.setInt16(pos, sample, true); // write 16-bit sample
        pos += 2;
      }
      offset++; // next source sample
    }

    resolve(new Blob([bufferArr], { type: "audio/wav" }));
  });
}
