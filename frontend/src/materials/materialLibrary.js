import { MATERIAL_LIBRARY, MATERIAL_LIBRARY_VERSION } from "./materialLibraryData";

const CACHE_KEY = "tatvalabz_material_library_cache_v1";
const CACHE_TS_KEY = "tatvalabz_material_library_cache_ts_v1";

const normalizeMaterial = (raw) => ({
  ...raw,
  category: raw.category || "General",
  constants: Object.fromEntries(
    Object.entries(raw.constants || {}).filter(([, value]) => Number.isFinite(Number(value)))
  ),
});

const buildPayload = () => ({
  version: MATERIAL_LIBRARY_VERSION,
  materials: MATERIAL_LIBRARY.map(normalizeMaterial),
});

export async function loadMaterialLibrary() {
  try {
    const cachedRaw = localStorage.getItem(CACHE_KEY);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw);
      if (parsed?.version === MATERIAL_LIBRARY_VERSION && Array.isArray(parsed?.materials)) {
        return parsed;
      }
    }
  } catch {
    // ignore corrupt local cache and continue with bundled payload
  }

  const payload = buildPayload();
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    localStorage.setItem(CACHE_TS_KEY, new Date().toISOString());
  } catch {
    // cache may fail in private mode; return payload anyway
  }
  return payload;
}

export function getMaterialLibraryCacheMeta() {
  return {
    version: MATERIAL_LIBRARY_VERSION,
    cachedAt: localStorage.getItem(CACHE_TS_KEY) || null,
  };
}

export function warmMaterialLibraryCache() {
  window.setTimeout(() => {
    void loadMaterialLibrary();
  }, 900);
}
