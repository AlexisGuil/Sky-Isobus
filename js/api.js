// ============================================================
//  SKY AGRICULTURE — PWA ISOBUS
//  js/api.js — JSONP natif corrigé v3
// ============================================================

const API = {

  get(action, params) {
    params = params || {};
    return new Promise(function(resolve, reject) {
      // Nom de callback unique
      var cb  = "sky" + Date.now();
      var url = new URL(CONFIG.API_URL);
      url.searchParams.set("action",   action);
      url.searchParams.set("pin",      CONFIG.PIN);
      url.searchParams.set("callback", cb);
      Object.keys(params).forEach(function(k) { url.searchParams.set(k, params[k]); });

      // Timeout 12s
      var timer = setTimeout(function() {
        cleanup(); reject(new Error("Timeout"));
      }, 12000);

      function cleanup() {
        clearTimeout(timer);
        if (window[cb]) delete window[cb];
        var s = document.getElementById(cb);
        if (s) s.parentNode.removeChild(s);
      }

      // Callback global
      window[cb] = function(data) { cleanup(); resolve(data); };

      // Injection script avec redirect follow
      var s  = document.createElement("script");
      s.id   = cb;
      s.src  = url.toString();
      s.type = "text/javascript";

      s.addEventListener("error", function() {
        // Retry sans callback (JSON direct)
        cleanup();
        var url2 = new URL(CONFIG.API_URL);
        url2.searchParams.set("action", action);
        url2.searchParams.set("pin",    CONFIG.PIN);
        Object.keys(params).forEach(function(k) { url2.searchParams.set(k, params[k]); });
        fetch(url2.toString(), { redirect: "follow" })
          .then(function(r) { return r.json(); })
          .then(resolve)
          .catch(reject);
      });

      document.head.appendChild(s);
    });
  },

  async post(data) {
    const r = await fetch(CONFIG.API_URL, {
      method: "POST",
      redirect: "follow",
      body: JSON.stringify(Object.assign({ pin: CONFIG.PIN }, data))
    });
    return r.json();
  },

  async getTerminaux() {
    const c = Cache.get("terminaux");
    if (c) return c;
    const d = await this.get("terminaux");
    Cache.set("terminaux", d);
    return d;
  },

  async getVersions() {
    const c = Cache.get("versions");
    if (c) return c;
    const d = await this.get("versions");
    Cache.set("versions", d);
    return d;
  },

  async getCompatibilites(idVersion) {
    const key = "compat_" + idVersion;
    const c   = Cache.get(key);
    if (c) return c;
    const d = await this.get("compatibilites", { version: idVersion });
    Cache.set(key, d);
    return d;
  },

  async getRetours(idTerminal) {
    return this.get("retours", { terminal: idTerminal });
  },

  async soumettreRetour(retour) {
    if (!navigator.onLine) { OfflineQueue.ajouter(retour); return { succes: true, offline: true }; }
    return this.post(Object.assign({ action: "soumettre_retour" }, retour));
  },
};

const Cache = {
  set(k, d) { try { localStorage.setItem("sky_"+k, JSON.stringify({ d, t: Date.now() })); } catch(e){} },
  get(k) {
    try {
      var r = localStorage.getItem("sky_"+k);
      if (!r) return null;
      var o = JSON.parse(r);
      if (Date.now() - o.t > CONFIG.CACHE_TTL * 1000) return null;
      return o.d;
    } catch(e) { return null; }
  },
  clear() { Object.keys(localStorage).filter(k=>k.startsWith("sky_")).forEach(k=>localStorage.removeItem(k)); }
};

const OfflineQueue = {
  KEY: "sky_queue",
  ajouter(r) { var q=this.lire(); q.push({r,t:Date.now()}); localStorage.setItem(this.KEY,JSON.stringify(q)); },
  lire() { try { return JSON.parse(localStorage.getItem(this.KEY)||"[]"); } catch(e) { return []; } },
  async synchroniser() {
    var q=this.lire(); if (!q.length||!navigator.onLine) return;
    var left=[];
    for (var i=0;i<q.length;i++) { try { await API.post(Object.assign({action:"soumettre_retour"},q[i].r)); } catch(e) { left.push(q[i]); } }
    localStorage.setItem(this.KEY,JSON.stringify(left));
    if (q.length>left.length) UI.toast((q.length-left.length)+" retour(s) synchronisé(s) ✓","success");
  }
};
window.addEventListener("online", function(){ setTimeout(function(){ OfflineQueue.synchroniser(); }, 2000); });
