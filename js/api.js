// ============================================================
//  SKY AGRICULTURE — PWA ISOBUS
//  api.js — Couche de communication avec Google Apps Script
// ============================================================

const API = {

  // ── Requête GET générique ──────────────────────────────────
  async get(action, params = {}) {
    const url = new URL(CONFIG.API_URL);
    url.searchParams.set("action", action);
    url.searchParams.set("pin",    CONFIG.PIN);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Erreur réseau: ${response.status}`);
    return response.json();
  },

  // ── Requête POST générique ─────────────────────────────────
  async post(data) {
    const response = await fetch(CONFIG.API_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ...data, pin: CONFIG.PIN }),
    });
    if (!response.ok) throw new Error(`Erreur réseau: ${response.status}`);
    return response.json();
  },

  // ── Terminaux ──────────────────────────────────────────────
  async getTerminaux() {
    const cached = Cache.get("terminaux");
    if (cached) return cached;
    const data = await this.get("terminaux");
    Cache.set("terminaux", data);
    return data;
  },

  // ── Versions ──────────────────────────────────────────────
  async getVersions() {
    const cached = Cache.get("versions");
    if (cached) return cached;
    const data = await this.get("versions");
    Cache.set("versions", data);
    return data;
  },

  // ── Compatibilités ────────────────────────────────────────
  async getCompatibilites(idVersion) {
    const key = "compat_" + idVersion;
    const cached = Cache.get(key);
    if (cached) return cached;
    const data = await this.get("compatibilites", { version: idVersion });
    Cache.set(key, data);
    return data;
  },

  // ── Retours terrain ───────────────────────────────────────
  async getRetours(idTerminal, fonction) {
    return this.get("retours", { terminal: idTerminal, fonction });
  },

  // ── Soumettre un retour ───────────────────────────────────
  async soumettreRetour(retour) {
    // Si offline → stocker localement pour sync ultérieure
    if (!navigator.onLine) {
      OfflineQueue.ajouter(retour);
      return { succes: true, offline: true, message: "Retour enregistré localement. Il sera envoyé dès la reconnexion." };
    }
    return this.post({ action: "soumettre_retour", ...retour });
  },
};


// ── Cache localStorage ─────────────────────────────────────
const Cache = {
  set(key, data) {
    localStorage.setItem("sky_" + key, JSON.stringify({
      data,
      ts: Date.now(),
    }));
  },

  get(key) {
    try {
      const raw = localStorage.getItem("sky_" + key);
      if (!raw) return null;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts > CONFIG.CACHE_TTL * 1000) return null;
      return data;
    } catch { return null; }
  },

  clear(key) {
    if (key) localStorage.removeItem("sky_" + key);
    else Object.keys(localStorage)
      .filter(k => k.startsWith("sky_"))
      .forEach(k => localStorage.removeItem(k));
  },
};


// ── File d'attente offline ─────────────────────────────────
const OfflineQueue = {
  KEY: "sky_offline_queue",

  ajouter(retour) {
    const queue = this.lire();
    queue.push({ retour, ts: Date.now() });
    localStorage.setItem(this.KEY, JSON.stringify(queue));
  },

  lire() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) || "[]");
    } catch { return []; }
  },

  async synchroniser() {
    const queue = this.lire();
    if (!queue.length || !navigator.onLine) return;

    const restants = [];
    for (const item of queue) {
      try {
        await API.post({ action: "soumettre_retour", ...item.retour });
      } catch {
        restants.push(item); // Garder pour réessayer
      }
    }
    localStorage.setItem(this.KEY, JSON.stringify(restants));
    if (queue.length !== restants.length) {
      UI.toast(`${queue.length - restants.length} retour(s) terrain synchronisé(s) ✓`, "success");
    }
  },

  count() {
    return this.lire().length;
  },
};

// Synchronisation automatique au retour de connexion
window.addEventListener("online", () => {
  setTimeout(() => OfflineQueue.synchroniser(), CONFIG.SYNC_DELAY);
});
