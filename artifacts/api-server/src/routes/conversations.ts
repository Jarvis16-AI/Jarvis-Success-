import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, conversationsTable, messagesTable } from "@workspace/db";
import {
  CreateConversationBody,
  GetConversationParams,
  DeleteConversationParams,
  ListMessagesParams,
  SendMessageParams,
  SendMessageBody,
  UpdateConversationTitleParams,
  UpdateConversationTitleBody,
  ListConversationsResponse,
  GetConversationResponse,
  ListMessagesResponse,
  UpdateConversationTitleResponse,
} from "@workspace/api-zod";
import { groq, CHAT_MODEL, TITLE_MODEL, TRANSCRIPTION_MODEL, SYSTEM_PROMPT } from "../lib/groq";
import multer from "multer";
import { toFile } from "openai";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const ser = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function getSession(req: import("express").Request): string | null {
  const h = req.headers["x-session-id"];
  return typeof h === "string" && h.length > 0 ? h : null;
}

router.get("/conversations", async (req, res): Promise<void> => {
  const sessionId = getSession(req);
  const query = db.select().from(conversationsTable).orderBy(desc(conversationsTable.updatedAt));
  const rows = sessionId
    ? await query.where(eq(conversationsTable.sessionId, sessionId))
    : await query.where(eq(conversationsTable.sessionId, "___never___"));
  res.json(ListConversationsResponse.parse(ser(rows)));
});

router.post("/conversations", async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const sessionId = getSession(req);
  const [conv] = await db
    .insert(conversationsTable)
    .values({ title: parsed.data.title, sessionId: sessionId ?? undefined })
    .returning();
  res.status(201).json(GetConversationResponse.parse(ser(conv)));
});

router.get("/conversations/:id", async (req, res): Promise<void> => {
  const params = GetConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.json(GetConversationResponse.parse(ser(conv)));
});

router.delete("/conversations/:id", async (req, res): Promise<void> => {
  const params = DeleteConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = ListMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conv] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const rows = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, params.data.id))
    .orderBy(messagesTable.createdAt);
  res.json(ListMessagesResponse.parse(ser(rows)));
});

router.post("/conversations/:id/chat", async (req, res): Promise<void> => {
  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SendMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  await db.insert(messagesTable).values({
    conversationId: params.data.id,
    role: "user",
    content: body.data.content,
  });

  const history = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, params.data.id))
    .orderBy(messagesTable.createdAt);

  const contextualSystem = body.data.deviceContext
    ? `${SYSTEM_PROMPT}\n\n## LIVE DEVICE CONTEXT (as of this message — always use this data when answering questions about weather, time, battery, or network)\n${body.data.deviceContext}`
    : SYSTEM_PROMPT;

  const chatMessages = [
    { role: "system" as const, content: contextualSystem },
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";
  const stream = await groq.chat.completions.create({
    model: CHAT_MODEL,
    messages: chatMessages,
    stream: true,
    max_tokens: 4096,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  }

  await db.insert(messagesTable).values({
    conversationId: params.data.id,
    role: "assistant",
    content: fullResponse,
  });

  const preview = body.data.content.slice(0, 80);
  await db
    .update(conversationsTable)
    .set({ updatedAt: new Date(), preview })
    .where(eq(conversationsTable.id, params.data.id));

  if (conv.title === "New Chat") {
    const titleResponse = await groq.chat.completions.create({
      model: TITLE_MODEL,
      messages: [
        {
          role: "user",
          content: `Generate a very short title (max 5 words) for a conversation that starts with: "${body.data.content}". Respond with only the title, no quotes.`,
        },
      ],
      max_tokens: 20,
    });
    const title = titleResponse.choices[0]?.message?.content?.trim() ?? "New Chat";
    await db
      .update(conversationsTable)
      .set({ title })
      .where(eq(conversationsTable.id, params.data.id));
  }

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

router.post("/conversations/:id/transcribe", upload.single("audio"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "No audio file provided" });
    return;
  }

  const audioFile = await toFile(req.file.buffer, req.file.originalname || "audio.webm", {
    type: req.file.mimetype || "audio/webm",
  });

  const transcription = await groq.audio.transcriptions.create({
    file: audioFile,
    model: TRANSCRIPTION_MODEL,
    response_format: "json",
  });

  res.json({ transcript: transcription.text });
});

router.patch("/conversations/:id/title", async (req, res): Promise<void> => {
  const params = UpdateConversationTitleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateConversationTitleBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [conv] = await db
    .update(conversationsTable)
    .set({ title: body.data.title, updatedAt: new Date() })
    .where(eq(conversationsTable.id, params.data.id))
    .returning();
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.json(UpdateConversationTitleResponse.parse(ser(conv)));
});

export default router;
