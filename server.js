
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.json({ limit: "1mb" }));

// Origines autorisées
const allowedOrigins = new Set(
  (process.env.FRONTEND_URL || "https://josuesinga.github.io")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean)
);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origine non autorisée."));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Configuration Supabase
const required = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY"
];

for (const key of required) {
  if (!process.env[key]) {
    console.error("Variable manquante :", key);
    process.exit(1);
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Authentification sécurisée
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Connexion requise."
      });
    }

    const token = header.slice(7);

    const { data, error } =
      await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        error: "Session invalide."
      });
    }

    // Client utilisant la session de l'utilisateur.
    // Les règles RLS Supabase restent appliquées.
    req.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    );

    req.user = data.user;
    next();

  } catch (error) {
    console.error("Erreur authentification :", error.message);

    res.status(500).json({
      error: "Erreur de vérification du compte."
    });
  }
}

// Vérification du serveur
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "AGRI-LINK RDC",
    version: "1.0.0"
  });
});

// Consultation du profil connecté
app.get("/api/profile", auth, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from("user_profiles")
      .select("id, full_name, user_role, account_status")
      .eq("id", req.user.id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: "Profil introuvable ou accès refusé."
      });
    }

    res.json({
      profile: data
    });

  } catch (error) {
    console.error("Erreur profil :", error.message);

    res.status(500).json({
      error: "Impossible de charger le profil."
    });
  }
});

// Consultation des produits agricoles actifs
app.get("/api/products", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({
      products: data || []
    });

  } catch (error) {
    console.error("Erreur produits :", error.message);

    res.status(500).json({
      error: "Impossible de charger les produits."
    });
  }
});

// Publication d'un produit par un producteur approuvé
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
    } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof category !== "string" ||
      !category.trim() ||
      price === undefined ||
      quantity === undefined ||
      typeof unit !== "string" ||
      !unit.trim()
    ) {
      return res.status(400).json({
        error: "Veuillez remplir les champs obligatoires."
      });
    }

    const numericPrice = Number(price);
    const numericQuantity = Number(quantity);

    if (
      !Number.isFinite(numericPrice) ||
      numericPrice < 0 ||
      !Number.isFinite(numericQuantity) ||
      numericQuantity <= 0
    ) {
      return res.status(400).json({
        error: "Le prix ou la quantité est invalide."
      });
    }

    const { data, error } = await req.supabase
      .from("products")
      .insert({
        producer_id: req.user.id,
        name: name.trim(),
        category: category.trim(),
        description: description || null,
        price: numericPrice,
        currency: currency || "USD",
        quantity: numericQuantity,
        unit: unit.trim(),
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
    console.error("Erreur publication :", error.message);

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

// Gestion des erreurs
app.use((error, req, res, next) => {
  console.error("Erreur serveur :", error.message);

  res.status(500).json({
    error: "Une erreur serveur est survenue."
  });
});

// Démarrage
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`AGRI-LINK RDC démarré sur le port ${PORT}`);
});
