// CONNEXION SUPABASE
const SUPABASE_URL = "https://dujnjcwuwilpswpnfcll.supabase.co";
const SUPABASE_KEY = "sb_publishable_q4eSMkDkd_u2Cspay2H8Uw_htNbjDYf";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const statusBox = document.getElementById("authStatus");

// Afficher les messages
function showMessage(message) {
  if (statusBox) statusBox.textContent = message;
}

// CRÉATION DE COMPTE
const signUpForm = document.getElementById("signUpForm");

if (signUpForm) {
  signUpForm.addEventListener("submit", async (event) => {
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
          phone: phone
        }
      }
    });

    if (error) {
      showMessage("Erreur : " + error.message);
      return;
    }

    if (data.session) {
      showMessage("Compte créé. Votre demande attend la validation de l'administrateur.");
      await checkAccount(data.user);
    } else {
      showMessage("Compte créé. Vérifiez votre adresse e-mail pour confirmer l'inscription.");
    }

    signUpForm.reset();
  });
}

// CONNEXION
const signInForm = document.getElementById("signInForm");

if (signInForm) {
  signInForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    showMessage("Connexion en cours...");

    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      showMessage("Erreur de connexion : " + error.message);
      return;
    }

    await checkAccount(data.user);
  });
}

// VÉRIFICATION DU COMPTE
async function checkAccount(user) {
  const { data, error } = await supabaseClient
    .from("user_profiles")
    .select("full_name, user_role, account_status")
    .eq("id", user.id)
    .single();

  if (error) {
    showMessage("Impossible de vérifier votre compte. Contactez l'administrateur.");
    return;
  }

  if (data.account_status === "pending") {
    showMessage("Bienvenue " + data.full_name + ". Votre compte attend l'approbation de l'administrateur.");
    return;
  }

  if (data.account_status === "rejected") {
    showMessage("Votre demande de compte a été refusée. Contactez l'administrateur.");
    return;
  }

  if (data.account_status === "approved") {
    showMessage("Bienvenue " + data.full_name + " ! Votre compte est approuvé.");
    document.getElementById("profileStatus").textContent =
      "Profil : " + data.user_role;
  }
}

// DÉCONNEXION
const signOutBtn = document.getElementById("signOutBtn");

if (signOutBtn) {
  signOutBtn.addEventListener("click", async () => {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      showMessage("Erreur : " + error.message);
      return;
    }

    showMessage("Vous êtes déconnecté.");
    document.getElementById("profileStatus").textContent = "";
  });
}

// RECHERCHE DES MODULES
const searchInput = document.getElementById("searchModule");
const moduleCards = document.querySelectorAll(".module-card");

if (searchInput) {
  searchInput.addEventListener("input", function () {
    const search = this.value.toLowerCase().trim();

    moduleCards.forEach(card => {
      const name = card.dataset.name.toLowerCase();
      const content = card.textContent.toLowerCase();

      card.style.display =
        name.includes(search) || content.includes(search)
          ? "block"
          : "none";
    });
  });
}

// MENU
const menuBtn = document.getElementById("menuBtn");

if (menuBtn) {
  menuBtn.addEventListener("click", function () {
    alert("Bienvenue dans le menu AGRI-LINK RDC !");
  });
}

console.log("AGRI-LINK RDC connecté à Supabase.");
