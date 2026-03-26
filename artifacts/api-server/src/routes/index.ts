import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leadScoringRouter from "./lead_scoring";

const router: IRouter = Router();

router.use(healthRouter);
router.use(leadScoringRouter);

export default router;
