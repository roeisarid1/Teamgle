const LOCAL_API_BASE = "http://localhost:5000/api";
const PRODUCTION_API_BASE = "https://proj.ruppin.ac.il/igroup34/test2/tar1/api";

export function getApiBaseUrl(path = "") {
  const { hostname } = window.location;
  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1";

  const baseUrl = isLocalhost ? LOCAL_API_BASE : PRODUCTION_API_BASE;
  const cleanPath = String(path).replace(/^\/+/, "");

  return cleanPath ? `${baseUrl}/${cleanPath}` : baseUrl;
}

export const API_BASE = getApiBaseUrl();
