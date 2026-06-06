const API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const BASE_URL = "https://api.elevenlabs.io/v1";
const TTS_MODEL = "eleven_turbo_v2_5";

export interface TTSOptions {
  text: string;
  voiceId: string;
  stability?: number;
  similarityBoost?: number;
}

export async function textToSpeech(opts: TTSOptions): Promise<Buffer> {
  if (!API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  const { text, voiceId, stability = 0.5, similarityBoost = 0.75 } = opts;

  const response = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: TTS_MODEL,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => response.statusText);
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${error}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
