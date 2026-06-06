import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";

export interface ElevenLabsVoice {
  id: string;
  name: string;
  gender: "Male" | "Female" | "Neutral";
  accent: string;
  description: string;
}

export const ELEVENLABS_VOICES: ElevenLabsVoice[] = [
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam",    gender: "Male",    accent: "American",   description: "Dominant & firm" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian",   gender: "Male",    accent: "American",   description: "Deep & comforting" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", gender: "Male",    accent: "Australian", description: "Deep & confident" },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris",   gender: "Male",    accent: "American",   description: "Charming & down-to-earth" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel",  gender: "Male",    accent: "British",    description: "Steady broadcaster" },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric",    gender: "Male",    accent: "American",   description: "Smooth & trustworthy" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George",  gender: "Male",    accent: "British",    description: "Warm storyteller" },
  { id: "SOYHLrjzK2X1ezoPC6cr", name: "Harry",   gender: "Male",    accent: "American",   description: "Fierce & intense" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam",    gender: "Male",    accent: "American",   description: "Energetic & social" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger",   gender: "Male",    accent: "American",   description: "Laid-back & casual" },
  { id: "bIHbv24MWmeRgasZH58o", name: "Will",    gender: "Male",    accent: "American",   description: "Relaxed optimist" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum",  gender: "Male",    accent: "American",   description: "Husky & mysterious" },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill",    gender: "Male",    accent: "American",   description: "Wise & balanced" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah",   gender: "Female",  accent: "American",   description: "Mature & reassuring" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura",   gender: "Female",  accent: "American",   description: "Enthusiastic & quirky" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice",   gender: "Female",  accent: "British",    description: "Clear & engaging" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", gender: "Female",  accent: "American",   description: "Professional & warm" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", gender: "Female",  accent: "American",   description: "Playful & bright" },
  { id: "hpp4J3VqNfWAUOO0d1Us", name: "Bella",   gender: "Female",  accent: "American",   description: "Professional & bright" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily",    gender: "Female",  accent: "British",    description: "Velvety & expressive" },
  { id: "SAz9YHcvj6GT2YYXdXww", name: "River",   gender: "Neutral", accent: "American",   description: "Relaxed & informative" },
];

const DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB";
const STORAGE_KEY = "jarvis-voice-id";

interface VoiceContextValue {
  selectedVoiceId: string;
  setSelectedVoiceId: (id: string) => void;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  isSpeaking: boolean;
  isSpeakingRef: React.MutableRefObject<boolean>;
  speakText: (text: string, onEnd?: () => void) => void;
  speakTextWithVoice: (text: string, voiceId: string, onEnd?: () => void) => void;
  cancelSpeech: () => void;
  previewVoice: (voiceId: string) => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [selectedVoiceId, setSelectedVoiceIdState] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return ELEVENLABS_VOICES.find((v) => v.id === stored) ? stored! : DEFAULT_VOICE_ID;
  });
  const [isMuted, setIsMutedState] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const isMutedRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const selectedVoiceIdRef = useRef(selectedVoiceId);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const stopAll = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
    setIsSpeaking(false);
  }, []);

  const setSelectedVoiceId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setSelectedVoiceIdState(id);
    selectedVoiceIdRef.current = id;
  }, []);

  const setIsMuted = useCallback(
    (muted: boolean) => {
      if (muted) stopAll();
      isMutedRef.current = muted;
      setIsMutedState(muted);
    },
    [stopAll],
  );

  const cancelSpeech = useCallback(() => {
    stopAll();
  }, [stopAll]);

  const browserSpeak = useCallback((text: string, onEnd?: () => void) => {
    if (!window.speechSynthesis) { onEnd?.(); return; }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.0;
    utt.pitch = 1.0;
    utt.onend = () => { isSpeakingRef.current = false; setIsSpeaking(false); onEnd?.(); };
    utt.onerror = () => { isSpeakingRef.current = false; setIsSpeaking(false); onEnd?.(); };
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    window.speechSynthesis.speak(utt);
  }, []);

  const playTTS = useCallback(
    async (text: string, voiceId: string, onEnd?: () => void) => {
      stopAll();
      isSpeakingRef.current = true;
      setIsSpeaking(true);

      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: voiceId }),
          credentials: "include",
        });

        if (!response.ok) {
          // ElevenLabs plan restriction — fall back to browser speech
          browserSpeak(text, onEnd);
          return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;

        const done = () => {
          isSpeakingRef.current = false;
          if (objectUrlRef.current === url) {
            URL.revokeObjectURL(url);
            objectUrlRef.current = null;
          }
          audioRef.current = null;
          onEnd?.();
        };

        audio.onended = done;
        audio.onerror = done;
        audio.play().catch(() => done());
      } catch {
        browserSpeak(text, onEnd);
      }
    },
    [stopAll, browserSpeak],
  );

  const speakText = useCallback(
    (text: string, onEnd?: () => void) => {
      if (isMutedRef.current) {
        onEnd?.();
        return;
      }
      void playTTS(text, selectedVoiceIdRef.current, onEnd);
    },
    [playTTS],
  );

  const speakTextWithVoice = useCallback(
    (text: string, voiceId: string, onEnd?: () => void) => {
      void playTTS(text, voiceId, onEnd);
    },
    [playTTS],
  );

  const previewVoice = useCallback(
    (voiceId: string) => {
      void playTTS(
        "Hello. I am Jarvis, your AI assistant. How can I help you today?",
        voiceId,
      );
    },
    [playTTS],
  );

  return (
    <VoiceContext.Provider
      value={{
        selectedVoiceId,
        setSelectedVoiceId,
        isMuted,
        setIsMuted,
        isSpeaking,
        isSpeakingRef,
        speakText,
        speakTextWithVoice,
        cancelSpeech,
        previewVoice,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used within VoiceProvider");
  return ctx;
}
