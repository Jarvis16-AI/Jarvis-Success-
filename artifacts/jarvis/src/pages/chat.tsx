import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import ReactMarkdown from "react-markdown";
import {
  useListConversations,
  useCreateConversation,
  useDeleteConversation,
  useListMessages,
  getListConversationsQueryKey,
  getListMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Menu, Plus, Send, Mic, Paperclip, Trash2, X, User,
  MessageSquare, Volume2, VolumeX, AudioLines, LogOut, Copy, Check,
  ThumbsUp, ThumbsDown, Play, Square, Phone, Mail, Globe, Share2,
  Antenna,
} from "lucide-react";
import { useChatContext } from "@/context/chat-context";
import { useVoice } from "@/context/voice-context";
import { VoicePicker } from "@/components/voice-picker";
import { getSessionId } from "@/lib/session";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface StreamingMessage {
  id: string; role: "user"|"assistant"; content: string;
  streaming?: boolean; imageUrl?: string; createdAt?: string;
}
interface PendingAttachment {
  id: string; type: "image"|"audio"|"other"; name: string; url: string; blob: Blob;
}
interface BatteryManager extends EventTarget {
  level: number; charging: boolean;
}
interface WeatherData {
  temp: number; tempMin: number; tempMax: number; condition: string; city: string;
  tomorrowMax: number; tomorrowMin: number; tomorrowCondition: string;
  lat: number; lon: number;
}
interface SysLoad { cpu: number; mem: number; net: number; }
type ActionType = "CALL"|"WHATSAPP"|"SMS"|"EMAIL"|"MAPS"|"NAVIGATE"|"OPEN"|"YOUTUBE"|"SEARCH"|"SHARE"|"CONTACTS";
interface JarvisAction { type: ActionType; params: string[]; label: string; }

// Web Speech API types
type SpeechRecognitionInstance = {
  continuous: boolean; interimResults: boolean; lang: string;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: SpeechRecognitionEvt) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type SpeechRecognitionEvt = {
  resultIndex: number;
  results: { length: number; [i: number]: { isFinal: boolean; [0]: { transcript: string } } };
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const DAYS = ["SUN","MON","TUE","WED","THU","FRI","SAT"] as const;
const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"] as const;

const APP_LINKS: Record<string, string> = {
  youtube:"https://youtube.com", instagram:"https://instagram.com",
  twitter:"https://twitter.com", x:"https://x.com",
  spotify:"https://open.spotify.com", whatsapp:"https://wa.me",
  gmail:"https://mail.google.com", maps:"https://maps.google.com",
  tiktok:"https://tiktok.com", netflix:"https://netflix.com",
  uber:"https://m.uber.com/ul", linkedin:"https://linkedin.com",
  facebook:"https://facebook.com", telegram:"https://t.me",
  snapchat:"https://snapchat.com", amazon:"https://amazon.com",
};

// Real brand icons via SimpleIcons CDN. slug = simpleicons.org slug, iconColor = hex without #
// bg may be a hex string or CSS gradient string.
const LAUNCHER = [
  { id:"phone",     label:"CALL",      bg:"#1e88e5", slug:null,               iconColor:"ffffff", emoji:"📞", action:() => { window.location.href = "tel:"; } },
  { id:"whatsapp",  label:"WHATSAPP",  bg:"#25D366", slug:"whatsapp",         iconColor:"ffffff", emoji:"💬", action:() => window.open("https://wa.me","_blank") },
  { id:"maps",      label:"MAPS",      bg:"#ffffff", slug:"googlemaps",       iconColor:"4285F4", emoji:"🗺️", action:() => window.open("https://maps.google.com","_blank") },
  { id:"youtube",   label:"YOUTUBE",   bg:"#FF0000", slug:"youtube",          iconColor:"ffffff", emoji:"▶️", action:() => window.open("https://youtube.com","_blank") },
  { id:"gmail",     label:"GMAIL",     bg:"#ffffff", slug:"gmail",            iconColor:"EA4335", emoji:"📧", action:() => window.open("https://mail.google.com","_blank") },
  { id:"instagram", label:"INSTAGRAM", bg:"linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)", slug:"instagram", iconColor:"ffffff", emoji:"📸", action:() => window.open("https://instagram.com","_blank") },
  { id:"tiktok",    label:"TIKTOK",    bg:"#010101", slug:"tiktok",           iconColor:"ffffff", emoji:"🎵", action:() => window.open("https://tiktok.com","_blank") },
  { id:"x",         label:"X",         bg:"#000000", slug:"x",                iconColor:"ffffff", emoji:"🐦", action:() => window.open("https://x.com","_blank") },
  { id:"spotify",   label:"SPOTIFY",   bg:"#191414", slug:"spotify",          iconColor:"1DB954", emoji:"🎵", action:() => window.open("https://open.spotify.com","_blank") },
  { id:"telegram",  label:"TELEGRAM",  bg:"#2CA5E0", slug:"telegram",         iconColor:"ffffff", emoji:"✈️", action:() => window.open("https://t.me","_blank") },
  { id:"uber",      label:"UBER",      bg:"#000000", slug:"uber",             iconColor:"ffffff", emoji:"🚗", action:() => window.open("https://m.uber.com/ul","_blank") },
  { id:"google",    label:"GOOGLE",    bg:"#ffffff", slug:"google",           iconColor:"4285F4", emoji:"🔍", action:() => window.open("https://google.com","_blank") },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function wmoCondition(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 2) return "Mainly Clear";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Foggy";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  return "Thunderstorm";
}
function fmtTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function buzz(ms: number | number[] = 50) {
  try { navigator.vibrate(ms); } catch { /* ignore */ }
}
function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function parseActions(text: string): { cleanText: string; actions: JarvisAction[] } {
  const actions: JarvisAction[] = [];
  const LABELS: Record<string, (p: string[]) => string> = {
    CALL:     p => `📞 Call ${p[0]}`,
    WHATSAPP: p => `💬 WhatsApp ${p[0]}`,
    SMS:      p => `✉️ SMS to ${p[0]}`,
    EMAIL:    p => `📧 Email ${p[0]}`,
    MAPS:     p => `🗺️ Maps: ${p[0]}`,
    NAVIGATE: p => `🧭 Directions to ${p[0]}`,
    OPEN:     p => `🔗 Open ${p[0]}`,
    YOUTUBE:  p => `▶️ YouTube: ${p[0]}`,
    SEARCH:   p => `🔍 Search: ${p[0]}`,
    SHARE:    () => `📤 Share`,
    CONTACTS: () => `👤 Pick Contact`,
  };
  const clean = text.replace(/\[ACTION:([A-Z]+):?([^\]]*)\]/g, (_, type, rest) => {
    const params = rest ? (rest as string).split(":").map((s: string) => s.trim()) : [];
    const fn = LABELS[type as string];
    actions.push({ type: type as ActionType, params, label: fn ? fn(params) : type as string });
    return "";
  }).replace(/\n{3,}/g, "\n\n").trim();
  return { cleanText: clean, actions };
}

function detectInputIntent(text: string): JarvisAction | null {
  const t = text.trim();
  const callM = t.match(/^(?:call|phone|dial|ring)\s+(\+?[\d\s\-().]+)\s*$/i);
  if (callM) {
    const n = callM[1].replace(/[\s\-().]/g, "");
    if (n.replace(/\D/g, "").length >= 7) return { type:"CALL", params:[n], label:`📞 Call ${callM[1].trim()}` };
  }
  const waM = t.match(/^(?:whatsapp|wa|wp)\s+(\+?[\d\s\-().]+?)\s*(.*)\s*$/i);
  if (waM) {
    const n = waM[1].replace(/[\s\-().]/g, "");
    if (n.replace(/\D/g, "").length >= 7) return { type:"WHATSAPP", params:[n, waM[2]||""], label:`💬 WhatsApp ${waM[1].trim()}` };
  }
  const openM = t.match(/^(?:open|launch|start|go to)\s+([\w\s]+?)\s*$/i);
  if (openM) {
    const app = openM[1].toLowerCase().replace(/\s+/g, "");
    if (APP_LINKS[app]) return { type:"OPEN", params:[app], label:`🔗 Open ${openM[1].trim()}` };
  }
  const navM = t.match(/^(?:directions? to|navigate to|take me to)\s+(.+)/i);
  if (navM) return { type:"NAVIGATE", params:[navM[1]], label:`🧭 Navigate to ${navM[1]}` };
  const ytM = t.match(/^(?:youtube|yt|watch|play)\s+(.+)/i);
  if (ytM) return { type:"YOUTUBE", params:[ytM[1]], label:`▶️ YouTube: ${ytM[1]}` };
  const srM = t.match(/^(?:search|google)\s+(.+)/i);
  if (srM) return { type:"SEARCH", params:[srM[1]], label:`🔍 Search: ${srM[1]}` };
  return null;
}

async function pickContact(): Promise<{ name: string; tel: string } | null> {
  const nav = navigator as Navigator & {
    contacts?: { select(p: string[], o?: { multiple?: boolean }): Promise<Array<{ name?: string[]; tel?: string[] }>> };
  };
  if (!nav.contacts) return null;
  try {
    const res = await nav.contacts.select(["name","tel"], { multiple:false });
    if (!res.length) return null;
    return { name: res[0].name?.[0] ?? "Contact", tel: res[0].tel?.[0] ?? "" };
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// AppIcon — renders a real brand icon with SimpleIcons CDN + emoji fallback
// ─────────────────────────────────────────────────────────────────────────────
function AppIcon({ slug, iconColor, bg, emoji, size = 28 }: {
  slug: string | null; iconColor: string; bg: string; emoji: string; size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const iconSize = size;
  return (
    <div style={{
      width: 44, height: 44, borderRadius: 12,
      background: bg, display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 2px 10px rgba(0,0,0,0.5)", overflow: "hidden", flexShrink: 0,
    }}>
      {slug && !failed ? (
        <img
          src={`https://cdn.simpleicons.org/${slug}/${iconColor}`}
          width={iconSize} height={iconSize}
          alt="" draggable={false}
          onError={() => setFailed(true)}
          style={{ objectFit: "contain" }}
        />
      ) : slug === null ? (
        // Phone: use Lucide icon
        <Phone size={iconSize} color={`#${iconColor}`}/>
      ) : (
        <span style={{ fontSize: iconSize * 0.85, lineHeight: 1 }}>{emoji}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HUD Center SVG
// ─────────────────────────────────────────────────────────────────────────────
function HudCenter({ msgCount, ss, speaking }: { msgCount: number; ss: string; speaking: boolean }) {
  const cx = 80, cy = 80;
  const floatData = ["618","901","0422","23108","237604","6230783"];
  const floatAngles = [20,65,115,200,255,315];
  return (
    <svg viewBox="0 0 160 160" width="100%" height="100%" style={{maxWidth:200,maxHeight:200,overflow:"visible"}}>
      <defs>
        <radialGradient id="hc-cg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00d4ff" stopOpacity={speaking ? 0.55 : 0.3}/>
          <stop offset="100%" stopColor="#00d4ff" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="hc-sg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18"/>
          <stop offset="60%" stopColor="#00d4ff" stopOpacity="0.12"/>
          <stop offset="100%" stopColor="#00d4ff" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="hc-ig" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7c3aed"/>
          <stop offset="50%" stopColor={speaking ? "#ffffff" : "#00d4ff"}/>
          <stop offset="100%" stopColor="#7c3aed"/>
        </linearGradient>
        <filter id="hc-glow"><feGaussianBlur stdDeviation={speaking ? "3.5" : "2.5"} result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="hc-sm"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="hc-pulse-glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>

      {/* Speaking pulse rings — sonar expanding outward */}
      {speaking && [0, 0.5, 1.0].map((delay, i) => (
        <circle key={i} cx={cx} cy={cy} r="32" fill="none" stroke="#00d4ff" strokeWidth="1.5" filter="url(#hc-pulse-glow)">
          <animate attributeName="r" from="32" to="88" dur="1.5s" begin={`${delay}s`} repeatCount="indefinite" calcMode="spline" keySplines="0.2 0 0.8 1"/>
          <animate attributeName="stroke-opacity" from="0.7" to="0" dur="1.5s" begin={`${delay}s`} repeatCount="indefinite" calcMode="spline" keySplines="0.2 0 0.8 1"/>
          <animate attributeName="stroke-width" from="2" to="0.5" dur="1.5s" begin={`${delay}s`} repeatCount="indefinite"/>
        </circle>
      ))}

      <g><circle cx={cx} cy={cy} r={74} stroke="#00d4ff" strokeOpacity="0.3" strokeWidth="0.8" strokeDasharray="2.2 5.5" fill="none"/>
        <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur={speaking ? "10s" : "22s"} repeatCount="indefinite"/>
      </g>
      <g><circle cx={cx} cy={cy} r={64} stroke="#00d4ff" strokeOpacity="0.4" strokeWidth="0.8" strokeDasharray="4.5 13" fill="none"/>
        {[0,90,180,270].map(a=>{const r=a*Math.PI/180;return <circle key={a} cx={cx+64*Math.cos(r)} cy={cy+64*Math.sin(r)} r="1.8" fill="#00d4ff" fillOpacity="0.85" filter="url(#hc-sm)"/>;})}
        <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} ${cy}`} to={`-360 ${cx} ${cy}`} dur={speaking ? "7s" : "16s"} repeatCount="indefinite"/>
      </g>
      <g><circle cx={cx} cy={cy} r={53} stroke="#00d4ff" strokeOpacity="0.55" strokeWidth="1" strokeDasharray="7.5 9" fill="none"/>
        <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur={speaking ? "5s" : "10s"} repeatCount="indefinite"/>
      </g>
      <circle cx={cx} cy={cy} r={44} stroke="#00d4ff" strokeOpacity="0.25" strokeWidth="0.6" fill="none"/>
      <circle cx={cx} cy={cy} r={37} stroke="#00d4ff" strokeOpacity="0.15" strokeWidth="0.5" fill="none"/>
      {[0,45,90,135,180,225,270,315].map(a=>{const r=a*Math.PI/180;return <line key={a} x1={cx+55*Math.cos(r)} y1={cy+55*Math.sin(r)} x2={cx+60*Math.cos(r)} y2={cy+60*Math.sin(r)} stroke="#00d4ff" strokeOpacity="0.6" strokeWidth="1.2"/>;})}

      {/* Inner orb — brightens when speaking */}
      <circle cx={cx} cy={cy} r={32} fill={speaking ? "url(#hc-sg)" : "url(#hc-cg)"}/>
      <circle cx={cx} cy={cy} r={32} stroke="#00d4ff" strokeOpacity={speaking ? 1 : 0.7} strokeWidth={speaking ? 1.4 : 0.8} fill="none" filter="url(#hc-sm)"/>

      {/* Infinity logo — glows white when speaking */}
      <g className="hud-glow"><g transform={`translate(${cx-18},${cy-10})`}>
        <path d="M18 10C18 4.5 14 1 9.5 1C5 1 1 5 1 10C1 15 5 19 9.5 19C14 19 18 14.5 18 10C18 4.5 22 1 26.5 1C31 1 35 5 35 10C35 15 31 19 26.5 19C22 19 18 14.5 18 10Z" stroke="url(#hc-ig)" strokeWidth={speaking ? 3 : 2.2} fill="none" strokeLinecap="round" filter="url(#hc-glow)"/>
      </g></g>

      {floatAngles.map((a,i)=>{const rad=a*Math.PI/180,r=78;return <text key={i} x={cx+r*Math.cos(rad)} y={cy+r*Math.sin(rad)+2} fontSize="5" fill="#00d4ff" fillOpacity="0.55" fontFamily="monospace" textAnchor="middle" className="data-flicker" style={{animationDelay:`${i*1.1}s`}}>{floatData[i]}</text>;})}
      <text x={cx} y={cy-37} textAnchor="middle" fontSize="6.5" fill="#00d4ff" fillOpacity="0.65" fontFamily="monospace">{`MSG:${String(msgCount).padStart(3,"0")}`}</text>
      <text x={cx} y={cy+44} textAnchor="middle" fontSize="5.5" fill={speaking ? "#00d4ff" : "rgba(0,212,255,0.4)"} fillOpacity={speaking ? 0.9 : 0.4} fontFamily="monospace">{speaking ? "SPEAKING" : `:${ss}`}</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Radar Panel — real compass heading
// ─────────────────────────────────────────────────────────────────────────────
function RadarPanel({ heading, size = 38 }: { heading: number | null; size?: number }) {
  const hRad = heading !== null ? (heading * Math.PI / 180) : null;
  const hx = hRad !== null ? 24 + 19 * Math.sin(hRad) : null;
  const hy = hRad !== null ? 24 - 19 * Math.cos(hRad) : null;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size}>
      <defs><radialGradient id="rg-s" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#00d4ff" stopOpacity="0.35"/><stop offset="100%" stopColor="#00d4ff" stopOpacity="0"/></radialGradient></defs>
      <rect width="48" height="48" rx="3" fill="rgba(0,15,20,0.9)"/>
      {[8,16,22].map(r=><circle key={r} cx="24" cy="24" r={r} stroke="#00d4ff" strokeOpacity="0.18" strokeWidth="0.5" fill="none"/>)}
      <line x1="24" y1="2" x2="24" y2="46" stroke="#00d4ff" strokeOpacity="0.12" strokeWidth="0.5"/>
      <line x1="2" y1="24" x2="46" y2="24" stroke="#00d4ff" strokeOpacity="0.12" strokeWidth="0.5"/>
      <g><path d="M24,24 L24,2 A22,22 0 0,1 46,24 Z" fill="url(#rg-s)"/>
        <line x1="24" y1="24" x2="24" y2="2" stroke="#00d4ff" strokeWidth="1.2" strokeOpacity="0.95"/>
        <animateTransform attributeName="transform" type="rotate" from="0 24 24" to="360 24 24" dur="3s" repeatCount="indefinite"/>
      </g>
      <circle cx="33" cy="13" r="1.6" fill="#00ff88" opacity="0.9"/>
      <circle cx="14" cy="31" r="1.1" fill="#00ff88" opacity="0.7"/>
      <circle cx="30" cy="36" r="1.3" fill="#00ff88" opacity="0.55"/>
      {hx !== null && hy !== null && (
        <><line x1="24" y1="24" x2={hx} y2={hy} stroke="#ff6b35" strokeWidth="1.5" strokeOpacity="0.95"/>
          <circle cx={hx} cy={hy} r="2" fill="#ff6b35" opacity="0.95"/>
          <circle cx="24" cy="24" r="1.5" fill="#ff6b35" opacity="0.7"/>
        </>
      )}
      <text x="24" y="7" textAnchor="middle" fontSize="4" fill="#00d4ff" fillOpacity="0.5" fontFamily="monospace">N</text>
      <text x="24" y="46" textAnchor="middle" fontSize="4" fill="#00d4ff" fillOpacity="0.5" fontFamily="monospace">S</text>
      <text x="4"  y="25.5" textAnchor="middle" fontSize="4" fill="#00d4ff" fillOpacity="0.5" fontFamily="monospace">W</text>
      <text x="44" y="25.5" textAnchor="middle" fontSize="4" fill="#00d4ff" fillOpacity="0.5" fontFamily="monospace">E</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [, setLocation] = useLocation();
  const { activeConversationId, setActiveConversationId } = useChatContext();

  // Chat state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
const sendMessage = async (text: string) => {
  if (!text.trim()) return;

  console.log("SEND CLICKED:", text);

  try {
    // TEMP: just confirm flow works first
    // later this will call Groq API

  } catch (err) {
    console.error("Send error:", err);
  }
};
  const [streamingMessages, setStreamingMessages] = useState<StreamingMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string|null>(null);
  const [feedbackMap, setFeedbackMap] = useState<Record<string,"up"|"down">>({});
  const [playingId, setPlayingId] = useState<string|null>(null);
  const [chatVoiceOn, setChatVoiceOnState] = useState<boolean>(() => {
    const s = localStorage.getItem("jarvis-chat-voice");
    return s === null ? true : s === "true";
  });

  // HUD state
  const [now, setNow] = useState(new Date());
  const [battery, setBattery] = useState<{level:number;charging:boolean}|null>(null);
  const [weather, setWeather] = useState<WeatherData|null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [sysLoad, setSysLoad] = useState<SysLoad>({cpu:42,mem:38,net:22});
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>("default");
  const [camPerm, setCamPerm] = useState<PermissionState>("prompt");
  const [micPerm, setMicPerm] = useState<PermissionState>("prompt");
  const [uplinkKbs, setUplinkKbs] = useState(27.7);

  // Launcher / action state
  const [actionMap, setActionMap] = useState<Record<string, JarvisAction[]>>({});
  const [deviceHeading, setDeviceHeading] = useState<number|null>(null);
  const [pendingIntent, setPendingIntent] = useState<JarvisAction|null>(null);
  const [hasContacts, setHasContacts] = useState(false);

  // Wake word state
  const [wakeModeOn, setWakeModeOn] = useState(false);
  const [interimText, setInterimText] = useState("");
  const wakeModeRef = useRef(false);          // non-stale flag for use in onend callbacks
  const recognitionRef = useRef<SpeechRecognitionInstance|null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wakeLockRef = useRef<WakeLockSentinel|null>(null);
  const queryClient = useQueryClient();
  const mediaRecorderRef = useRef<MediaRecorder|null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { speakText, speakTextWithVoice, cancelSpeech, selectedVoiceId, isSpeaking } = useVoice();

  const setChatVoiceOn = (on: boolean) => {
    if (!on) cancelSpeech();
    localStorage.setItem("jarvis-chat-voice", String(on));
    setChatVoiceOnState(on);
  };

  const { data: conversations = [] } = useListConversations();
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();
  const { data: messages = [] } = useListMessages(activeConversationId!, {
    query: { enabled: !!activeConversationId, queryKey: getListMessagesQueryKey(activeConversationId!) },
  });

  // ── Clock ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Battery ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?(): Promise<BatteryManager> };
    if (!nav.getBattery) return;
    nav.getBattery().then(bm => {
      const upd = () => setBattery({ level: bm.level, charging: bm.charging });
      upd();
      bm.addEventListener("levelchange", upd);
      bm.addEventListener("chargingchange", upd);
    }).catch(() => {});
  }, []);

  // ── Wake Lock ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request(t: string): Promise<WakeLockSentinel> } };
    if (!nav.wakeLock) return;
    const acquire = () => nav.wakeLock!.request("screen").then(wl => { wakeLockRef.current = wl; }).catch(() => {});
    acquire();
    const onVis = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // ── Permissions ────────────────────────────────────────────────────────────
  useEffect(() => {
    if ("Notification" in window) {
      setNotifPerm(Notification.permission);
      if (Notification.permission === "default")
        Notification.requestPermission().then(p => setNotifPerm(p));
    }
    if (navigator.permissions) {
      navigator.permissions.query({ name:"camera" as PermissionName }).then(r => { setCamPerm(r.state); r.onchange = () => setCamPerm(r.state); }).catch(() => {});
      navigator.permissions.query({ name:"microphone" as PermissionName }).then(r => { setMicPerm(r.state); r.onchange = () => setMicPerm(r.state); }).catch(() => {});
    }
    const nav = navigator as Navigator & { contacts?: unknown };
    setHasContacts("contacts" in nav && nav.contacts !== undefined);
  }, []);

  // ── Device Orientation ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null) setDeviceHeading(Math.round(e.alpha));
    };
    type DOEp = typeof DeviceOrientationEvent & { requestPermission?(): Promise<string> };
    const DOE = DeviceOrientationEvent as DOEp;
    if (typeof DOE.requestPermission !== "function") {
      window.addEventListener("deviceorientation", handler, { passive: true });
    }
    return () => window.removeEventListener("deviceorientation", handler);
  }, []);

  // ── Weather + Location ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return;
    setWeatherLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude: lat, longitude: lon } }) => {
        try {
          const [wRes, gRes] = await Promise.all([
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode&temperature_unit=fahrenheit&timezone=auto&forecast_days=2`),
            fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, { headers: { "Accept-Language": "en" } }),
          ]);
          const wj = await wRes.json() as {
            current_weather: { temperature: number; weathercode: number };
            daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; weathercode: number[] };
          };
          const gj = await gRes.json() as { address: { city?: string; town?: string; village?: string; suburb?: string } };
          const a = gj.address;
          setWeather({
            temp: Math.round(wj.current_weather.temperature),
            tempMin: Math.round(wj.daily.temperature_2m_min[0] ?? 0),
            tempMax: Math.round(wj.daily.temperature_2m_max[0] ?? 0),
            condition: wmoCondition(wj.current_weather.weathercode),
            city: a.city ?? a.town ?? a.village ?? a.suburb ?? "Unknown",
            tomorrowMax: Math.round(wj.daily.temperature_2m_max[1] ?? 0),
            tomorrowMin: Math.round(wj.daily.temperature_2m_min[1] ?? 0),
            tomorrowCondition: wmoCondition(wj.daily.weathercode[1] ?? 0),
            lat, lon,
          });
        } catch { /* ignore */ }
        setWeatherLoading(false);
      },
      () => setWeatherLoading(false),
      { timeout: 10000, maximumAge: 600000 }
    );
  }, []);

  // ── System Load ────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const perf = performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } };
      const mem = perf.memory ? Math.round((perf.memory.usedJSHeapSize / perf.memory.totalJSHeapSize) * 100) : Math.round(35 + Math.random() * 30);
      const cpu = Math.round(15 + Math.random() * 60);
      const conn = (navigator as Navigator & { connection?: { downlink?: number } }).connection;
      const dl = conn?.downlink ?? 0;
      const net = dl > 0 ? Math.min(99, Math.round((dl / 50) * 100)) : Math.round(18 + Math.random() * 40);
      const kbs = dl > 0 ? Math.round(dl * 125 * 10) / 10 : Math.round((18 + Math.random() * 30) * 10) / 10;
      setSysLoad({ cpu, mem, net }); setUplinkKbs(kbs);
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => clearInterval(t);
  }, []);

  // ── Conversation reset ─────────────────────────────────────────────────────
  const prevConvIdRef = useRef<number|null>(null);
  useEffect(() => {
    if (prevConvIdRef.current !== activeConversationId) {
      prevConvIdRef.current = activeConversationId;
      setStreamingMessages([]);
    }
  }, [activeConversationId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [streamingMessages]);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 80) + "px";
    }
  }, [input]);

  // ── Share target ───────────────────────────────────────────────────────────
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("share_text"), u = p.get("share_url"), ti = p.get("share_title");
    if (t || u || ti) {
      setInput([ti, t, u].filter(Boolean).join("\n"));
      window.history.replaceState({}, "", window.location.pathname);
      textareaRef.current?.focus();
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Device context builder — injected into every Groq call
  // ─────────────────────────────────────────────────────────────────────────
  const buildDeviceContext = useCallback((): string => {
    const d = new Date();
    const lines: string[] = [
      `Date/time: ${d.toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" })} at ${d.toLocaleTimeString("en-US")}`,
    ];
    if (weather) {
      lines.push(
        `Weather at ${weather.city} (lat ${weather.lat.toFixed(2)}, lon ${weather.lon.toFixed(2)}): ` +
        `${weather.temp}°F, ${weather.condition}. Today low ${weather.tempMin}°F / high ${weather.tempMax}°F. ` +
        `Tomorrow: ${weather.tomorrowCondition}, low ${weather.tomorrowMin}°F / high ${weather.tomorrowMax}°F.`
      );
    }
    if (battery) {
      lines.push(`Battery: ${Math.round(battery.level * 100)}% — ${battery.charging ? "charging" : "on battery"}`);
    }
    const conn = (navigator as Navigator & { connection?: { downlink?: number; effectiveType?: string } }).connection;
    if (conn) lines.push(`Network: ${conn.effectiveType ?? "online"}, ${uplinkKbs} KB/s`);
    else if (navigator.onLine) lines.push(`Network: online`);
    else lines.push(`Network: offline`);
    return lines.join("\n");
  }, [weather, battery, uplinkKbs]);

  // ─────────────────────────────────────────────────────────────────────────
  // Execute action
  // ─────────────────────────────────────────────────────────────────────────
  const executeAction = useCallback((action: JarvisAction) => {
    buzz(50);
    switch (action.type) {
      case "CALL":     window.location.href = `tel:${action.params[0].replace(/\s/g, "")}`; break;
      case "WHATSAPP": window.open(`https://wa.me/${action.params[0].replace(/[\s\-()]/g,"")}?text=${encodeURIComponent(action.params[1]||"")}`, "_blank"); break;
      case "SMS":      window.location.href = `sms:${action.params[0].replace(/[\s\-()]/g,"")}?body=${encodeURIComponent(action.params[1]||"")}`; break;
      case "EMAIL":    window.location.href = `mailto:${action.params[0]}?subject=${encodeURIComponent(action.params[1]||"")}&body=${encodeURIComponent(action.params[2]||"")}`; break;
      case "MAPS":     window.open(`https://maps.google.com/?q=${encodeURIComponent(action.params[0])}`, "_blank"); break;
      case "NAVIGATE": window.open(`https://maps.google.com/?daddr=${encodeURIComponent(action.params[0])}`, "_blank"); break;
      case "OPEN": {
        const url = APP_LINKS[action.params[0].toLowerCase()];
        if (url) window.open(url, "_blank");
        break;
      }
      case "YOUTUBE":  window.open(`https://youtube.com/search?q=${encodeURIComponent(action.params[0])}`, "_blank"); break;
      case "SEARCH":   window.open(`https://google.com/search?q=${encodeURIComponent(action.params[0])}`, "_blank"); break;
      case "SHARE":
        if (navigator.share) navigator.share({ text: action.params.join(" "), title: "Jarvis" });
        else navigator.clipboard.writeText(action.params.join(" "));
        break;
      case "CONTACTS":
        pickContact().then(c => { if (c?.tel) { setInput(`Call ${c.name} ${c.tel}`); textareaRef.current?.focus(); } });
        break;
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // sendMessage
  // ─────────────────────────────────────────────────────────────────────────
  const ensureConversation = useCallback(async (): Promise<number> => {
    if (activeConversationId) return activeConversationId;
    const conv = await createConversation.mutateAsync({ data: { title: "New Chat" } });
    setActiveConversationId(conv.id);
    queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    return conv.id;
  }, [activeConversationId, createConversation, setActiveConversationId, queryClient]);

  const sendMessage = useCallback(async (content: string) => {
    if ((!content.trim() && pendingAttachments.length === 0) || isStreaming) return;

    const intent = detectInputIntent(content);
    if (intent) setPendingIntent(intent);

    const convId = await ensureConversation();
    setInput("");
    const snapped = pendingAttachments; setPendingAttachments([]);
    const imageAtts = snapped.filter(a => a.type === "image");
    const otherAtts = snapped.filter(a => a.type === "other");
    let finalContent = content.trim();
    if (imageAtts.length) finalContent += (finalContent ? "\n" : "") + imageAtts.map(a => `[Image: ${a.name}]`).join(" ");
    if (otherAtts.length) finalContent += (finalContent ? "\n" : "") + otherAtts.map(a => `[File: ${a.name}]`).join(" ");

    buzz(30);
    const ts = new Date().toISOString();
    const userMsg: StreamingMessage = { id:`u-${Date.now()}`, role:"user", content:finalContent, imageUrl:imageAtts[0]?.url, createdAt:ts };
    setStreamingMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    const assistantId = `a-${Date.now()}`;
    setStreamingMessages(prev => [...prev, { id:assistantId, role:"assistant", content:"", streaming:true, createdAt:new Date().toISOString() }]);

    let fullResponse = "";
    try {
      const res = await fetch(`/api/conversations/${convId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-id": getSessionId() },
        // Inject live device context so Jarvis knows real weather, time, battery
        body: JSON.stringify({ content, deviceContext: buildDeviceContext() }),
      });
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6)) as { content?: string; done?: boolean };
            if (data.done) break;
            if (data.content) {
              fullResponse += data.content;
              const display = fullResponse.replace(/\[ACTION:[^\]]*\]/g, "").trim();
              setStreamingMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: display } : m));
            }
          } catch { /* ignore */ }
        }
      }
    } finally {
      setIsStreaming(false);
      const { cleanText, actions } = parseActions(fullResponse);
      setStreamingMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: cleanText, streaming: false } : m));
      if (actions.length > 0) setActionMap(prev => ({ ...prev, [assistantId]: actions }));
      setPendingIntent(null);
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      if (convId) queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(convId) });
      if (cleanText && chatVoiceOn) {
        speakText(cleanText);
        if (notifPerm === "granted" && document.hidden)
          new Notification("Jarvis", { body: cleanText.slice(0, 80), icon: "/favicon.svg" });
      }
    }
  }, [isStreaming, ensureConversation, queryClient, pendingAttachments, speakText, chatVoiceOn, notifPerm, buildDeviceContext]);

  // Keep a ref so wake word callback always gets the latest sendMessage
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  // ─────────────────────────────────────────────────────────────────────────
  // Wake word — "Jarvis ..."
  // ─────────────────────────────────────────────────────────────────────────
  const stopWakeMode = useCallback(() => {
    wakeModeRef.current = false;
    setWakeModeOn(false);
    setInterimText("");
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    recognitionRef.current = null;
  }, []);

  const isSpeakingRef = useRef(false);

  // Keep isSpeakingRef in sync with ElevenLabs TTS state so the wake word
  // recognition doesn't pick up Jarvis's own voice from the speaker.
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
    if (isSpeaking && wakeModeRef.current && recognitionRef.current) {
      // Abort mic while Jarvis speaks — onend will restart it after TTS finishes
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
    }
  }, [isSpeaking]);

  const startWakeMode = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) return;
    wakeModeRef.current = true;
    setWakeModeOn(true);
    buzz([50, 50, 50]);

    const createAndStartRec = () => {
      if (!wakeModeRef.current) return;
      const SR2 = getSpeechRecognition();
      if (!SR2) return;

      const rec = new SR2();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      recognitionRef.current = rec;

      rec.onresult = (event) => {
        // Ignore input while Jarvis is speaking to prevent it hearing itself
        if (isSpeakingRef.current) return;
        let transcript = "";
        let hasFinal = false;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
          if (event.results[i].isFinal) hasFinal = true;
        }
        if (!hasFinal) { setInterimText(transcript); return; }
        setInterimText("");
        // Match "Jarvis ..." anywhere in the transcript (not just at start)
        const wakeMatch = transcript.trim().match(/jarvis[,.]?\s+(.+)/i);
        if (wakeMatch) {
          const command = wakeMatch[1].trim();
          if (command) {
            buzz([100, 50, 100]);
            isSpeakingRef.current = true;
            sendMessageRef.current(command);
            // Re-enable mic input after a generous window for TTS to finish
            setTimeout(() => { isSpeakingRef.current = false; }, 8000);
          }
        }
      };

      rec.onend = () => {
        // Must create a NEW instance — browsers don't allow restarting a stopped one.
        // Delay restart until Jarvis is done speaking so mic doesn't pick up TTS audio.
        if (wakeModeRef.current) {
          const delay = isSpeakingRef.current ? 1500 : 400;
          setTimeout(createAndStartRec, delay);
        }
      };

      rec.onerror = (e) => {
        if (e.error === "not-allowed") {
          wakeModeRef.current = false;
          setWakeModeOn(false);
        }
        // 'no-speech', 'aborted' etc. — onend fires next and will restart
      };

      try { rec.start(); } catch {
        wakeModeRef.current = false;
        setWakeModeOn(false);
      }
    };

    createAndStartRec();
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { stopWakeMode(); }, [stopWakeMode]);

  // ─────────────────────────────────────────────────────────────────────────
  // Other handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };
  const handleNewChat = () => { setActiveConversationId(null); setStreamingMessages([]); setSidebarOpen(false); setPendingIntent(null); };
  const handleDeleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteConversation.mutateAsync({ id });
    if (activeConversationId === id) { setActiveConversationId(null); setStreamingMessages([]); }
    queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
  };
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); if (!files.length) return; e.target.value = "";
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const type: PendingAttachment["type"] = file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") || file.type.startsWith("video/") ? "audio" : "other";
      if (type === "audio") {
        try {
          const convId = await ensureConversation();
          const fd = new FormData(); fd.append("audio", file, file.name);
          const res = await fetch(`/api/conversations/${convId}/transcribe`, { method:"POST", body:fd });
          const { transcript } = await res.json() as { transcript?: string };
          if (transcript?.trim()) setInput(prev => prev ? prev + " " + transcript : transcript);
        } catch { } URL.revokeObjectURL(url);
      } else {
        setPendingAttachments(prev => [...prev, { id:`att-${Date.now()}-${Math.random()}`, type, name:file.name, url, blob:file }]);
      }
    }
  }, [ensureConversation]);
  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments(prev => { const a = prev.find(x => x.id === id); if (a) URL.revokeObjectURL(a.url); return prev.filter(x => x.id !== id); });
  }, []);
  const toggleMic = async () => {
    if (isRecording) { mediaRecorderRef.current?.stop(); setIsRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true }); setMicPerm("granted");
      const mr = new MediaRecorder(stream); mediaRecorderRef.current = mr; chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type:"audio/webm" });
        const convId = await ensureConversation();
        const fd = new FormData(); fd.append("audio", blob, "audio.webm");
        const res = await fetch(`/api/conversations/${convId}/transcribe`, { method:"POST", body:fd });
        const { transcript } = await res.json() as { transcript?: string };
        if (transcript?.trim()) sendMessage(transcript);
      };
      mr.start(); setIsRecording(true); buzz([100,50,100]);
    } catch { }
  };
  const handleCopy = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); });
  }, []);
  const handleFeedback = useCallback((id: string, type: "up"|"down") => {
    setFeedbackMap(prev => { if (prev[id] === type) { const n = { ...prev }; delete n[id]; return n; } return { ...prev, [id]: type }; });
  }, []);
  const handlePlayMessage = useCallback((id: string, content: string) => {
    if (playingId === id) { cancelSpeech(); setPlayingId(null); return; }
    setPlayingId(id); speakTextWithVoice(content, selectedVoiceId, () => setPlayingId(null));
  }, [playingId, cancelSpeech, speakTextWithVoice, selectedVoiceId]);

  // Compose display messages
  const displayMessages: StreamingMessage[] =
    streamingMessages.length > 0 || isStreaming
      ? streamingMessages
      : messages.map(m => ({ id: String(m.id), role: m.role as "user"|"assistant", content: m.content, createdAt: String(m.createdAt) }));

  // Derived HUD values
  const HH = String(now.getHours()).padStart(2, "0");
  const MM = String(now.getMinutes()).padStart(2, "0");
  const SS = String(now.getSeconds()).padStart(2, "0");
  const dayIdx = now.getDay();
  const dateStr = `${String(now.getDate()).padStart(2,"0")} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const batPct = battery ? Math.round(battery.level * 100) : null;
  const msgCount = displayMessages.length;

  const notifItems = [
    { Icon: Phone,         label:"PHONE", val: 0 },
    { Icon: MessageSquare, label:"MSG",   val: msgCount },
    { Icon: Mail,          label:"MAIL",  val: notifPerm === "granted" ? 0 : "—" },
    { Icon: Globe,         label:"WEB",   val: navigator.onLine ? 1 : 0 },
  ];

  const hasSpeechRecognition = !!getSpeechRecognition();

  // ─────────────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background:"#04040a" }} data-testid="chat-page">

      {sidebarOpen && <div className="fixed inset-0 z-40" onClick={() => setSidebarOpen(false)}/>}

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-full w-72 z-50 flex flex-col transform transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background:"#070712", borderRight:"1px solid rgba(0,212,255,0.15)" }}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom:"1px solid rgba(0,212,255,0.1)" }}>
          <span style={{ fontFamily:"'Orbitron',sans-serif", color:"#00d4ff", fontSize:13, letterSpacing:"0.2em", fontWeight:700 }}>JARVIS</span>
          <button onClick={() => setSidebarOpen(false)} className="p-1 text-white/40 hover:text-white rounded"><X size={18}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <p style={{ fontSize:9, color:"rgba(0,212,255,0.4)", letterSpacing:"0.2em", fontFamily:"'Orbitron',sans-serif" }} className="uppercase mb-3 px-2">SESSIONS</p>
          {conversations.length === 0
            ? <p className="text-white/30 text-sm px-2" style={{ fontFamily:"Inter,sans-serif" }}>No sessions yet</p>
            : <div className="space-y-0.5">
              {conversations.map(conv => (
                <div key={conv.id} data-testid={`conversation-item-${conv.id}`}
                  onClick={() => { setActiveConversationId(conv.id); setSidebarOpen(false); }}
                  className={`group flex items-center gap-2 px-3 py-2.5 rounded cursor-pointer transition-all ${activeConversationId === conv.id ? "bg-cyan-500/10 text-cyan-300" : "text-white/50 hover:bg-white/5 hover:text-white"}`}>
                  <MessageSquare size={13} className="shrink-0 opacity-60"/>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate" style={{ fontFamily:"Inter,sans-serif" }}>{conv.title}</p>
                    {conv.preview && <p className="text-xs text-white/25 truncate mt-0.5" style={{ fontFamily:"Inter,sans-serif" }}>{conv.preview}</p>}
                  </div>
                  <button data-testid={`delete-conversation-${conv.id}`} onClick={e => handleDeleteConversation(conv.id, e)} className="opacity-30 group-hover:opacity-100 p-1 rounded hover:text-red-400 active:text-red-400 transition-all shrink-0"><Trash2 size={12}/></button>
                </div>
              ))}
            </div>}
        </div>
        <div className="p-4" style={{ borderTop:"1px solid rgba(0,212,255,0.1)" }}>
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background:"rgba(0,212,255,0.1)", border:"1px solid rgba(0,212,255,0.3)" }}>
              <User size={14} className="text-cyan-400"/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white font-medium truncate" style={{ fontFamily:"Inter,sans-serif" }}>Jarvis AI</p>
              <p style={{ fontSize:9, color:"rgba(0,212,255,0.5)", fontFamily:"'Orbitron',sans-serif" }}>CONNECTED</p>
            </div>
          </div>
        </div>
      </aside>

      {voicePickerOpen && <VoicePicker onClose={() => setVoicePickerOpen(false)}/>}

      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-3 py-2 z-30"
        style={{ background:"#04040a", borderBottom:"1px solid rgba(0,212,255,0.15)" }}>
        <button data-testid="hamburger-menu" onClick={() => setSidebarOpen(true)} className="p-2 text-white/40 hover:text-cyan-400 transition-colors"><Menu size={19}/></button>
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1.5">
            <svg width="15" height="9" viewBox="0 0 36 20" fill="none">
              <path d="M18 10C18 4.5 14 1 9.5 1C5 1 1 5 1 10C1 15 5 19 9.5 19C14 19 18 14.5 18 10C18 4.5 22 1 26.5 1C31 1 35 5 35 10C35 15 31 19 26.5 19C22 19 18 14.5 18 10Z" stroke="#00d4ff" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            </svg>
            <span style={{ fontFamily:"'Orbitron',sans-serif", color:"#fff", fontSize:18, fontWeight:700, letterSpacing:"0.25em" }}>JARVIS</span>
          </div>
          <span style={{ fontSize:8, color:"rgba(0,212,255,0.55)", letterSpacing:"0.2em", fontFamily:"'Orbitron',sans-serif" }}>AI ASSISTANT SYSTEM V4.2</span>
        </div>
        <div className="flex items-center gap-0.5">
          {/* Always-listening wake word toggle */}
          {hasSpeechRecognition && (
            <button onClick={wakeModeOn ? stopWakeMode : startWakeMode}
              className={`p-1.5 rounded-full transition-all ${wakeModeOn ? "animate-pulse" : "text-white/40 hover:text-cyan-400"}`}
              style={wakeModeOn ? { color:"#ef4444", background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.4)" } : {}}
              title={wakeModeOn ? 'Stop always-listening' : 'Always listen — say "Jarvis..."'}>
              <Antenna size={15}/>
            </button>
          )}
          <button data-testid="tts-mute-button" onClick={() => setChatVoiceOn(!chatVoiceOn)}
            className={`p-1.5 rounded transition-colors ${chatVoiceOn ? "text-white/40 hover:text-cyan-400" : "text-red-400"}`}>
            {chatVoiceOn ? <Volume2 size={16}/> : <VolumeX size={16}/>}
          </button>
          <button data-testid="voice-picker-button" onClick={() => setVoicePickerOpen(true)} className="p-1.5 text-white/40 hover:text-cyan-400 rounded transition-colors"><AudioLines size={16}/></button>
          <button onClick={() => {
            const text = displayMessages.map(m => `${m.role === "assistant" ? "JARVIS" : "YOU"}: ${m.content}`).join("\n\n");
            if (navigator.share) navigator.share({ text, title:"Jarvis Conversation" });
            else navigator.clipboard.writeText(text);
          }} className="p-1.5 text-white/40 hover:text-cyan-400 rounded transition-colors" title="Share conversation"><Share2 size={15}/></button>
          <button data-testid="new-chat-button" onClick={handleNewChat} className="p-1.5 text-white/40 hover:text-cyan-400 rounded transition-colors"><Plus size={18}/></button>
        </div>
      </header>

      {/* Wake mode banner */}
      {wakeModeOn && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-1 px-3"
          style={{ background:"rgba(239,68,68,0.08)", borderBottom:"1px solid rgba(239,68,68,0.25)" }}>
          <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"/>
          <span style={{ fontSize:9, color:"rgba(239,68,68,0.85)", fontFamily:"'Orbitron',sans-serif", letterSpacing:"0.15em" }}>
            {interimText ? `HEARING: ${interimText.toUpperCase()}` : 'ALWAYS LISTENING · SAY "JARVIS ..."'}
          </span>
        </div>
      )}

      <div className="shrink-0 flex items-center justify-center py-0.5" style={{ borderBottom:"1px solid rgba(0,212,255,0.07)" }}>
        <span style={{ fontSize:8, color:"rgba(0,212,255,0.35)", letterSpacing:"0.25em", fontFamily:"'Orbitron',sans-serif" }}>SYSTEM INTERFACE · ENCRYPTED</span>
      </div>

      {/* HUD 3-column */}
      <div className="shrink-0 grid" style={{ height:224, gridTemplateColumns:"88px 1fr 106px", borderBottom:"1px solid rgba(0,212,255,0.18)", background:"rgba(0,4,10,0.7)" }}>

        {/* LEFT */}
        <div className="flex flex-col gap-1 p-1.5 overflow-hidden" style={{ borderRight:"1px solid rgba(0,212,255,0.12)" }}>
          <div className="rounded p-1.5 shrink-0" style={{ border:"1px solid rgba(0,212,255,0.2)", background:"rgba(0,18,28,0.7)" }}>
            <div style={{ fontSize:7, color:"rgba(0,212,255,0.55)", letterSpacing:"0.2em", fontFamily:"'Orbitron',sans-serif", marginBottom:2 }}>LOCAL TIME</div>
            <div style={{ fontFamily:"monospace", color:"#00d4ff", fontSize:19, fontWeight:700, lineHeight:1 }}>{HH}:{MM}</div>
            <div style={{ fontFamily:"monospace", color:"rgba(0,212,255,0.65)", fontSize:7.5, marginTop:2 }}>{dateStr}</div>
            <div className="flex gap-0.5 mt-1">
              {DAYS.map((d,i) => (
                <span key={d} style={{ fontSize:6.5, fontFamily:"monospace", color:i===dayIdx?"#00d4ff":"rgba(255,255,255,0.2)", background:i===dayIdx?"rgba(0,212,255,0.15)":"transparent", borderRadius:2, padding:"0 1px" }}>{d[0]}</span>
              ))}
            </div>
          </div>
          <div className="rounded p-1.5 flex-1 overflow-hidden" style={{ border:"1px solid rgba(0,212,255,0.2)", background:"rgba(0,18,28,0.7)" }}>
            <div style={{ fontSize:7, color:"rgba(0,212,255,0.55)", letterSpacing:"0.18em", fontFamily:"'Orbitron',sans-serif", marginBottom:4 }}>NOTIFICATIONS</div>
            {notifItems.map(({ Icon, label, val }) => (
              <div key={label} className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1" style={{ color:"rgba(0,212,255,0.6)" }}><Icon size={8}/><span style={{ fontSize:7, fontFamily:"'Orbitron',sans-serif" }}>{label}</span></div>
                <span style={{ fontSize:9, fontFamily:"monospace", fontWeight:700, color:val===0||val==="—"?"rgba(0,212,255,0.45)":"#00d4ff" }}>{val}</span>
              </div>
            ))}
          </div>
          <div className="rounded p-1.5 shrink-0" style={{ border:"1px solid rgba(0,212,255,0.2)", background:"rgba(0,18,28,0.7)" }}>
            <div style={{ fontSize:7, color:"rgba(0,212,255,0.55)", letterSpacing:"0.18em", fontFamily:"'Orbitron',sans-serif", marginBottom:3 }}>POWER</div>
            <div className="relative h-2 rounded-full overflow-hidden mb-1" style={{ background:"rgba(0,212,255,0.1)" }}>
              <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000" style={{ width:batPct!==null?`${batPct}%`:"70%", background:batPct!==null&&batPct<20?"#ef4444":"#00d4ff" }}/>
            </div>
            <div style={{ fontFamily:"monospace", fontSize:10, fontWeight:700, color:"#00d4ff" }}>{batPct!==null?`${batPct}%`:"—"}</div>
            <div style={{ fontSize:7, color:"rgba(0,212,255,0.45)", fontFamily:"'Orbitron',sans-serif" }}>{battery?.charging?"CHARGING":batPct!==null?"ON BATTERY":"N/A"}</div>
          </div>
        </div>

        {/* CENTER HUD */}
        <div className="relative flex items-center justify-center overflow-hidden" style={{ background:"rgba(0,5,12,0.85)" }}>
          <svg className="absolute inset-0 w-full h-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
            <defs><pattern id="hud-grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M 16 0 L 0 0 0 16" fill="none" stroke="#00d4ff" strokeWidth="0.5"/></pattern></defs>
            <rect width="100%" height="100%" fill="url(#hud-grid)"/>
          </svg>
          <div className="relative flex items-center justify-center" style={{ width:"min(180px,100%)", height:"min(180px,100%)" }}>
            <HudCenter msgCount={msgCount} ss={SS} speaking={isSpeaking}/>
          </div>
          <div className="absolute top-1 left-0 right-0 flex justify-center">
            <span style={{ fontSize:7, fontFamily:"monospace", color:"rgba(0,212,255,0.35)" }}>{HH}:{MM}:{SS}</span>
          </div>
          <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-2">
            <span style={{ fontSize:6, fontFamily:"'Orbitron',sans-serif", color:camPerm==="granted"?"#00ff88":"rgba(255,255,255,0.2)" }}>CAM:{camPerm==="granted"?"ON":"OFF"}</span>
            <span style={{ fontSize:6, fontFamily:"'Orbitron',sans-serif", color:micPerm==="granted"?"#00ff88":"rgba(255,255,255,0.2)" }}>MIC:{micPerm==="granted"?"ON":"OFF"}</span>
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex flex-col gap-1 p-1.5 overflow-hidden" style={{ borderLeft:"1px solid rgba(0,212,255,0.12)" }}>
          <div className="rounded p-1 shrink-0" style={{ border:"1px solid rgba(0,212,255,0.2)", background:"rgba(0,18,28,0.7)" }}>
            <div style={{ fontSize:7, color:"rgba(0,212,255,0.55)", letterSpacing:"0.18em", fontFamily:"'Orbitron',sans-serif", marginBottom:2 }}>PROXIMITY</div>
            <div className="flex items-center justify-center gap-1">
              <RadarPanel heading={deviceHeading} size={34}/>
              {deviceHeading !== null && <div style={{ fontSize:6, color:"rgba(0,212,255,0.5)", fontFamily:"monospace", writingMode:"vertical-rl" }}>{deviceHeading}°</div>}
            </div>
          </div>
          <div className="rounded p-1.5 flex-1 overflow-hidden" style={{ border:"1px solid rgba(0,212,255,0.2)", background:"rgba(0,18,28,0.7)", minHeight:0 }}>
            <div style={{ fontSize:7, color:"rgba(0,212,255,0.55)", letterSpacing:"0.18em", fontFamily:"'Orbitron',sans-serif", marginBottom:2 }}>WEATHER</div>
            {weatherLoading
              ? <div style={{ fontSize:7, color:"rgba(0,212,255,0.4)", fontFamily:"monospace" }}>SCANNING...</div>
              : weather
                ? <>
                  <div style={{ fontSize:7, color:"#00d4ff", fontWeight:700, fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{weather.city}</div>
                  <div style={{ fontSize:15, color:"#fff", fontFamily:"monospace", fontWeight:700, lineHeight:1.1 }}>{weather.temp}°F</div>
                  <div style={{ fontSize:6.5, color:"rgba(0,212,255,0.7)", fontFamily:"'Orbitron',sans-serif", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{weather.condition}</div>
                  <div style={{ fontSize:6.5, color:"rgba(255,255,255,0.35)", fontFamily:"monospace" }}>L:{weather.tempMin}° H:{weather.tempMax}°</div>
                  <div style={{ fontSize:6.5, color:"rgba(0,212,255,0.5)", fontFamily:"monospace", marginTop:2 }}>TMR {weather.tomorrowCondition} H:{weather.tomorrowMax}°</div>
                </>
                : <div style={{ fontSize:7, color:"rgba(255,255,255,0.25)", fontFamily:"Inter,sans-serif", lineHeight:1.5 }}>Allow location<br/>for weather</div>
            }
          </div>
          <div className="rounded p-1.5 shrink-0" style={{ border:"1px solid rgba(0,212,255,0.2)", background:"rgba(0,18,28,0.7)" }}>
            <div style={{ fontSize:7, color:"rgba(0,212,255,0.55)", letterSpacing:"0.18em", fontFamily:"'Orbitron',sans-serif", marginBottom:3 }}>SYS LOAD</div>
            {[{label:"CPU",val:sysLoad.cpu,color:"#00d4ff"},{label:"MEM",val:sysLoad.mem,color:"#f59e0b"},{label:"NET",val:sysLoad.net,color:"#10b981"}].map(({ label, val, color }) => (
              <div key={label} className="mb-1">
                <div className="flex justify-between" style={{ marginBottom:2 }}>
                  <span style={{ fontSize:7, fontFamily:"'Orbitron',sans-serif", color }}>{label}</span>
                  <span style={{ fontSize:7, fontFamily:"monospace", color:"rgba(255,255,255,0.55)" }}>{val}%</span>
                </div>
                <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background:"rgba(255,255,255,0.07)" }}>
                  <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700" style={{ width:`${val}%`, background:color }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* App Launcher Strip — real brand icons */}
      <div className="shrink-0 overflow-x-auto flex items-center gap-2 px-3 py-2"
        style={{ background:"rgba(0,6,14,0.97)", borderBottom:"1px solid rgba(0,212,255,0.12)" }}>
        {LAUNCHER.map(app => (
          <button key={app.id} onClick={app.action}
            className="flex flex-col items-center gap-1 shrink-0 active:scale-95 transition-transform"
            style={{ minWidth:50 }}>
            <AppIcon slug={app.slug} iconColor={app.iconColor} bg={app.bg} emoji={app.emoji}/>
            <span style={{ fontSize:6, color:"rgba(0,212,255,0.45)", fontFamily:"'Orbitron',sans-serif", letterSpacing:"0.06em" }}>{app.label}</span>
          </button>
        ))}
        {hasContacts && (
          <button onClick={() => pickContact().then(c => { if (c?.tel) { setInput(`Call ${c.name} ${c.tel}`); textareaRef.current?.focus(); } })}
            className="flex flex-col items-center gap-1 shrink-0 active:scale-95 transition-transform" style={{ minWidth:50 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:"rgba(0,212,255,0.12)", border:"1px solid rgba(0,212,255,0.3)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:24 }}>👤</span>
            </div>
            <span style={{ fontSize:6, color:"rgba(0,212,255,0.45)", fontFamily:"'Orbitron',sans-serif" }}>CONTACTS</span>
          </button>
        )}
        {/* iOS compass permission button */}
        {deviceHeading === null && (
          <button onClick={() => {
            type DOEp = typeof DeviceOrientationEvent & { requestPermission?(): Promise<string> };
            const DOE = DeviceOrientationEvent as DOEp;
            if (typeof DOE.requestPermission === "function")
              DOE.requestPermission().then(s => {
                if (s === "granted")
                  window.addEventListener("deviceorientation", (e: DeviceOrientationEvent) => { if (e.alpha !== null) setDeviceHeading(Math.round(e.alpha)); }, { passive:true });
              }).catch(() => {});
          }} className="flex flex-col items-center gap-1 shrink-0 active:scale-95 transition-transform" style={{ minWidth:50 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:"rgba(0,212,255,0.08)", border:"1px solid rgba(0,212,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:24 }}>🧭</span>
            </div>
            <span style={{ fontSize:6, color:"rgba(0,212,255,0.45)", fontFamily:"'Orbitron',sans-serif" }}>COMPASS</span>
          </button>
        )}
      </div>

      {/* Pending intent banner */}
      {pendingIntent && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5"
          style={{ background:"rgba(0,212,255,0.08)", borderBottom:"1px solid rgba(0,212,255,0.2)" }}>
          <span style={{ fontSize:9, color:"rgba(0,212,255,0.7)", fontFamily:"'Orbitron',sans-serif", flex:1, letterSpacing:"0.05em" }}>DETECTED ACTION:</span>
          <button onClick={() => executeAction(pendingIntent)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full active:scale-95 transition-all"
            style={{ background:"rgba(0,212,255,0.2)", border:"1px solid rgba(0,212,255,0.5)", color:"#00d4ff", fontSize:10, fontFamily:"'Orbitron',sans-serif", letterSpacing:"0.05em" }}>
            {pendingIntent.label}
          </button>
          <button onClick={() => setPendingIntent(null)} className="p-1 text-white/30 hover:text-white"><X size={12}/></button>
        </div>
      )}

      {/* Chat messages */}
      <main className="flex-1 overflow-y-auto px-3 py-3 space-y-2" data-testid="chat-area" style={{ fontFamily:"Inter,sans-serif" }}>
        {displayMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center pb-8">
            <svg width="44" height="24" viewBox="0 0 36 20" fill="none" className="mb-3 hud-glow">
              <defs><linearGradient id="inf-eg" x1="0" y1="10" x2="36" y2="10" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#7c3aed"/><stop offset="50%" stopColor="#00d4ff"/><stop offset="100%" stopColor="#7c3aed"/></linearGradient></defs>
              <path d="M18 10C18 4.5 14 1 9.5 1C5 1 1 5 1 10C1 15 5 19 9.5 19C14 19 18 14.5 18 10C18 4.5 22 1 26.5 1C31 1 35 5 35 10C35 15 31 19 26.5 19C22 19 18 14.5 18 10Z" stroke="url(#inf-eg)" strokeWidth="2" fill="none" strokeLinecap="round"/>
            </svg>
            <h2 className="text-white/75 text-lg font-semibold mb-1" style={{ fontFamily:"'Orbitron',sans-serif", letterSpacing:"0.05em" }}>How can I help you?</h2>
            <p className="text-white/30 text-xs">Ask me anything — I&apos;m ready when you are.</p>
            {hasSpeechRecognition && !wakeModeOn && (
              <p className="text-white/20 text-xs mt-1">
                Tap <Antenna size={10} className="inline" style={{color:"rgba(255,255,255,0.3)"}}/> in the header then say <span style={{color:"rgba(239,68,68,0.7)"}}>&quot;Jarvis ...&quot;</span> to speak hands-free
              </p>
            )}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {["What's the weather?","Call someone","Open YouTube","Navigate to airport","What time is it?"].map(s => (
                <button key={s} onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                  className="px-2.5 py-1 rounded-full text-xs transition-all hover:opacity-90"
                  style={{ background:"rgba(0,212,255,0.08)", border:"1px solid rgba(0,212,255,0.2)", color:"rgba(0,212,255,0.7)", fontFamily:"Inter,sans-serif" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {displayMessages.map(msg => {
          const isStreamingMsg = "streaming" in msg && msg.streaming;
          const feedback = feedbackMap[msg.id];
          const isCopied = copiedId === msg.id;
          const isPlaying = playingId === msg.id;
          const ts = fmtTime(msg.createdAt);
          const isJarvis = msg.role === "assistant";
          const actions = actionMap[msg.id] || [];

          return (
            <div key={msg.id} data-testid={`message-${msg.id}`}
              className={`flex flex-col ${isJarvis ? "items-start" : "items-end"}`}
              style={{ maxWidth:"88%", marginLeft:isJarvis?0:"auto" }}>
              <span style={{ fontSize:9, fontFamily:"'Orbitron',sans-serif", fontWeight:700, letterSpacing:"0.15em", color:isJarvis?"#00d4ff":"#2dd4bf", marginBottom:3 }}>
                {isJarvis?"JARVIS":"YOU"} {ts}
              </span>
              <div style={{ background:isJarvis?"rgba(0,25,38,0.92)":"rgba(0,28,26,0.92)", border:`1px solid ${isJarvis?"rgba(0,212,255,0.22)":"rgba(45,212,191,0.28)"}`, borderRadius:6, padding:"8px 10px", fontSize:13, color:"rgba(255,255,255,0.85)", lineHeight:1.55, width:"100%" }}>
                {msg.imageUrl && <img src={msg.imageUrl} alt="attachment" className="max-w-full rounded mb-2 object-contain" style={{ maxHeight:200 }}/>}
                {isJarvis
                  ? isStreamingMsg && !msg.content
                    ? <div className="flex items-center gap-1.5 py-1">
                        {[0,1,2].map(i => (
                          <span key={i} className="block rounded-full bg-cyan-400"
                            style={{ width:7, height:7, opacity:0.85,
                              animation:"jarvis-bounce 1.1s ease-in-out infinite",
                              animationDelay:`${i*0.18}s` }}/>
                        ))}
                      </div>
                    : <div className="prose prose-invert prose-sm max-w-none"><ReactMarkdown>{msg.content || ""}</ReactMarkdown></div>
                  : <p className="whitespace-pre-wrap">{msg.content}</p>
                }
              </div>

              {/* Action chips */}
              {isJarvis && !isStreamingMsg && actions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5 px-0.5">
                  {actions.map((action, i) => (
                    <button key={i} onClick={() => executeAction(action)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full active:scale-95 transition-all"
                      style={{ background:"rgba(0,212,255,0.12)", border:"1px solid rgba(0,212,255,0.4)", color:"#00d4ff", fontFamily:"'Orbitron',sans-serif", fontSize:9, letterSpacing:"0.05em" }}>
                      {action.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Message action row */}
              {isJarvis && !isStreamingMsg && msg.content && (
                <div className="flex items-center gap-0.5 px-1 mt-0.5">
                  <button onClick={() => handleCopy(msg.id, msg.content)} className="p-1 rounded transition-colors text-white/20 hover:text-cyan-400" title="Copy">
                    {isCopied ? <Check size={11} className="text-green-400"/> : <Copy size={11}/>}
                  </button>
                  <button onClick={() => handleFeedback(msg.id, "up")} className={`p-1 rounded transition-colors ${feedback==="up"?"text-green-400":"text-white/20 hover:text-white/60"}`}><ThumbsUp size={11}/></button>
                  <button onClick={() => handleFeedback(msg.id, "down")} className={`p-1 rounded transition-colors ${feedback==="down"?"text-red-400":"text-white/20 hover:text-white/60"}`}><ThumbsDown size={11}/></button>
                  <button onClick={() => handlePlayMessage(msg.id, msg.content)} className={`p-1 rounded transition-colors ${isPlaying?"text-cyan-400":"text-white/20 hover:text-white/60"}`}>
                    {isPlaying ? <Square size={11}/> : <Play size={11}/>}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <div ref={chatEndRef}/>
      </main>

      {/* Status bar */}
      <div className="shrink-0 flex items-center gap-2.5 px-2 py-1 overflow-x-auto"
        style={{ background:"rgba(0,4,10,0.95)", borderTop:"1px solid rgba(0,212,255,0.1)" }}>
        {[
          { color:"#00ff88", label:"AI ENGINE NOMINAL",          blink:false },
          { color:"#f59e0b", label:`UPLINK ${uplinkKbs} K/S`,   blink:true },
          { color:"#00d4ff", label:"ENCRYPTION ACTIVE",          blink:false },
          { color:"#a78bfa", label:`SESSION: JARVIS`, blink:false },
          { color:"#00ff88", label:`MESSAGES: ${msgCount}`,      blink:false },
          ...(wakeModeOn ? [{ color:"#ef4444", label:"ALWAYS LISTENING", blink:true }] : []),
        ].map(({ color, label, blink }) => (
          <div key={label} className="flex items-center gap-1 shrink-0">
            <div className={`w-1.5 h-1.5 rounded-full ${blink?"status-blink":""}`} style={{ background:color }}/>
            <span style={{ fontSize:7.5, fontFamily:"'Orbitron',sans-serif", color:"rgba(255,255,255,0.45)", letterSpacing:"0.05em" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Ticker */}
      <div className="shrink-0 overflow-hidden py-0.5" style={{ background:"rgba(0,2,6,0.98)", borderTop:"1px solid rgba(0,212,255,0.07)" }}>
        <div className="ticker-anim">
          <span style={{ fontSize:7, fontFamily:"'Orbitron',sans-serif", color:"rgba(0,212,255,0.38)", letterSpacing:"0.12em" }}>
            JARVIS INTELLIGENCE PLATFORM &nbsp;•&nbsp; ENCRYPTED CHANNEL 7 &nbsp;•&nbsp; ALL SYSTEMS OPERATIONAL &nbsp;•&nbsp; NEURAL NETWORK PROCESSING &nbsp;•&nbsp; CONTEXTUAL ANALYSIS ACTIVE &nbsp;•&nbsp; PERIMETER SECURE &nbsp;•&nbsp; PASSIVE SCAN RUNNING &nbsp;•&nbsp; DATA INTEGRITY VERIFIED &nbsp;•&nbsp; UPLINK STABLE &nbsp;•&nbsp; MULTI-MODAL PROCESSING ENABLED &nbsp;•&nbsp; LEX TECHNOLOGIES DIVISION &nbsp;•&nbsp; PROTOCOL ENGAGED &nbsp;•&nbsp;
          </span>
        </div>
      </div>

      {/* Input bar */}
      <footer className="shrink-0 px-3 pb-4 pt-2" style={{ background:"rgba(4,4,10,0.97)" }} data-testid="input-bar">
        <input ref={fileInputRef} type="file" accept="image/*,audio/*,video/*,.pdf,.txt,.md,.csv" multiple className="hidden" onChange={handleFileSelect}/>

        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 px-1">
            {pendingAttachments.map(att => (
              <div key={att.id} className="relative group shrink-0">
                {att.type === "image"
                  ? <div className="relative">
                    <img src={att.url} alt={att.name} className="w-14 h-14 rounded object-cover" style={{ border:"1px solid rgba(0,212,255,0.3)" }}/>
                    <button onClick={() => removeAttachment(att.id)} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-black text-white/60 hover:text-white flex items-center justify-center" style={{ border:"1px solid rgba(255,255,255,0.2)" }}><X size={8}/></button>
                  </div>
                  : <div className="relative flex items-center gap-1.5 px-2 py-1.5 rounded max-w-[140px]" style={{ background:"rgba(0,212,255,0.06)", border:"1px solid rgba(0,212,255,0.2)" }}>
                    <Paperclip size={10} style={{ color:"rgba(0,212,255,0.6)" }} className="shrink-0"/>
                    <span className="text-white/50 text-xs truncate" style={{ fontFamily:"Inter,sans-serif" }}>{att.name}</span>
                    <button onClick={() => removeAttachment(att.id)} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-black text-white/60 hover:text-white flex items-center justify-center" style={{ border:"1px solid rgba(255,255,255,0.2)" }}><X size={8}/></button>
                  </div>
                }
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-1.5 px-2.5 py-2 rounded-xl"
          style={{ background:"rgba(0,18,28,0.85)", border:`1px solid ${wakeModeOn?"rgba(239,68,68,0.3)":"rgba(0,212,255,0.22)"}` }}>
          <button data-testid="attachment-button" onClick={() => fileInputRef.current?.click()} className="p-1.5 shrink-0 mb-0.5 transition-colors text-white/30 hover:text-cyan-400"><Paperclip size={17}/></button>
          <div className="flex-1">
            <textarea ref={textareaRef} data-testid="chat-input" value={input} onChange={e => { setInput(e.target.value); setPendingIntent(detectInputIntent(e.target.value)); }} onKeyDown={handleKeyDown}
              placeholder={wakeModeOn ? 'Or type here... (saying "Jarvis ..." activates hands-free)' : "Message Jarvis..."}
              rows={1} className="w-full bg-transparent text-white/85 placeholder-white/20 resize-none outline-none text-sm leading-relaxed py-1"
              style={{ maxHeight:80, fontFamily:"Inter,sans-serif" }}/>
          </div>
          <button data-testid="mic-button" onClick={toggleMic}
            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mb-0.5 transition-all ${isRecording?"mic-recording":""}`}
            style={{ background:isRecording?"rgba(239,68,68,0.8)":"rgba(0,212,255,0.1)", border:`1px solid ${isRecording?"rgba(239,68,68,0.7)":"rgba(0,212,255,0.35)"}` }}>
            <Mic size={14} style={{ color:isRecording?"#fff":"#00d4ff" }}/>
          </button>
          <button data-testid="send-button" onClick={() => sendMessage(input)} disabled={!input.trim() || isStreaming}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mb-0.5 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
            style={{ background:"rgba(0,212,255,0.2)", border:"1px solid rgba(0,212,255,0.5)" }}>
            <Send size={14} style={{ color:"#00d4ff" }}/>
            Send
          </button>
        </div>
        <p className="text-center mt-1.5" style={{ fontSize:8, color:"rgba(255,255,255,0.1)", fontFamily:"'Orbitron',sans-serif", letterSpacing:"0.1em" }}>
          POWERED BY LEX Technologies · RESPONSES MAY BE INACCURATE
        </p>
      </footer>
    </div>
  );
}
