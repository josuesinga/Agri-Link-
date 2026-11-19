
const searchInput = document.getElementById("searchModule");
const moduleCards = document.querySelectorAll(".module-card");

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

moduleCards.forEach(card => {
  card.addEventListener("click", function () {
    const moduleName = this.dataset.name;

    alert(
      moduleName +
      "\n\nBienvenue dans ce module AGRI-LINK RDC !" +
      "\n\nCe service sera développé progressivement."
    );
  });
});

const menuBtn = document.getElementById("menuBtn");

menuBtn.addEventListener("click", function () {
  alert("Bienvenue dans le menu AGRI-LINK RDC !");
});

console.log("AGRI-LINK RDC est initialisé.");
