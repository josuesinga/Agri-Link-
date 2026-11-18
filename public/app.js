
const $ = s => document.querySelector(s);

let token = localStorage.getItem("al_token") || "";
let currentUser = null;

const DB = "agri_link_queue";

function message(t) {
  $("#message").textContent = t;
}

function show(id, on) {
  $(id).classList.toggle("hidden", !on);
}

function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random().toString(16).slice(2);
}

function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("items", { keyPath: "client_id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function queue(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readwrite");
    tx.objectStore("items").put(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function queued() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction("items").objectStore("items").getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function clearQueue(ids) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("items", "readwrite");
    const s = tx.objectStore("items");
    ids.forEach(id => s.delete(id));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function api(url, opts = {}) {
  opts.headers = {
    ...(opts.headers || {}),
    ...(token ? { Authorization: "Bearer " + token } : {})
  };

  if (opts.body) opts.headers["Content-Type"] = "application/json";

  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));

  if (!r.ok) throw new Error(data.error || "Erreur serveur");

  return data;
}

async function refreshStatus() {
  const online = navigator.onLine;

  $("#status").textContent = online
    ? "Connexion Internet disponible"
    : "Hors ligne : les nouvelles observations seront mises en attente";

  if (online && token) await syncQueue();
}

async function syncQueue() {
  if (!navigator.onLine || !token) return;

  const items = await queued();
  if (!items.length) return;

  try {
    await api("/api/observations/sync", {
      method: "POST",
      body: JSON.stringify({ items })
    });

    await clearQueue(items.map(x => x.client_id));

    message(items.length + " observation(s) synchronisée(s).");
    await loadObservations();
  } catch (e) {
    message("Synchronisation en attente : " + e.message);
  }
}

async function loadObservations() {
  if (!token) return;

  try {
    const d = await api("/api/observations");

    $("#observations").innerHTML = d.observations.length
      ? d.observations.map(o => `
        <div class="item">
          <strong>${esc(o.product)} · ${esc(o.type)}</strong>
          <div>${esc(o.location || "Lieu non précisé")}
            ${o.market ? "· " + esc(o.market) : ""}
          </div>
          <div class="muted">
            ${o.price !== null
              ? "Prix : " + esc(o.price) + " " + esc(o.currency)
              : ""}
            ${o.quantity !== null
              ? "· Quantité : " + esc(o.quantity) + " " + esc(o.unit || "")
              : ""}
          </div>
          <div class="muted">
            ${new Date(o.observed_at || o.created_at).toLocaleString("fr-FR")}
          </div>
        </div>
      `).join("")
      : "Aucune observation centralisée pour le moment.";

  } catch (e) {
    message(e.message);
  }
}

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

async function boot() {
  try {
    await api("/api/health");

    show("#setup", false);
    show("#login", !token);
    show("#app", !!token);

    if (token) {
      currentUser = {};
      await loadObservations();
      await syncQueue();
    }

  } catch (e) {
    if (!navigator.onLine) {
      $("#status").textContent =
        "Application hors ligne. Connectez-vous une première fois pour activer votre compte.";
      return;
    }

    show("#setup", true);
    show("#login", false);
    show("#app", false);
  }
}

$("#setupForm").addEventListener("submit", async e => {
  e.preventDefault();

  const f = Object.fromEntries(new FormData(e.target));

  try {
    const d = await api("/api/setup", {
      method: "POST",
      body: JSON.stringify(f)
    });

    message(d.message);
    show("#setup", false);
    show("#login", true);

  } catch (x) {
    message(x.message);
  }
});

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();

  const f = Object.fromEntries(new FormData(e.target));

  try {
    const d = await api("/api/login", {
      method: "POST",
      body: JSON.stringify(f)
    });

    token = d.token;
    localStorage.setItem("al_token", token);
    currentUser = d.user;

    show("#login", false);
    show("#app", true);
    show("#adminPanel", d.user.role === "admin");

    await loadObservations();
    await syncQueue();

  } catch (x) {
    message(x.message);
  }
});

$("#observationForm").addEventListener("submit", async e => {
  e.preventDefault();

  const f = Object.fromEntries(new FormData(e.target));

  const item = {
    client_id: uid(),
    type: f.type,
    product: f.product,
    quantity: f.quantity ? Number(f.quantity) : null,
    unit: f.unit,
    price: f.price ? Number(f.price) : null,
    currency: f.currency,
    transport_cost: f.transport_cost
      ? Number(f.transport_cost)
      : null,
    location: f.location,
    market: f.market,
    notes: f.notes,
    observed_at: new Date().toISOString()
  };

  try {
    await queue(item);
    e.target.reset();

    message("Observation enregistrée sur ce téléphone.");
    await syncQueue();

  } catch (x) {
    message("Impossible d'enregistrer localement : " + x.message);
  }
});

$("#userForm").addEventListener("submit", async e => {
  e.preventDefault();

  const f = Object.fromEntries(new FormData(e.target));

  try {
    const d = await api("/api/users", {
      method: "POST",
      body: JSON.stringify({ ...f, role: "agent" })
    });

    message(d.message);
    e.target.reset();

  } catch (x) {
    message(x.message);
  }
});

$("#logout").addEventListener("click", () => {
  token = "";
  localStorage.removeItem("al_token");

  show("#app", false);
  show("#login", true);

  message("Vous êtes déconnecté.");
});

$("#refresh").addEventListener("click", loadObservations);

window.addEventListener("online", refreshStatus);
window.addEventListener("offline", refreshStatus);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

refreshStatus();
boot();
