import type { IncomingMessage, ServerResponse } from "node:http";
import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

type PinoRequest = IncomingMessage & { id?: unknown };

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: PinoRequest) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: ServerResponse) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req: Request, res: Response) => {
  res.redirect("/api/healthz");
});

app.use("/api", router);

export default app;
