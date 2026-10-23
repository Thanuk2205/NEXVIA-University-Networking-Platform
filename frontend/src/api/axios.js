import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "/api/v1";
const api = axios.create({ baseURL, withCredentials: true, timeout: 20000 });
const csrfCookie = () =>
  document.cookie
    .split("; ")
    .find((v) => v.startsWith("nx_csrf="))
    ?.slice(8);
let csrfRequest;
api.interceptors.request.use(async (config) => {
  if (!["get", "head", "options"].includes(config.method)) {
    if (!csrfCookie()) {
      csrfRequest ||= axios
        .get(`${baseURL}/auth/csrf`, { withCredentials: true })
        .finally(() => {
          csrfRequest = null;
        });
      await csrfRequest;
    }
    config.headers["X-CSRF-Token"] = decodeURIComponent(csrfCookie() || "");
    if (!config.headers["Idempotency-Key"])
      config.headers["Idempotency-Key"] = crypto.randomUUID();
  }
  return config;
});
let refreshRequest;
export function renewSession() {
  refreshRequest ||= api.post("/auth/refresh", {}).finally(() => {
    refreshRequest = null;
  });
  return refreshRequest;
}
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (
      error.response?.status === 401 &&
      config &&
      !config._retried &&
      !config.url.startsWith("/auth/")
    ) {
      config._retried = true;
      await renewSession();
      return api(config);
    }
    throw error;
  },
);

export const errorMessage = (error) =>
  error.response?.data?.error?.message ||
  "The request could not be completed. Please try again.";
export const fetchData = (url) =>
  api.get(url).then((response) => response.data.data);

export default api;
