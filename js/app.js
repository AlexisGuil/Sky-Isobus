// ============================================================
//  SKY AGRICULTURE — PWA ISOBUS
//  app.js — Logique principale de l'application
// ============================================================

// ── État global ────────────────────────────────────────────
const State = {
  versionSelectionnee:  null,
  terminalSelectionne:  null,
  fonctionSelectionnee: null,
  terminaux:            [],
  versions:             [],
  compatibilites:       {},
  filtreRecherche:      "",
  retourContexte:       null,
  retourExperience:     null,
};

// ── Initialisation ─────────────────────────────────────────
async function init() {
  // Vérifier PIN
  const pinOk = sessionStorage.getItem("sky_pin_ok");
  if (!pinOk) {
    showPinScreen();
    return;
  }
  await lancerApp();
}

async function lancerApp() {
  document.getElementById("pin-screen").style.display = "none";
  setupNavigation();
  setupOnlineStatus();
  await chargerDonnees();
  afficherEcran("accueil");
}

// ── Chargement des données ─────────────────────────────────
async function chargerDonnees() {
  try {
    afficherLoader("accueil", "Chargement des données…");

    const [dataTerminaux, dataVersions] = await Promise.all([
      API.getTerminaux(),
      API.getVersions(),
    ]);

    State.terminaux = dataTerminaux.terminaux || [];
    State.versions  = dataVersions.versions  || [];

    // Présélectionner la version actuelle
    const actuelle = dataVersions.versionActuelle;
    if (actuelle) State.versionSelectionnee = actuelle.id;

    // Pré-charger les compatibilités de la version actuelle
    if (State.versionSelectionnee) {
      await chargerCompatibilites(State.versionSelectionnee);
    }

    rendrePage1();
  } catch (err) {
    console.error("Erreur chargement:", err);
    // En mode offline, on utilise le cache
    const cacheTerminaux = Cache.get("terminaux");
    if (cacheTerminaux) {
      State.terminaux = cacheTerminaux.terminaux || [];
      State.versions  = (Cache.get("versions") || {}).versions || [];
      if (State.versions.length) {
        State.versionSelectionnee = State.versions.find(v => v.actuelle)?.id || State.versions[0].id;
        await chargerCompatibilites(State.versionSelectionnee);
      }
      rendrePage1();
      UI.toast("Mode hors connexion — données du dernier chargement", "info");
    } else {
      afficherErreur("accueil", "Impossible de charger les données. Vérifiez votre connexion et réessayez.");
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
  } catch (err) {
    console.error("Erreur compatibilités:", err);
  }
}

// ── ÉCRAN 1 — Accueil ──────────────────────────────────────
function rendrePage1() {
  // Sélecteur de versions
  const selectVersion = document.getElementById("select-version");
  selectVersion.innerHTML = "";
  State.versions.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = v.libelle + (v.actuelle ? " (actuelle)" : "");
    if (v.id === State.versionSelectionnee) opt.selected = true;
    selectVersion.appendChild(opt);
  });

  selectVersion.addEventListener("change", async e => {
    State.versionSelectionnee = e.target.value;
    State.terminalSelectionne = null;
    await chargerCompatibilites(State.versionSelectionnee);
    rendreGrilleTerminaux();
    majBoutonCTA();
  });

  rendreGrilleTerminaux();
  majBoutonCTA();

  // Recherche
  document.getElementById("recherche-input").addEventListener("input", e => {
    State.filtreRecherche = e.target.value.toLowerCase();
    rendreGrilleTerminaux();
  });

  // CTA
  document.getElementById("btn-verifier").addEventListener("click", () => {
    if (State.terminalSelectionne) afficherResultat();
  });

  // Sync offline au démarrage
  OfflineQueue.synchroniser();
}

function rendreGrilleTerminaux() {
  const grille = document.getElementById("terminal-grid");
  grille.innerHTML = "";

  const filtres = State.terminaux.filter(t =>
    !State.filtreRecherche ||
    t.nom.toLowerCase().includes(State.filtreRecherche) ||
    t.marque.toLowerCase().includes(State.filtreRecherche)
  );

  if (!filtres.length) {
    grille.innerHTML = `<p style="grid-column:1/-1;text-align:center;font-size:13px;color:var(--gris);padding:20px 0">Aucun terminal trouvé</p>`;
    return;
  }

  filtres.forEach(terminal => {
    const card = document.createElement("div");
    card.className = "terminal-card" + (State.terminalSelectionne === terminal.id ? " selected" : "");
    card.innerHTML = `
      <div class="terminal-icon">🖥</div>
      <div class="terminal-name">${terminal.nom}</div>
      <div class="terminal-marque">${terminal.marque}</div>
    `;
    card.addEventListener("click", () => {
      State.terminalSelectionne = terminal.id;
      rendreGrilleTerminaux();
      majBoutonCTA();
    });
    grille.appendChild(card);
  });
}

function majBoutonCTA() {
  const btn = document.getElementById("btn-verifier");
  btn.disabled = !State.terminalSelectionne;
}

// ── ÉCRAN 2 — Résultat ─────────────────────────────────────
async function afficherResultat() {
  const terminal = State.terminaux.find(t => t.id === State.terminalSelectionne);
  if (!terminal) return;

  afficherEcran("resultat");

  // En-tête résultat
  document.getElementById("result-terminal-name").textContent = terminal.nom;
  document.getElementById("result-firmware").textContent =
    terminal.firmware ? `Firmware ${terminal.firmware}` : "Firmware non renseigné";

  // Récupérer les fonctions compatibilité
  const fonctions = State.compatibilites[State.versionSelectionnee]?.[terminal.id] || {};

  // Définir l'ordre d'affichage
  const FONCTIONS = ["UT", "TC-SC", "TC-GEO", "TC-SC Tramline"];
  const grille = document.getElementById("fonctions-grid");
  grille.innerHTML = "";

  FONCTIONS.forEach(nomFonction => {
    const data   = fonctions[nomFonction] || { statut: "—" };
    const statut = data.statut || "—";
    const cls    = statut === "OUI" ? "ok" : statut === "NON" ? "nok" : statut === "PARTIEL" ? "warn" : "";
    const icon   = statut === "OUI" ? "✓" : statut === "NON" ? "✗" : statut === "PARTIEL" ? "⚠" : "—";
    const label  = statut === "OUI" ? "Validé" : statut === "NON" ? "Non fonctionnel" : statut === "PARTIEL" ? "Partiel" : "—";
    const detail = statut === "PARTIEL" ? (data.explication || "") : statut === "OUI" ? "Gestion complète" : (data.explication || "");

    const card = document.createElement("div");
    card.className = `fonction-card ${cls}`;
    card.innerHTML = `
      <div class="fonction-tag">${icon} ${label}</div>
      <div class="fonction-nom">${nomFonction}</div>
      <div class="fonction-detail">${detail.substring(0, 60)}${detail.length > 60 ? "…" : ""}</div>
    `;
    card.addEventListener("click", () => afficherExplication(nomFonction, data, statut));
    grille.appendChild(card);
  });

  // Afficher automatiquement la première explication NON ou PARTIEL
  const premierProbleme = FONCTIONS.find(f => {
    const d = fonctions[f];
    return d && (d.statut === "NON" || d.statut === "PARTIEL");
  });
  if (premierProbleme) {
    afficherExplication(premierProbleme, fonctions[premierProbleme], fonctions[premierProbleme].statut);
  }

  // Charger les retours terrain
  await chargerRetoursTerrain(terminal.id);

  // Bouton retour terrain
  document.getElementById("btn-terrain").onclick = () => {
    ouvrirFormulaireRetour(terminal, null, fonctions);
  };
}

function afficherExplication(nomFonction, data, statut) {
  State.fonctionSelectionnee = nomFonction;
  const bloc = document.getElementById("explain-block");

  if (!data || statut === "OUI" || statut === "—") {
    bloc.classList.remove("visible");
    return;
  }

  const cls = statut === "NON" ? "nok" : "warn";
  const icon = statut === "NON" ? "ti-x" : "ti-alert-triangle";

  bloc.className = `explain-block visible ${cls}`;
  bloc.innerHTML = `
    <div class="explain-title">
      <i class="ti ${icon}"></i>
      ${nomFonction} — ${statut === "NON" ? "Non fonctionnel" : "Compatibilité partielle"}
    </div>
    <div class="explain-body">${data.explication || "Aucune explication disponible."}</div>
    ${data.contournement ? `
    <div class="explain-solution">
      <i class="ti ti-bulb"></i> Solution : ${data.contournement}
    </div>` : ""}
  `;
}

async function chargerRetoursTerrain(idTerminal) {
  try {
    const data = await API.getRetours(idTerminal, "");
    const retours = data.retours || [];
    const container = document.getElementById("retours-container");

    if (!retours.length) {
      container.innerHTML = `<p style="font-size:12px;color:var(--gris-border);text-align:center;padding:10px 0">Aucun retour terrain pour ce terminal</p>`;
      return;
    }

    container.innerHTML = retours.map(r => {
      const cls = r.experience === "OUI" ? "ok" : r.experience === "NON" ? "nok" : "warn";
      return `
        <div class="retour-card ${cls}">
          <div class="retour-exp">${r.experience} — ${r.fonction}</div>
          <div class="retour-obs">${r.observation}</div>
          <div class="retour-date">${r.date}</div>
        </div>
      `;
    }).join("");
  } catch {
    // Silencieux si offline
  }
}

// ── ÉCRAN 3 — Retour terrain ───────────────────────────────
function ouvrirFormulaireRetour(terminal, fonction, fonctions) {
  afficherEcran("terrain");

  // Contexte pré-rempli
  const version   = State.versions.find(v => v.id === State.versionSelectionnee);
  const ctxText   = `${terminal.nom} · ${fonction || "Toutes fonctions"} · ${version?.libelle || State.versionSelectionnee}`;
  document.getElementById("form-ctx").textContent = ctxText;

  State.retourContexte = {
    idTerminal: terminal.id,
    fonction:   fonction || "",
    idVersion:  State.versionSelectionnee,
    auteur:     "Commercial", // Sera remplacé par le vrai nom en V2
  };
  State.retourExperience = null;

  // Boutons d'expérience
  document.querySelectorAll(".exp-btn").forEach(btn => {
    btn.classList.remove("selected");
    btn.addEventListener("click", () => {
      document.querySelectorAll(".exp-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      State.retourExperience = btn.dataset.value;
      majBoutonEnvoi();
    });
  });

  // Reset textarea
  document.getElementById("form-observation").value = "";
  majBoutonEnvoi();

  document.getElementById("btn-envoyer").onclick = envoyerRetour;
}

function majBoutonEnvoi() {
  document.getElementById("btn-envoyer").disabled = !State.retourExperience;
}

async function envoyerRetour() {
  const observation = document.getElementById("form-observation").value.trim();

  const retour = {
    ...State.retourContexte,
    experience:  State.retourExperience,
    observation: observation,
  };

  try {
    document.getElementById("btn-envoyer").disabled = true;
    document.getElementById("btn-envoyer").textContent = "Envoi en cours…";

    const resultat = await API.soumettreRetour(retour);

    if (resultat.succes) {
      const msg = resultat.offline
        ? "Retour enregistré hors connexion — il sera envoyé à la reconnexion ✓"
        : "Retour envoyé avec succès ! Il sera visible après validation. ✓";
      UI.toast(msg, "success");
      retourEcranResultat();
    } else {
      UI.toast("Erreur lors de l'envoi : " + (resultat.erreur || "inconnu"), "error");
    }
  } catch (err) {
    // Offline → queue locale
    OfflineQueue.ajouter(retour);
    UI.toast("Retour enregistré hors connexion ✓", "success");
    retourEcranResultat();
  } finally {
    document.getElementById("btn-envoyer").disabled = false;
    document.getElementById("btn-envoyer").textContent = "Envoyer le retour";
  }
}

// ── Navigation ─────────────────────────────────────────────
function afficherEcran(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(`screen-${id}`)?.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  const navMap = { accueil: "nav-accueil", terrain: "nav-terrain" };
  if (navMap[id]) document.getElementById(navMap[id])?.classList.add("active");
}

function retourEcranResultat() {
  afficherEcran("resultat");
}

function setupNavigation() {
  document.getElementById("nav-accueil").addEventListener("click", () => afficherEcran("accueil"));
  document.getElementById("nav-terrain").addEventListener("click", () => {
    const terminal = State.terminaux.find(t => t.id === State.terminalSelectionne);
    if (terminal) {
      ouvrirFormulaireRetour(terminal, null, {});
    } else {
      UI.toast("Sélectionnez d'abord un terminal", "info");
      afficherEcran("accueil");
    }
  });
  document.getElementById("result-back").addEventListener("click", () => afficherEcran("accueil"));
  document.getElementById("terrain-back").addEventListener("click", () => retourEcranResultat());
}

// ── Statut de connexion ────────────────────────────────────
function setupOnlineStatus() {
  function maj() {
    const badge = document.getElementById("offline-badge");
    if (navigator.onLine) {
      badge.classList.add("online");
      badge.querySelector(".offline-label").textContent = "En ligne";
    } else {
      badge.classList.remove("online");
      badge.querySelector(".offline-label").textContent = "Hors connexion";
    }
  }
  window.addEventListener("online",  maj);
  window.addEventListener("offline", maj);
  maj();
}

// ── Utilitaires UI ─────────────────────────────────────────
const UI = {
  toast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    const icon = type === "success" ? "ti-check" : type === "error" ? "ti-x" : "ti-info-circle";
    el.innerHTML = `<i class="ti ${icon}"></i> ${message}`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
};

function afficherLoader(ecranId, texte) {
  const body = document.querySelector(`#screen-${ecranId} .screen-body`);
  if (body) body.innerHTML = `
    <div class="loader">
      <div class="spinner"></div>
      <div class="loader-text">${texte}</div>
    </div>
  `;
}

function afficherErreur(ecranId, message) {
  const body = document.querySelector(`#screen-${ecranId} .screen-body`);
  if (body) body.innerHTML = `
    <div class="loader">
      <div style="font-size:32px">⚠️</div>
      <div class="loader-text" style="text-align:center;color:var(--nok-text)">${message}</div>
      <button class="btn-primary" onclick="chargerDonnees()" style="margin-top:10px;width:auto;padding:10px 20px">
        <i class="ti ti-refresh"></i> Réessayer
      </button>
    </div>
  `;
  afficherEcran(ecranId);
}

// ── PIN Screen ─────────────────────────────────────────────
function showPinScreen() {
  let saisie = "";

  const updateDots = () => {
    document.querySelectorAll(".pin-dot").forEach((d, i) => {
      d.classList.toggle("filled", i < saisie.length);
    });
  };

  document.querySelectorAll(".pin-key").forEach(key => {
    key.addEventListener("click", async () => {
      const val = key.dataset.value;
      if (val === "del") {
        saisie = saisie.slice(0, -1);
        updateDots();
      } else if (saisie.length < 4) {
        saisie += val;
        updateDots();
        if (saisie.length === 4) {
          if (saisie === CONFIG.PIN) {
            sessionStorage.setItem("sky_pin_ok", "1");
            await lancerApp();
          } else {
            document.getElementById("pin-error").textContent = "Code incorrect, réessayez";
            setTimeout(() => {
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

// ── Démarrage ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);

// ── Service Worker ─────────────────────────────────────────
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js")
    .then(() => console.log("Service Worker enregistré"))
    .catch(e => console.warn("SW non enregistré:", e));
}
