import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leadScoringRouter from "./lead_scoring";
import scoreAndRouteRouter from "./score_and_route";
import leadProsperRouter from "./leadprosper";

const router: IRouter = Router();

router.use(healthRouter);
router.use(leadScoringRouter);
router.use(scoreAndRouteRouter);
router.use(leadProsperRouter);

export default router;
