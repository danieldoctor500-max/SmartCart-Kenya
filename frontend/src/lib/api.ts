
import axios from "axios";

export const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});
