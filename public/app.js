
// ==========================================
// AGRI-LINK RDC - APPLICATION PRINCIPALE
// ==========================================

const SUPABASE_URL = "https://dujnjcwuwilpswpnfcll.supabase.co";
const SUPABASE_KEY = "sb_publishable_q4eSMkDkd_u2Cspay2H8Uw_htNbjDYf";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const statusBox = document.getElementById("authStatus");
const profileBox = document.getElementById("profileStatus");

let currentUser = null;
let currentProfile = null;

function showMessage(message) {
  if (statusBox) statusBox.textContent = message;
}

function showProfile(message) {
  if (profileBox) profileBox.textContent = message;
}

// ==========================================
// CRÉATION DE LA ZONE AGRI-MARKET
// ==========================================

const marketSection = document.createElement("section");
marketSection.id = "agriMarket";
marketSection.className = "dashboard";

marketSection.innerHTML = `
  <h2>🛒 AGRI-MARKET</h2>
  <p>Découvrez les produits agricoles disponibles en RDC.</p>

  <div id="productFormContainer"></div>

  <h3>Produits agricoles disponibles</h3>
  <p id="productMessage">Chargement des produits...</p>
  <div id="productList"></div>
`;

const dashboard = document.querySelector(".dashboard");

if (dashboard) {
  dashboard.parentNode.insertBefore(marketSection, dashboard);
}

// ==========================================
// AFFICHAGE DES PRODUITS
// ==========================================

async function loadProducts() {
  const list = document.getElementById("productList");
  const message = document.getElementById("productMessage");

  if (!list || !message) return;

  message.textContent = "Chargement des produits...";
  list.replaceChildren();

  const { data, error } = await supabaseClient
    .from("products")
    .select("id, name, category, description, price, currency, quantity, unit, province, city, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    message.textContent =
      message.textContent =
  "Erreur Supabase : " + error.message;
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    message.textContent = "Aucun produit disponible pour le moment.";
    return;
  }

  message.textContent = `${data.length} produit(s) disponible(s).`;

  data.forEach(product => {
    const card = document.createElement("article");
    card.className = "module-card";

    const title = document.createElement("h3");
    title.textContent = product.name;

    const category = document.createElement("p");
    category.textContent = "Catégorie : " + product.category;

    const description = document.createElement("p");
    description.textContent = product.description || "Aucune description.";

    const price = document.createElement("p");
    price.textContent =
      "Prix : " + product.price + " " + (product.currency || "USD");

    const quantity = document.createElement("p");
    quantity.textContent =
      "Quantité : " + product.quantity + " " + product.unit;

    const location = document.createElement("p");
    location.textContent =
      "Localisation : " +
      [product.city, product.province].filter(Boolean).join(", ");

    card.append(
      title,
      category,
      description,
      price,
      quantity,
      location
    );

    list.appendChild(card);
  });
}

// ==========================================
// FORMULAIRE DE PUBLICATION
// ==========================================

function showProductForm() {
  const container = document.getElementById("productFormContainer");

  if (!container) return;

  container.innerHTML = "";

  if (
    !currentProfile ||
    currentProfile.user_role !== "producer" ||
    currentProfile.account_status !== "approved"
  ) {
    return;
  }

  container.innerHTML = `
    <form id="productForm">
      <h3>Publier un produit agricole</h3>

      <input id="productName" type="text"
        placeholder="Nom du produit" required>

      <input id="productCategory" type="text"
        placeholder="Catégorie (maïs, manioc, riz...)" required>

      <textarea id="productDescription"
        placeholder="Description du produit"></textarea>

      <input id="productPrice" type="number"
        min="0" step="0.01" placeholder="Prix" required>

      <select id="productCurrency" required>
        <option value="USD">Dollar américain (USD)</option>
        <option value="CDF">Franc congolais (CDF)</option>
      </select>

      <input id="productQuantity" type="number"
        min="0.01" step="0.01" placeholder="Quantité" required>

      <input id="productUnit" type="text"
        placeholder="Unité (kg, sac, tonne, panier...)" required>

      <input id="productProvince" type="text"
        placeholder="Province">

      <input id="productCity" type="text"
        placeholder="Ville ou territoire">

      <button type="submit">Publier le produit</button>
    </form>
    <hr>
  `;

  document.getElementById("productForm").addEventListener(
    "submit",
    publishProduct
  );
}

// ==========================================
// PUBLICATION D'UN PRODUIT
// ==========================================

async function publishProduct(event) {
  event.preventDefault();

  if (!currentUser || !currentProfile) {
    showMessage("Veuillez vous connecter.");
    return;
  }

  if (
    currentProfile.user_role !== "producer" ||
    currentProfile.account_status !== "approved"
  ) {
    showMessage("Seuls les producteurs approuvés peuvent publier.");
    return;
  }

  const name = document.getElementById("productName").value.trim();
  const category = document.getElementById("productCategory").value.trim();
  const description = document.getElementById("productDescription").value.trim();
  const price = Number(document.getElementById("productPrice").value);
  const currency = document.getElementById("productCurrency").value;
  const quantity = Number(document.getElementById("productQuantity").value);
  const unit = document.getElementById("productUnit").value.trim();
  const province = document.getElementById("productProvince").value.trim();
  const city = document.getElementById("productCity").value.trim();

  if (
    !name || !category || !unit ||
    !Number.isFinite(price) || price < 0 ||
    !Number.isFinite(quantity) || quantity <= 0
  ) {
    showMessage("Vérifiez les informations du produit.");
    return;
  }

  const button = event.target.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "Publication en cours...";

  const { error } = await supabaseClient
    .from("products")
    .insert({
      producer_id: currentUser.id,
      name,
      category,
      description: description || null,
      price,
      currency,
      quantity,
      unit,
      province: province || null,
      city: city || null,
      is_active: true
    });

  button.disabled = false;
  button.textContent = "Publier le produit";

  if (error) {
    console.error(error);
    showMessage("Erreur de publication : " + error.message);
    return;
  }

  showMessage("Produit publié avec succès !");
  event.target.reset();

  await loadProducts();
}

// ==========================================
// VÉRIFICATION DU PROFIL
// ==========================================

async function checkAccount(user) {
  currentUser = user;

  const { data, error } = await supabaseClient
    .from("user_profiles")
    .select("id, full_name, user_role, account_status")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    currentProfile = null;
    showMessage(
      "Profil introuvable ou inaccessible. Vérifiez les règles RLS de user_profiles."
    );
    showProfile("");
    showProductForm();
    return;
  }

  currentProfile = data;

  if (data.account_status === "pending") {
    showMessage(
      "Bienvenue " + data.full_name +
      ". Votre compte attend l'approbation de l'administrateur."
    );
  } else if (data.account_status === "rejected") {
    showMessage("Votre demande de compte a été refusée.");
  } else if (data.account_status === "approved") {
    showMessage("Bienvenue " + data.full_name + " ! Votre compte est approuvé.");
  } else {
    showMessage("Statut du compte : " + data.account_status);
  }

  showProfile("Profil : " + (data.user_role || "Non défini"));

  showProductForm();
}

// ==========================================
// INSCRIPTION
// ==========================================

const signUpForm = document.getElementById("signUpForm");

if (signUpForm) {
  signUpForm.addEventListener("submit", async event => {
    event.preventDefault();

    const fullName = document.getElementById("fullName").value.trim();
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const password = document.getElementById("password").value;

    showMessage("Création du compte en cours...");

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone
        }
      }
    });

    if (error) {
      showMessage("Erreur : " + error.message);
      return;
    }

    signUpForm.reset();

    if (data.session && data.user) {
      showMessage("Compte créé. Vérification du profil...");
      await checkAccount(data.user);
    } else {
      showMessage(
        "Compte créé. Consultez votre boîte e-mail pour confirmer votre inscription."
      );
    }
  });
}

// ==========================================
// CONNEXION
// ==========================================

const signInForm = document.getElementById("signInForm");

if (signInForm) {
  signInForm.addEventListener("submit", async event => {
    event.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    showMessage("Connexion en cours...");

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      showMessage("Erreur de connexion : " + error.message);
      return;
    }

    await checkAccount(data.user);
    signInForm.reset();
  });
}

// ==========================================
// DÉCONNEXION
// ==========================================

const signOutBtn = document.getElementById("signOutBtn");

if (signOutBtn) {
  signOutBtn.addEventListener("click", async () => {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      showMessage("Erreur : " + error.message);
      return;
    }

    currentUser = null;
    currentProfile = null;

    showMessage("Vous êtes déconnecté.");
    showProfile("");
    showProductForm();
  });
}

// ==========================================
// RESTAURATION DE LA SESSION
// ==========================================

async function restoreSession() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    showMessage("Impossible de restaurer la session.");
    return;
  }

  if (data.session) {
    await checkAccount(data.session.user);
  }
}

// ==========================================
// RECHERCHE DES 13 MODULES
// ==========================================

const searchInput = document.getElementById("searchModule");
const moduleCards = document.querySelectorAll(".module-card");

if (searchInput) {
  searchInput.addEventListener("input", function () {
    const search = this.value.toLowerCase().trim();

    moduleCards.forEach(card => {
      const content = card.textContent.toLowerCase();
      card.style.display = content.includes(search) ? "block" : "none";
    });
  });
}

// ==========================================
// MENU
// ==========================================

const menuBtn = document.getElementById("menuBtn");

if (menuBtn) {
  menuBtn.addEventListener("click", () => {
    document.querySelector(".dashboard")?.scrollIntoView({
      behavior: "smooth"
    });
  });
}

// ==========================================
// DÉMARRAGE
// ==========================================

loadProducts();
restoreSession();

console.log("AGRI-LINK RDC : application initialisée.");
