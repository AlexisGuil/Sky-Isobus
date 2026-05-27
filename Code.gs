// ============================================================
//  SKY AGRICULTURE — PWA ISOBUS
//  API Google Apps Script v2.0 — avec support JSONP
//  À coller dans : Extensions > Apps Script > Code.gs
//  Puis : Déployer > Nouveau déploiement > Application Web
// ============================================================

const CONFIG = {
  PIN_CODE:       "1234",   // ← Changez votre PIN ici
  CACHE_DURATION: 1800,     // Cache 30 minutes
};

const SHEETS = {
  TERMINAUX:      "Terminaux",
  VERSIONS:       "Versions",
  COMPATIBILITES: "Compatibilités",
  RETOURS:        "Retours Terrain",
};


// ── POINT D'ENTRÉE PRINCIPAL ─────────────────────────────────
function doGet(e) {
  var callback = e.parameter.callback || "";
  var action   = e.parameter.action   || "";
  var pin      = e.parameter.pin      || "";

  // Ping sans PIN
  if (action === "ping") {
    return repondre({ statut: "ok", version: "2.0" }, callback);
  }

  // Vérification PIN
  if (pin !== CONFIG.PIN_CODE) {
    return repondre({ erreur: "PIN invalide", code: 401 }, callback);
  }

  // Routage
  switch (action) {
    case "terminaux":
      return repondre(getDataTerminaux(), callback);
    case "versions":
      return repondre(getDataVersions(), callback);
    case "compatibilites":
      return repondre(getDataCompatibilites(e.parameter.version || ""), callback);
    case "retours":
      return repondre(getDataRetours(e.parameter.terminal || "", e.parameter.fonction || ""), callback);
    default:
      return repondre({ erreur: "Action inconnue" }, callback);
  }
}


// ── POINT D'ENTRÉE POST (retours terrain) ────────────────────
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.pin !== CONFIG.PIN_CODE) {
      return repondre({ erreur: "PIN invalide" }, "");
    }
    if (data.action === "soumettre_retour") {
      return repondre(soumettreRetour(data), "");
    }
    return repondre({ erreur: "Action inconnue" }, "");
  } catch (err) {
    return repondre({ erreur: "Erreur: " + err.message }, "");
  }
}


// ── RÉPONSE JSONP ou JSON ────────────────────────────────────
function repondre(data, callback) {
  var json = JSON.stringify(data);
  if (callback && callback.length > 0) {
    // JSONP : contourne le CORS
    return ContentService
      .createTextOutput(callback + "(" + json + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}


// ── TERMINAUX ────────────────────────────────────────────────
function getDataTerminaux() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.TERMINAUX);
    var rows  = sheet.getDataRange().getValues();
    var terminaux = [];

    for (var i = 2; i < rows.length; i++) {
      var r = rows[i];
      if (!r[0]) continue;
      if (r[4] !== "OUI") continue; // Seulement les actifs
      terminaux.push({
        id:       String(r[0]),
        nom:      String(r[1]),
        marque:   String(r[2]),
        firmware: String(r[3]),
        actif:    true
      });
    }

    // Tri alphabétique
    terminaux.sort(function(a, b) { return a.nom.localeCompare(b.nom); });
    return { terminaux: terminaux, total: terminaux.length };
  } catch(err) {
    return { erreur: "Erreur terminaux: " + err.message, terminaux: [] };
  }
}


// ── VERSIONS ─────────────────────────────────────────────────
function getDataVersions() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.VERSIONS);
    var rows  = sheet.getDataRange().getValues();
    var versions = [];
    var actuelle = null;

    for (var i = 2; i < rows.length; i++) {
      var r = rows[i];
      if (!r[0]) continue;
      var v = {
        id:       String(r[0]),
        libelle:  String(r[1]),
        date:     String(r[2]),
        actuelle: r[3] === "OUI",
        notes:    String(r[4] || "")
      };
      versions.push(v);
      if (v.actuelle) actuelle = v;
    }

    return {
      versions:        versions,
      versionActuelle: actuelle || versions[0] || null
    };
  } catch(err) {
    return { erreur: "Erreur versions: " + err.message, versions: [] };
  }
}


// ── COMPATIBILITÉS ───────────────────────────────────────────
function getDataCompatibilites(filtreVersion) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.COMPATIBILITES);
    var rows  = sheet.getDataRange().getValues();
    var parTerminal = {};

    for (var i = 2; i < rows.length; i++) {
      var r = rows[i];
      if (!r[0]) continue;
      if (filtreVersion && String(r[2]) !== filtreVersion) continue;

      var idTerminal = String(r[0]);
      if (!parTerminal[idTerminal]) {
        parTerminal[idTerminal] = {
          idTerminal:  idTerminal,
          nomTerminal: String(r[1]),
          idVersion:   String(r[2]),
          fonctions:   {}
        };
      }

      parTerminal[idTerminal].fonctions[String(r[3])] = {
        statut:        String(r[4]),
        explication:   String(r[5] || ""),
        contournement: String(r[6] || ""),
        derniereMaj:   String(r[7] || "")
      };
    }

    return {
      parTerminal:   Object.values(parTerminal),
      versionFiltre: filtreVersion || "toutes"
    };
  } catch(err) {
    return { erreur: "Erreur compatibilités: " + err.message, parTerminal: [] };
  }
}


// ── RETOURS TERRAIN ──────────────────────────────────────────
function getDataRetours(filtreTerminal, filtreFonction) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.RETOURS);
    var rows  = sheet.getDataRange().getValues();
    var retours = [];

    for (var i = 2; i < rows.length; i++) {
      var r = rows[i];
      if (!r[0]) continue;
      if (String(r[7]) !== "Publié") continue;
      if (filtreTerminal && String(r[2]) !== filtreTerminal) continue;
      if (filtreFonction && String(r[3]) !== filtreFonction) continue;

      retours.push({
        id:          String(r[0]),
        date:        String(r[1]),
        idTerminal:  String(r[2]),
        fonction:    String(r[3]),
        idVersion:   String(r[4]),
        experience:  String(r[5]),
        observation: String(r[6])
        // auteur non transmis (pseudonymisation)
      });
    }

    return { retours: retours, total: retours.length };
  } catch(err) {
    return { erreur: "Erreur retours: " + err.message, retours: [] };
  }
}


// ── SOUMISSION RETOUR TERRAIN ────────────────────────────────
function soumettreRetour(data) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.RETOURS);
    var rows  = sheet.getDataRange().getValues();
    var count = rows.length - 2;
    var id    = "RT" + (count + 1 < 10 ? "00" : count + 1 < 100 ? "0" : "") + (count + 1);
    var date  = Utilities.formatDate(new Date(), "Europe/Paris", "dd/MM/yyyy");

    sheet.appendRow([
      id, date,
      data.idTerminal  || "",
      data.fonction    || "",
      data.idVersion   || "",
      data.experience  || "",
      data.observation || "",
      "À valider",
      data.auteur || "Anonyme"
    ]);

    // Notification email admin
    try {
      var email = Session.getActiveUser().getEmail();
      MailApp.sendEmail(
        email,
        "[Sky ISOBUS] Nouveau retour terrain " + id,
        "Terminal : " + data.idTerminal + "\nFonction : " + data.fonction + "\nExpérience : " + data.experience + "\nObservation : " + (data.observation || "—")
      );
    } catch(mailErr) { /* non bloquant */ }

    return { succes: true, id: id, message: "Retour enregistré, en attente de validation." };
  } catch(err) {
    return { erreur: "Erreur soumission: " + err.message };
  }
}


// ── TEST (à exécuter depuis Apps Script pour vérifier) ───────
function testerAPI() {
  Logger.log("TERMINAUX : " + JSON.stringify(getDataTerminaux()));
  Logger.log("VERSIONS : "  + JSON.stringify(getDataVersions()));
  Logger.log("COMPAT : "    + JSON.stringify(getDataCompatibilites("v204R04")));
}
