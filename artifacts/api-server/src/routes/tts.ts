import { Router } from "express";
import { textToSpeech } from "../lib/elevenlabs";

const router = Router();

router.post("/tts", async (req, res) => {
  const { text, voice } = req.body as { text?: unknown; voice?: unknown };

  if (typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  if (text.length > 4096) {
    res.status(400).json({ error: "text too long (max 4096 chars)" });
    return;
  }

  const voiceId =
    typeof voice === "string" && voice.trim()
      ? voice.trim()
      : "pNInz6obpgDQGcFmaJgB";

  const clean = text
    .replace(/\[Image:.*?\]/g, "")
    .replace(/\[File:.*?\]/g, "")
    .replace(/```[\s\S]*?```/g, "code block")
    .replace(/`[^`]+`/g, "")
    .replace(/[#*_~>|]/g, "")
    .replace(/\n+/g, " ")
    .trim();

  if (!clean) {
    res.status(400).json({ error: "Empty text after cleaning" });
    return;
  }

  try {
    const buffer = await textToSpeech({ text: clean, voiceId });
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
  } catch (err: unknown) {
    req.log.error({ err }, "TTS request failed");
    res.status(502).json({ error: "TTS generation failed" });
  }
});

export default router;
