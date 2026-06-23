// ============================================================
//  SKY AGRICULTURE — PWA ISOBUS
//  js/api.js — Via proxy allorigins (contourne CORS)
// ============================================================

const API = {

  // ── Requête via proxy CORS ────────────────────────────────
  async get(action, params) {
    params = params || {};

    const target = new URL(CONFIG.API_URL);
    target.searchParams.set("action", action);
    target.searchParams.set("pin",    CONFIG.PIN);
    Object.keys(params).forEach(k => target.searchParams.set(k, params[k]));

    // Proxy qui ajoute les headers CORS manquants
    const proxyUrl = "https://api.allorigins.win/get?url=" + encodeURIComponent(target.toString());

    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error("Erreur réseau: " + response.status);

    const json = await response.json();
    return JSON.parse(json.contents);
  },

  // ── POST retours terrain ──────────────────────────────────
  async post(data) {
    const proxyUrl = "https://api.allorigins.win/post?url=" + encodeURIComponent(CONFIG.API_URL);
    const response = await fetch(proxyUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(Object.assign({ pin: CONFIG.PIN }, data)),
    });
    const json = await response.json();
    return JSON.parse(json.contents);
  },

  // ── Méthodes métier ───────────────────────────────────────
  async getTerminaux() {
    const cached = Cache.get("terminaux");
    if (cached) return cached;
    const data = await this.get("terminaux");
    Cache.set("terminaux", data);
    return data;
  },

  async getVersions() {
    const cached = Cache.get("versions");
    if (cached) return cached;
    const data = await this.get("versions");
    Cache.set("versions", data);
    return data;
  },

  async getCompatibilites(idVersion) {
    const key    = "compat_" + idVersion;
    const cached = Cache.get(key);
    if (cached) return cached;
    const data = await this.get("compatibilites", { version: idVersion });
    Cache.set(key, data);
    return data;
  },

  async getRetours(idTerminal) {
    return this.get("retours", { terminal: idTerminal });
  },

  async soumettreRetour(retour) {
    if (!navigator.onLine) {
      OfflineQueue.ajouter(retour);
      return { succes: true, offline: true };
    }
    return this.post(Object.assign({ action: "soumettre_retour" }, retour));
  },
};


// ── Cache localStorage ────────────────────────────────────
const Cache = {
  set(key, data) {
    try {
      localStorage.setItem("sky_" + key, JSON.stringify({ data, ts: Date.now() }));
    } catch(e) {}
  },
  get(key) {
    try {
      const raw = localStorage.getItem("sky_" + key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (Date.now() - obj.ts > CONFIG.CACHE_TTL * 1000) return null;
      return obj.data;
    } catch(e) { return null; }
  },
  clear() {
    Object.keys(localStorage)
      .filter(k => k.startsWith("sky_"))
      .forEach(k => localStorage.removeItem(k));
  }
};


// ── File d'attente offline ────────────────────────────────
const OfflineQueue = {
  KEY: "sky_offline_queue",
  ajouter(retour) {
    const q = this.lire();
    q.push({ retour, ts: Date.now() });
    localStorage.setItem(this.KEY, JSON.stringify(q));
  },
  lire() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || "[]"); }
    catch(e) { return []; }
  },
  async synchroniser() {
    const queue = this.lire();
    if (!queue.length || !navigator.onLine) return;
    const restants = [];
    for (const item of queue) {
      try { await API.post(Object.assign({ action: "soumettre_retour" }, item.retour)); }
      catch(e) { restants.push(item); }
    }
    localStorage.setItem(this.KEY, JSON.stringify(restants));
    if (queue.length > restants.length) {
      UI.toast((queue.length - restants.length) + " retour(s) synchronisé(s) ✓", "success");
    }
  }
};

window.addEventListener("online", () => {
  setTimeout(() => OfflineQueue.synchroniser(), 2000);
});
