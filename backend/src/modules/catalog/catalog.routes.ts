
import { Router } from "express";
import {
  getCatalogCategories,
  getCatalogProductByStoreAndSlug,
  getCatalogProductBySlug,
  getCatalogProducts,
} from "./catalog.controller.js";

const catalogRouter = Router();

catalogRouter.get("/products", getCatalogProducts);
catalogRouter.get(
  "/stores/:storeSlug/products/:productSlug",
  getCatalogProductByStoreAndSlug,
);
catalogRouter.get("/products/:slug", getCatalogProductBySlug);
catalogRouter.get("/categories", getCatalogCategories);

export default catalogRouter;
