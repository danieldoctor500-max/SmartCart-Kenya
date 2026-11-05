import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireRole } from "../auth/role.middleware.js";
import { getOrder, getOrders } from "./orders.controller.js";

const ordersRouter = Router();

ordersRouter.use(requireAuth, requireRole("CUSTOMER"));
ordersRouter.get("/", getOrders);
ordersRouter.get("/:orderId", getOrder);

export default ordersRouter;
