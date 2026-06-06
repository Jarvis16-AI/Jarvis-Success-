import { X, Volume2, Check } from "lucide-react";
import { useVoice, ELEVENLABS_VOICES, type ElevenLabsVoice } from "@/context/voice-context";

interface VoicePickerProps {
  onClose: () => void;
}

export function VoicePicker({ onClose }: VoicePickerProps) {
  const { selectedVoiceId, setSelectedVoiceId, previewVoice } = useVoice();

  const males   = ELEVENLABS_VOICES.filter((v) => v.gender === "Male");
  const females = ELEVENLABS_VOICES.filter((v) => v.gender === "Female");
  const neutral = ELEVENLABS_VOICES.filter((v) => v.gender === "Neutral");

  const VoiceRow = ({ voice }: { voice: ElevenLabsVoice }) => {
    const isSelected = voice.id === selectedVoiceId;
    return (
      <button
        onClick={() => setSelectedVoiceId(voice.id)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
          isSelected
            ? "bg-blue-600/20 border border-blue-500/30"
            : "hover:bg-white/6 border border-transparent"
        }`}
      >
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
            isSelected ? "border-blue-500 bg-blue-600" : "border-white/20 bg-transparent"
          }`}
        >
          {isSelected && <Check size={11} className="text-white" />}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isSelected ? "text-white" : "text-white/80"}`}>
            {voice.name}
          </p>
          <p className="text-xs text-white/35 mt-0.5">
            {voice.accent} · {voice.description}
          </p>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            previewVoice(voice.id);
          }}
          className="p-2 rounded-lg text-white/30 hover:text-blue-400 hover:bg-blue-500/10 transition-colors shrink-0"
          title="Preview this voice"
        >
          <Volume2 size={14} />
        </button>
      </button>
    );
  };

  const Section = ({ label, voices }: { label: string; voices: ElevenLabsVoice[] }) =>
    voices.length === 0 ? null : (
      <section className="mb-4">
        <p className="text-xs text-white/30 uppercase tracking-widest px-3 mb-2">{label}</p>
        <div className="space-y-0.5">
          {voices.map((v) => (
            <VoiceRow key={v.id} voice={v} />
          ))}
        </div>
      </section>
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#111111] border border-white/10 rounded-t-3xl max-h-[78vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-white/8 shrink-0">
          <div>
            <h2 className="text-white font-semibold text-base">Jarvis Voice</h2>
            <p className="text-white/40 text-xs mt-0.5">
              ElevenLabs voices · tap <Volume2 size={10} className="inline" /> to preview
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/8 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-3">
          <Section label="Male"    voices={males} />
          <Section label="Female"  voices={females} />
          <Section label="Neutral" voices={neutral} />
        </div>
      </div>
    </div>
  );
}
