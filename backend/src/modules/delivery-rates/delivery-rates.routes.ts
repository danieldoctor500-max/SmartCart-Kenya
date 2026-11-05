import { Router } from "express";
import { requireTrustedOrigin } from "../auth/origin.middleware.js";

import {
  createOrReplaceDeliveryRate,
  getDeliveryRateAudit,
  getDeliveryRates,
  patchDeliveryRate,
} from "./delivery-rates.controller.js";

const deliveryRatesRouter = Router();

deliveryRatesRouter.get("/", getDeliveryRates);
deliveryRatesRouter.get("/:rateId/audit", getDeliveryRateAudit);
deliveryRatesRouter.put("/", requireTrustedOrigin, createOrReplaceDeliveryRate);
deliveryRatesRouter.patch(
  "/:rateId",
  requireTrustedOrigin,
  patchDeliveryRate,
);

export default deliveryRatesRouter;
