// ============================================================
//  SKY AGRICULTURE — PWA ISOBUS
//  app.js v3 — Logique principale corrigée
// ============================================================

const State = {
  versionSelectionnee:  null,
  terminalSelectionne:  null,
  terminaux:            [],
  versions:             [],
  compatibilites:       {},
  filtreRecherche:      "",
  retourContexte:       null,
  retourExperience:     null,
};

// ── Initialisation ─────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function() {
  const pinOk = sessionStorage.getItem("sky_pin_ok");
  if (pinOk) {
    document.getElementById("pin-screen").style.display = "none";
    demarrer();
  } else {
    setupPIN();
  }
});

function setupPIN() {
  let saisie = "";

  function updateDots() {
    document.querySelectorAll(".pin-dot").forEach((d, i) => {
      d.classList.toggle("filled", i < saisie.length);
    });
  }

  document.querySelectorAll(".pin-key").forEach(key => {
    key.addEventListener("click", function() {
      const val = key.dataset.value;
      if (val === "del") {
        saisie = saisie.slice(0, -1);
        updateDots();
      } else if (val !== "" && saisie.length < 4) {
        saisie += val;
        updateDots();
        if (saisie.length === 4) {
          if (saisie === CONFIG.PIN) {
            sessionStorage.setItem("sky_pin_ok", "1");
            document.getElementById("pin-screen").style.display = "none";
            demarrer();
          } else {
            document.getElementById("pin-error").textContent = "Code incorrect, réessayez";
            setTimeout(function() {
              saisie = "";
              updateDots();
              document.getElementById("pin-error").textContent = "";
            }, 1200);
          }
        }
      }
    });
  });
}

async function demarrer() {
  setupNavigation();
  setupOnlineStatus();
  afficherEcran("accueil");
  await chargerDonnees();
}

// ── Chargement données ─────────────────────────────────────
async function chargerDonnees() {
  try {
    afficherLoader();

    const [dataT, dataV] = await Promise.all([
      API.getTerminaux(),
      API.getVersions(),
    ]);

    State.terminaux = dataT.terminaux || [];
    State.versions  = dataV.versions  || [];

    const actuelle = dataV.versionActuelle;
    if (actuelle) State.versionSelectionnee = actuelle.id;

    if (State.versionSelectionnee) {
      await chargerCompatibilites(State.versionSelectionnee);
    }

    rendrePage1();

  } catch (err) {
    console.error("Erreur chargement:", err);
    const cT = Cache.get("terminaux");
    const cV = Cache.get("versions");
    if (cT && cV) {
      State.terminaux = cT.terminaux || [];
      State.versions  = cV.versions  || [];
      const act = cV.versionActuelle;
      if (act) {
        State.versionSelectionnee = act.id;
        await chargerCompatibilites(act.id);
      }
      rendrePage1();
      UI.toast("Mode hors connexion — données en cache", "info");
    } else {
      afficherErreur("Impossible de charger les données. Vérifiez votre connexion et réessayez.");
    }
  }
}

async function chargerCompatibilites(idVersion) {
  try {
    const data = await API.getCompatibilites(idVersion);
    State.compatibilites[idVersion] = {};
    (data.parTerminal || []).forEach(t => {
      State.compatibilites[idVersion][t.idTerminal] = t.fonctions;
    });
  } catch(e) {
    console.warn("Erreur compatibilités:", e);
  }
}

// ── Loader / Erreur ────────────────────────────────────────
function afficherLoader() {
  const grid = document.getElementById("terminal-grid");
  if (grid) grid.innerHTML = '<div class="loader"><div class="spinner"></div><div class="loader-text">Chargement…</div></div>';
}

function afficherErreur(msg) {
  const grid = document.getElementById("terminal-grid");
  if (grid) grid.innerHTML = `
    <div class="loader" style="grid-column:1/-1">
      <div style="font-size:28px">⚠️</div>
      <div class="loader-text" style="color:#cc0000;text-align:center">${msg}</div>
      <button class="btn-primary" onclick="chargerDonnees()" style="margin-top:12px;width:auto;padding:10px 20px">
        <i class="ti ti-refresh"></i> Réessayer
      </button>
    </div>`;
}

// ── ÉCRAN 1 ────────────────────────────────────────────────
function rendrePage1() {
  // Versions
  const sel = document.getElementById("select-version");
  if (!sel) return;
  sel.innerHTML = "";
  State.versions.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = v.libelle + (v.actuelle ? " (actuelle)" : "");
    if (v.id === State.versionSelectionnee) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.onchange = async function() {
    State.versionSelectionnee = this.value;
    State.terminalSelectionne = null;
    await chargerCompatibilites(State.versionSelectionnee);
    rendreGrilleTerminaux();
    majCTA();
  };

  rendreGrilleTerminaux();
  majCTA();

  const recherche = document.getElementById("recherche-input");
  if (recherche) {
    recherche.oninput = function() {
      State.filtreRecherche = this.value.toLowerCase();
      rendreGrilleTerminaux();
    };
  }

  const btnVerif = document.getElementById("btn-verifier");
  if (btnVerif) btnVerif.onclick = function() {
    if (State.terminalSelectionne) afficherResultat();
  };

  OfflineQueue.synchroniser();
}

function rendreGrilleTerminaux() {
  const grid = document.getElementById("terminal-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const filtres = State.terminaux.filter(t =>
    !State.filtreRecherche ||
    t.nom.toLowerCase().includes(State.filtreRecherche) ||
    (t.marque || "").toLowerCase().includes(State.filtreRecherche)
  );

  if (!filtres.length) {
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;font-size:13px;color:var(--gris);padding:20px 0">Aucun terminal trouvé</p>`;
    return;
  }

  filtres.forEach(t => {
    const card = document.createElement("div");
    card.className = "terminal-card" + (State.terminalSelectionne === t.id ? " selected" : "");
    card.innerHTML = `
      <div class="terminal-icon">🖥</div>
      <div class="terminal-name">${t.nom}</div>
      <div class="terminal-marque">${t.marque || ""}</div>`;
    card.onclick = function() {
      State.terminalSelectionne = t.id;
      rendreGrilleTerminaux();
      majCTA();
    };
    grid.appendChild(card);
  });
}

function majCTA() {
  const btn = document.getElementById("btn-verifier");
  if (btn) btn.disabled = !State.terminalSelectionne;
}

// ── ÉCRAN 2 ────────────────────────────────────────────────
async function afficherResultat() {
  const terminal = State.terminaux.find(t => t.id === State.terminalSelectionne);
  if (!terminal) return;

  afficherEcran("resultat");

  const nameEl = document.getElementById("result-terminal-name");
  const firmEl = document.getElementById("result-firmware");
  if (nameEl) nameEl.textContent = terminal.nom;
  if (firmEl) firmEl.textContent = terminal.firmware ? "Firmware " + terminal.firmware : "";

  const fonctions = (State.compatibilites[State.versionSelectionnee] || {})[terminal.id] || {};
  const FONCTIONS = ["UT", "TC-SC", "TC-GEO", "TC-SC Tramline"];
  const grid = document.getElementById("fonctions-grid");
  if (grid) {
    grid.innerHTML = "";
    FONCTIONS.forEach(nom => {
      const d   = fonctions[nom] || { statut: "—" };
      const cls = d.statut === "OUI" ? "ok" : d.statut === "NON" ? "nok" : d.statut === "PARTIEL" ? "warn" : "";
      const ico = d.statut === "OUI" ? "✓" : d.statut === "NON" ? "✗" : d.statut === "PARTIEL" ? "⚠" : "—";
      const lbl = d.statut === "OUI" ? "Validé" : d.statut === "NON" ? "Non fonctionnel" : d.statut === "PARTIEL" ? "Partiel" : "—";
      const det = d.statut === "OUI" ? "Gestion complète" : (d.explication || "").substring(0, 60);
      const card = document.createElement("div");
      card.className = "fonction-card " + cls;
      card.innerHTML = `<div class="fonction-tag">${ico} ${lbl}</div><div class="fonction-nom">${nom}</div><div class="fonction-detail">${det}</div>`;
      card.onclick = function() { afficherExplication(nom, d); };
      grid.appendChild(card);
    });
  }

  // Première explication NON/PARTIEL auto
  const prob = FONCTIONS.find(f => fonctions[f] && (fonctions[f].statut === "NON" || fonctions[f].statut === "PARTIEL"));
  if (prob) afficherExplication(prob, fonctions[prob]);

  await chargerRetoursTerrain(terminal.id);

  const btnT = document.getElementById("btn-terrain");
  if (btnT) btnT.onclick = function() { ouvrirRetour(terminal); };
}

function afficherExplication(nom, d) {
  const bloc = document.getElementById("explain-block");
  if (!bloc) return;
  if (!d || d.statut === "OUI" || d.statut === "—") { bloc.classList.remove("visible"); return; }
  const cls = d.statut === "NON" ? "nok" : "warn";
  bloc.className = "explain-block visible " + cls;
  bloc.innerHTML = `
    <div class="explain-title">${nom} — ${d.statut === "NON" ? "Non fonctionnel" : "Partiel"}</div>
    <div class="explain-body">${d.explication || "Aucune explication disponible."}</div>
    ${d.contournement ? `<div class="explain-solution">💡 ${d.contournement}</div>` : ""}`;
}

async function chargerRetoursTerrain(idTerminal) {
  const c = document.getElementById("retours-container");
  if (!c) return;
  try {
    const data = await API.getRetours(idTerminal);
    const retours = data.retours || [];
    if (!retours.length) {
      c.innerHTML = `<p style="font-size:12px;color:var(--gris-border);text-align:center;padding:10px 0">Aucun retour terrain pour ce terminal</p>`;
      return;
    }
    c.innerHTML = retours.map(r => {
      const cls = r.experience === "OUI" ? "ok" : r.experience === "NON" ? "nok" : "warn";
      return `<div class="retour-card ${cls}"><div class="retour-exp">${r.experience} — ${r.fonction}</div><div class="retour-obs">${r.observation}</div><div class="retour-date">${r.date}</div></div>`;
    }).join("");
  } catch(e) {
    c.innerHTML = "";
  }
}

// ── ÉCRAN 3 ────────────────────────────────────────────────
function ouvrirRetour(terminal) {
  afficherEcran("terrain");
  const version = State.versions.find(v => v.id === State.versionSelectionnee);
  const ctx = document.getElementById("form-ctx");
  if (ctx) ctx.textContent = terminal.nom + " · " + (version ? version.libelle : State.versionSelectionnee);

  State.retourContexte = { idTerminal: terminal.id, idVersion: State.versionSelectionnee, auteur: "Commercial" };
  State.retourExperience = null;

  document.querySelectorAll(".exp-btn").forEach(btn => {
    btn.classList.remove("selected");
    btn.onclick = function() {
      document.querySelectorAll(".exp-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      State.retourExperience = btn.dataset.value;
      majBtnEnvoi();
    };
  });

  const obs = document.getElementById("form-observation");
  if (obs) obs.value = "";
  majBtnEnvoi();

  const btnEnv = document.getElementById("btn-envoyer");
  if (btnEnv) btnEnv.onclick = envoyerRetour;
}

function majBtnEnvoi() {
  const btn = document.getElementById("btn-envoyer");
  if (btn) btn.disabled = !State.retourExperience;
}

async function envoyerRetour() {
  const obs = document.getElementById("form-observation");
  const btn = document.getElementById("btn-envoyer");
  const retour = Object.assign({}, State.retourContexte, {
    experience:  State.retourExperience,
    observation: obs ? obs.value.trim() : "",
  });
  try {
    if (btn) { btn.disabled = true; btn.textContent = "Envoi…"; }
    const r = await API.soumettreRetour(retour);
    UI.toast(r.offline ? "Enregistré hors connexion ✓" : "Retour envoyé ! En attente de validation ✓", "success");
    afficherEcran("resultat");
  } catch(e) {
    OfflineQueue.ajouter(retour);
    UI.toast("Enregistré hors connexion ✓", "success");
    afficherEcran("resultat");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Envoyer le retour"; }
  }
}

// ── Navigation ─────────────────────────────────────────────
function afficherEcran(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const s = document.getElementById("screen-" + id);
  if (s) s.classList.add("active");
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  if (id === "accueil") { const n = document.getElementById("nav-accueil"); if(n) n.classList.add("active"); }
}

function setupNavigation() {
  const na = document.getElementById("nav-accueil");
  const nt = document.getElementById("nav-terrain");
  const rb = document.getElementById("result-back");
  const tb = document.getElementById("terrain-back");
  if (na) na.onclick = function() { afficherEcran("accueil"); };
  if (nt) nt.onclick = function() {
    const t = State.terminaux.find(t => t.id === State.terminalSelectionne);
    if (t) ouvrirRetour(t);
    else { UI.toast("Sélectionnez d'abord un terminal", "info"); afficherEcran("accueil"); }
  };
  if (rb) rb.onclick = function() { afficherEcran("accueil"); };
  if (tb) tb.onclick = function() { afficherEcran("resultat"); };
}

function setupOnlineStatus() {
  function maj() {
    const badge = document.getElementById("offline-badge");
    if (!badge) return;
    const lbl = badge.querySelector(".offline-label");
    if (navigator.onLine) { badge.classList.add("online"); if(lbl) lbl.textContent = "En ligne"; }
    else { badge.classList.remove("online"); if(lbl) lbl.textContent = "Hors connexion"; }
  }
  window.addEventListener("online",  maj);
  window.addEventListener("offline", maj);
  maj();
}

// ── UI Toast ───────────────────────────────────────────────
const UI = {
  toast(msg, type) {
    type = type || "info";
    const c = document.getElementById("toast-container");
    if (!c) return;
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(function() { if(el.parentNode) el.parentNode.removeChild(el); }, 3200);
  }
};

// ── Service Worker ─────────────────────────────────────────
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js")
    .then(function() { console.log("Service Worker enregistré"); })
    .catch(function(e) { console.warn("SW:", e); });
}
