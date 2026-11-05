
import axios from "axios";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "") || "/api/v1";

export const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});
