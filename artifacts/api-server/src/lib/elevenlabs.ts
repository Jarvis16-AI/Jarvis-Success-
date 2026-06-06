export async function textToSpeech(opts: TTSOptions): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");

  const { text, voiceId, stability = 0.5, similarityBoost = 0.75 } = opts;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "xi-api-key": apiKey,
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
  } finally {
    clearTimeout(timeout);
  }
}
