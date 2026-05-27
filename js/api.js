// ============================================================
//  SKY AGRICULTURE — PWA ISOBUS
//  js/api.js — Communication JSONP (contourne CORS)
// ============================================================

const API = {

  // ── Requête JSONP (contourne le blocage CORS de Google) ───
  get(action, params) {
    params = params || {};
    return new Promise(function(resolve, reject) {
      var cbName = "sky_cb_" + Date.now() + "_" + Math.floor(Math.random() * 9999);
      var url    = new URL(CONFIG.API_URL);

      url.searchParams.set("action",   action);
      url.searchParams.set("pin",      CONFIG.PIN);
      url.searchParams.set("callback", cbName);
      Object.keys(params).forEach(function(k) {
        url.searchParams.set(k, params[k]);
      });

      // Timeout 10 secondes
      var timeout = setTimeout(function() {
        cleanup();
        reject(new Error("Timeout — vérifiez votre connexion"));
      }, 10000);

      function cleanup() {
        clearTimeout(timeout);
        delete window[cbName];
        var el = document.getElementById(cbName);
        if (el) el.parentNode.removeChild(el);
      }

      // Callback global appelé par le script JSONP
      window[cbName] = function(data) {
        cleanup();
        resolve(data);
      };

      // Injection du script
      var script    = document.createElement("script");
      script.id     = cbName;
      script.src    = url.toString();
      script.onerror = function() {
        cleanup();
        reject(new Error("Erreur réseau"));
      };
      document.body.appendChild(script);
    });
  },

  // ── POST pour les retours terrain ─────────────────────────
  async post(data) {
    var response = await fetch(CONFIG.API_URL, {
      method:   "POST",
      redirect: "follow",
      body:     JSON.stringify(Object.assign({ pin: CONFIG.PIN }, data)),
    });
    return response.json();
  },

  // ── Méthodes métier ───────────────────────────────────────
  async getTerminaux() {
    var cached = Cache.get("terminaux");
    if (cached) return cached;
    var data = await this.get("terminaux");
    Cache.set("terminaux", data);
    return data;
  },

  async getVersions() {
    var cached = Cache.get("versions");
    if (cached) return cached;
    var data = await this.get("versions");
    Cache.set("versions", data);
    return data;
  },

  async getCompatibilites(idVersion) {
    var key    = "compat_" + idVersion;
    var cached = Cache.get(key);
    if (cached) return cached;
    var data = await this.get("compatibilites", { version: idVersion });
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


// ── Cache localStorage ─────────────────────────────────────
var Cache = {
  set: function(key, data) {
    try {
      localStorage.setItem("sky_" + key, JSON.stringify({ data: data, ts: Date.now() }));
    } catch(e) {}
  },
  get: function(key) {
    try {
      var raw = localStorage.getItem("sky_" + key);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (Date.now() - obj.ts > CONFIG.CACHE_TTL * 1000) return null;
      return obj.data;
    } catch(e) { return null; }
  },
  clear: function() {
    Object.keys(localStorage)
      .filter(function(k) { return k.startsWith("sky_"); })
      .forEach(function(k) { localStorage.removeItem(k); });
  }
};


// ── File d'attente offline ─────────────────────────────────
var OfflineQueue = {
  KEY: "sky_offline_queue",
  ajouter: function(retour) {
    var q = this.lire();
    q.push({ retour: retour, ts: Date.now() });
    localStorage.setItem(this.KEY, JSON.stringify(q));
  },
  lire: function() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || "[]"); }
    catch(e) { return []; }
  },
  async synchroniser() {
    var queue = this.lire();
    if (!queue.length || !navigator.onLine) return;
    var restants = [];
    for (var i = 0; i < queue.length; i++) {
      try { await API.post(Object.assign({ action: "soumettre_retour" }, queue[i].retour)); }
      catch(e) { restants.push(queue[i]); }
    }
    localStorage.setItem(this.KEY, JSON.stringify(restants));
    if (queue.length > restants.length) {
      UI.toast((queue.length - restants.length) + " retour(s) synchronisé(s) ✓", "success");
    }
  }
};

window.addEventListener("online", function() {
  setTimeout(function() { OfflineQueue.synchroniser(); }, 2000);
});
