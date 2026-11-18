const express = require("express");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const path = require("path");

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const required = ["DATABASE_URL", "JWT_SECRET", "BOOTSTRAP_KEY"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Variable d'environnement manquante: ${key}`);
    process.exit(1);
  }
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(80) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'agent',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS observations (
      id BIGSERIAL PRIMARY KEY,
      client_id VARCHAR(100) UNIQUE NOT NULL,
      type VARCHAR(30) NOT NULL,
      product VARCHAR(160) NOT NULL,
      quantity NUMERIC,
      unit VARCHAR(40),
      price NUMERIC,
      currency VARCHAR(10) DEFAULT 'USD',
      location VARCHAR(200),
      market VARCHAR(160),
      transport_cost NUMERIC,
      notes TEXT,
      created_by BIGINT REFERENCES users(id),
      observed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Connexion requise." });
  }
}
function admin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Accès réservé à l'administrateur." });
  next();
}
app.get("/api/health", (req, res) => res.json({ status: "ok", app: "AGRI-LINK RDC" }));

app.post("/api/setup", async (req, res) => {
  try {
    const { setupKey, username, password } = req.body || {};
    if (setupKey !== process.env.BOOTSTRAP_KEY) return res.status(403).json({ error: "Clé de première configuration incorrecte." });
    if (!username || !password || String(password).length < 12) return res.status(400).json({ error: "Identifiant requis et mot de passe d'au moins 12 caractères." });
    const count = await pool.query("SELECT COUNT(*)::int AS n FROM users");
    if (count.rows[0].n > 0) return res.status(409).json({ error: "La première configuration a déjà été effectuée." });
    const hash = await bcrypt.hash(password, 12);
    await pool.query("INSERT INTO users(username,password_hash,role) VALUES($1,$2,'admin')", [String(username).trim(), hash]);
    res.status(201).json({ message: "Compte administrateur créé. Connectez-vous." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur de configuration." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const result = await pool.query("SELECT id,username,password_hash,role FROM users WHERE username=$1", [String(username || "").trim()]);
    const u = result.rows[0];
    if (!u || !(await bcrypt.compare(String(password || ""), u.password_hash))) return res.status(401).json({ error: "Identifiants incorrects." });
    const token = jwt.sign({ id: u.id, username: u.username, role: u.role }, process.env.JWT_SECRET, { expiresIn: "12h" });
    res.json({ token, user: { id: u.id, username: u.username, role: u.role } });
  } catch (e) { console.error(e); res.status(500).json({ error: "Erreur de connexion." }); }
});

app.post("/api/users", auth, admin, async (req, res) => {
  try {
    const { username, password, role } = req.body || {};
    if (!username || !password || String(password).length < 12) return res.status(400).json({ error: "Identifiant requis et mot de passe d'au moins 12 caractères." });
    const safeRole = role === "admin" ? "admin" : "agent";
    const hash = await bcrypt.hash(password, 12);
    await pool.query("INSERT INTO users(username,password_hash,role) VALUES($1,$2,$3)", [String(username).trim(), hash, safeRole]);
    res.status(201).json({ message: "Utilisateur créé." });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "Cet identifiant existe déjà." });
    console.error(e); res.status(500).json({ error: "Impossible de créer cet utilisateur." });
  }
});

app.post("/api/observations/sync", auth, async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 100) : [];
  let saved = 0, skipped = 0;
  for (const x of items) {
    if (!x.client_id || !x.product || !x.type) { skipped++; continue; }
    try {
      await pool.query(
        `INSERT INTO observations(client_id,type,product,quantity,unit,price,currency,location,market,transport_cost,notes,created_by,observed_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT(client_id) DO NOTHING`,
        [String(x.client_id), String(x.type), String(x.product), x.quantity ?? null, x.unit || null,
         x.price ?? null, x.currency || "USD", x.location || null, x.market || null,
         x.transport_cost ?? null, x.notes || null, req.user.id, x.observed_at || new Date().toISOString()]
      );
      saved++;
    } catch (e) { console.error(e); skipped++; }
  }
  res.json({ received: items.length, processed: saved, skipped });
});

app.get("/api/observations", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id,type,product,quantity,unit,price,currency,location,market,transport_cost,notes,observed_at,created_at
       FROM observations ORDER BY created_at DESC LIMIT 500`
    );
    res.json({ observations: result.rows });
  } catch (e) { console.error(e); res.status(500).json({ error: "Impossible de charger les observations." }); }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
const port = process.env.PORT || 3000;
initDb().then(() => app.listen(port, () => console.log(`AGRI-LINK RDC démarré sur ${port}`)))
  .catch(e => { console.error("Erreur base de données", e); process.exit(1); });
