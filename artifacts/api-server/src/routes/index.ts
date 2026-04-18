import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sqlRouter from "./sql";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sqlRouter);

export default router;
