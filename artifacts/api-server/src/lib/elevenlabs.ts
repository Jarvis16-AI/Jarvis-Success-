let isSpeaking = false;

type ElevenLabsResult =
  | { success: true; audio: ArrayBuffer }
  | { success: false };

function getApiKey() {
  return process.env.ELEVENLABS_API_KEY;
}

export async function speakWithElevenLabs(
  text: string,
  voiceId: string
): Promise<ElevenLabsResult> {
  const apiKey = getApiKey();

  if (!apiKey) {
    return { success: false };
  }

  // Prevent overlapping audio requests
  if (isSpeaking) {
    return { success: false };
  }

  isSpeaking = true;

  const controller = new AbortController();

  // HARD timeout so fallback is instant
  const timeout = setTimeout(() => {
    controller.abort();
  }, 2500);

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs failed: ${response.status}`);
    }

    const audio = await response.arrayBuffer();

    clearTimeout(timeout);
    isSpeaking = false;

    return {
      success: true,
      audio,
    };
  } catch (err) {
    clearTimeout(timeout);
    isSpeaking = false;

    return {
      success: false,
    };
  }
  }
