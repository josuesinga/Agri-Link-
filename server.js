
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.json({ limit: "1mb" }));

const allowedOrigins = (process.env.FRONTEND_URL || "https://josuesinga.github.io")
  .split(",")
  .map(origin => origin.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Variable manquante : ${key}`);
    process.exit(1);
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Vérification de l'utilisateur et transmission de son jeton
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Connexion requise."
      });
    }

    const token = header.slice(7);

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        error: "Session invalide."
      });
    }

    req.user = data.user;

    req.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );

    next();
  } catch (error) {
    console.error("Erreur authentification :", error);
    res.status(500).json({
      error: "Erreur de vérification."
    });
  }
}

// Vérifier le fonctionnement du serveur
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "AGRI-LINK RDC"
  });
});

// Charger le profil de l'utilisateur connecté
app.get("/api/profile", auth, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from("user_profiles")
      .select("id, full_name, user_role, account_status")
      .eq("id", req.user.id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: "Profil introuvable."
      });
    }

    res.json({ profile: data });
  } catch (error) {
    console.error("Erreur profil :", error);
    res.status(500).json({
      error: "Impossible de charger le profil."
    });
  }
});

// Afficher les produits agricoles actifs
app.get("/api/products", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ products: data });
  } catch (error) {
    console.error("Erreur produits :", error);
    res.status(500).json({
      error: "Impossible de charger les produits."
    });
  }
});

// Publier un produit agricole
app.post("/api/products", auth, async (req, res) => {
  try {
    const { data: profile, error: profileError } =
      await req.supabase
        .from("user_profiles")
        .select("user_role, account_status")
        .eq("id", req.user.id)
        .single();

    if (
      profileError ||
      !profile ||
      profile.account_status !== "approved" ||
      profile.user_role !== "producer"
    ) {
      return res.status(403).json({
        error: "Accès réservé aux producteurs approuvés."
      });
    }

    const {
      name,
      category,
      description,
      price,
      currency,
      quantity,
      unit,
      province,
      city
    } = req.body;

    if (
      !name || !category ||
      price == null ||
      quantity == null ||
      !unit
    ) {
      return res.status(400).json({
        error: "Veuillez remplir les champs obligatoires."
      });
    }

    if (
      !Number.isFinite(Number(price)) ||
      Number(price) < 0 ||
      !Number.isFinite(Number(quantity)) ||
      Number(quantity) <= 0
    ) {
      return res.status(400).json({
        error: "Prix ou quantité invalide."
      });
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

    res.status(201).json({
      message: "Produit publié avec succès.",
      product: data
    });
  } catch (error) {
    console.error("Erreur publication :", error);
    res.status(500).json({
      error: "Impossible de publier le produit."
    });
  }
});

// Route inconnue
app.use((req, res) => {
  res.status(404).json({
    error: "Route introuvable."
  });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`AGRI-LINK RDC démarré sur le port ${port}`);
});
