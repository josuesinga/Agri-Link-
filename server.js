const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));

const allowedOrigins = (process.env.FRONTEND_URL || "https://josuesinga.github.io")
  .split(",")
  .map(origin => origin.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

const required = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Variable manquante : ${key}`);
    process.exit(1);
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

// La clé service_role reste exclusivement sur le serveur Render.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");

  // Numéro RDC saisi au format local : 0XXXXXXXXX -> 243XXXXXXXXX.
  if (digits.startsWith("0") && digits.length === 10) {
    digits = "243" + digits.slice(1);
  } else if (digits.startsWith("243")) {
    // Déjà au format indicatif RDC.
  } else if (digits.length === 9) {
    digits = "243" + digits;
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return "+" + digits;
}

function syntheticEmail(normalizedPhone) {
  const digits = normalizedPhone.replace(/\D/g, "");
  return `phone-${digits}@login.agri-link-rdc.com`;
}

// Inscription téléphone + mot de passe, sans SMS.
app.post("/api/auth/signup", async (req, res) => {
  try {
    const fullName = String(req.body.fullName || "").trim();
    const phone = normalizePhone(req.body.phone);
    const email = String(req.body.email || "").trim().toLowerCase() || null;
    const password = String(req.body.password || "");

    if (!fullName || !phone || password.length < 6) {
      return res.status(400).json({
        error: "Nom, numéro de téléphone valide et mot de passe d'au moins 6 caractères requis."
      });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Adresse e-mail invalide." });
    }

    const loginEmail = syntheticEmail(phone);

    const { data: created, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: loginEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone,
          auth_method: "phone_password",
          contact_email: email
        }
      });

    if (createError) {
      console.error("Inscription refusée :", createError.message);
      const message = /already|exists|duplicate/i.test(createError.message)
        ? "Ce numéro est déjà associé à un compte. Essayez de vous connecter."
        : "Impossible de créer le compte. Vérifiez les informations et réessayez.";
      return res.status(409).json({ error: message });
    }

    const { data: loginData, error: loginError } =
      await supabase.auth.signInWithPassword({
        email: loginEmail,
        password
      });

    if (loginError || !loginData.session) {
      console.error("Compte créé, ouverture de session impossible :", loginError?.message);
      return res.status(201).json({
        message: "Compte créé. Connectez-vous avec votre numéro et votre mot de passe."
      });
    }

    return res.status(201).json({
      message: "Compte créé avec succès.",
      session: loginData.session,
      user: loginData.user || created.user
    });
  } catch (error) {
    console.error("Erreur inscription :", error);
    return res.status(500).json({ error: "Erreur interne pendant l'inscription." });
  }
});

// Connexion avec numéro de téléphone + mot de passe.
app.post("/api/auth/login", async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");

    if (!phone || !password) {
      return res.status(400).json({ error: "Numéro de téléphone et mot de passe requis." });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: syntheticEmail(phone),
      password
    });

    if (error || !data.session) {
      return res.status(401).json({ error: "Numéro de téléphone ou mot de passe incorrect." });
    }

    return res.json({ session: data.session, user: data.user });
  } catch (error) {
    console.error("Erreur connexion téléphone :", error);
    return res.status(500).json({ error: "Erreur interne pendant la connexion." });
  }
});

// Vérifier le fonctionnement du serveur.
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "AGRI-LINK RDC" });
});

// Vérification de l'utilisateur et transmission de son jeton.
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Connexion requise." });
    }

    const token = header.slice(7);
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: "Session invalide." });
    }

    req.user = data.user;
    req.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      }
    );
    next();
  } catch (error) {
    console.error("Erreur authentification :", error);
    return res.status(500).json({ error: "Erreur de vérification." });
  }
}

// Charger le profil de l'utilisateur connecté.
app.get("/api/profile", auth, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from("user_profiles")
      .select("id, full_name, user_role, account_status")
      .eq("id", req.user.id)
      .single();

    if (error || !data) return res.status(404).json({ error: "Profil introuvable." });
    return res.json({ profile: data });
  } catch (error) {
    console.error("Erreur profil :", error);
    return res.status(500).json({ error: "Impossible de charger le profil." });
  }
});

// Afficher les produits agricoles actifs.
app.get("/api/products", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return res.json({ products: data });
  } catch (error) {
    console.error("Erreur produits :", error);
    return res.status(500).json({ error: "Impossible de charger les produits." });
  }
});

// Publier un produit agricole : uniquement producteurs approuvés.
app.post("/api/products", auth, async (req, res) => {
  try {
    const { data: profile, error: profileError } = await req.supabase
      .from("user_profiles")
      .select("user_role, account_status")
      .eq("id", req.user.id)
      .single();

    if (
      profileError || !profile ||
      profile.account_status !== "approved" ||
      profile.user_role !== "producer"
    ) {
      return res.status(403).json({
        error: "Accès réservé aux producteurs approuvés."
      });
    }

    const {
      name, category, description, price, currency,
      quantity, unit, province, city
    } = req.body;

    if (!name || !category || price == null || quantity == null || !unit) {
      return res.status(400).json({ error: "Veuillez remplir les champs obligatoires." });
    }

    if (
      !Number.isFinite(Number(price)) || Number(price) < 0 ||
      !Number.isFinite(Number(quantity)) || Number(quantity) <= 0
    ) {
      return res.status(400).json({ error: "Prix ou quantité invalide." });
    }

    const { data, error } = await req.supabase
      .from("products")
      .insert({
        producer_id: req.user.id,
        name: String(name).trim(),
        category: String(category).trim(),
        description: description || null,
        price: Number(price),
        currency: currency || "USD",
        quantity: Number(quantity),
        unit: String(unit).trim(),
        province: province || null,
        city: city || null,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json({ message: "Produit publié avec succès.", product: data });
  } catch (error) {
    console.error("Erreur publication :", error);
    return res.status(500).json({ error: "Impossible de publier le produit." });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Route introuvable." });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`AGRI-LINK RDC démarré sur le port ${port}`);
});
