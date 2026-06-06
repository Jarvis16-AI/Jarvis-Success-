import { Router, type IRouter } from "express";
import healthRouter from "./health";
import conversationsRouter from "./conversations";
import ttsRouter from "./tts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(conversationsRouter);
router.use(ttsRouter);

export default router;
