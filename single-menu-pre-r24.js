const Card = document.querySelector(".BootCard");
const StartButton = document.getElementById("StartButton");
const BuildVersion = document.getElementById("BuildVersion");

if (Card) {
  Card.dataset.R43Built = "1";
  Card.classList.remove("R43Menu");
}

for (const Shape of document.querySelectorAll(".R43Vector")) Shape.remove();

if (Card && StartButton && !document.getElementById("FirstMenuSettingsButton")) {
  const SettingsButton = document.createElement("button");
  SettingsButton.id = "FirstMenuSettingsButton";
  SettingsButton.type = "button";
  SettingsButton.textContent = "SETTINGS";
  SettingsButton.style.marginTop = "8px";
  SettingsButton.style.minHeight = "42px";
  SettingsButton.style.padding = "0 18px";
  SettingsButton.style.border = "1px solid rgba(255,255,255,.28)";
  SettingsButton.style.background = "rgba(10,12,13,.58)";
  SettingsButton.style.color = "#fff";
  SettingsButton.style.fontWeight = "800";
  SettingsButton.style.letterSpacing = ".08em";
  SettingsButton.style.cursor = "pointer";
  SettingsButton.addEventListener("click", () => {
    const Overlay = document.getElementById("SettingsOverlayR43");
    if (!Overlay) return;
    Overlay.classList.add("Open");
    Overlay.setAttribute("aria-hidden", "false");
  });
  Card.insertBefore(SettingsButton, BuildVersion || null);
}

window.__STORE_SINGLE_MENU_BUILD__ = "V0.12.24";
