const Card = document.querySelector(".BootCard");
const BuildVersion = document.getElementById("BuildVersion");

if (Card) {
  Card.dataset.R43Built = "1";
  Card.classList.remove("R43Menu");
}

for (const Shape of document.querySelectorAll(".R43Vector")) Shape.remove();

let Actions = document.getElementById("MainMenuActions");
if (Card && !Actions) {
  Actions = document.createElement("div");
  Actions.id = "MainMenuActions";
  Actions.className = "MainMenuActions";
  Card.insertBefore(Actions, BuildVersion || null);
}

if (Actions && !document.getElementById("FirstMenuSettingsButton")) {
  const SettingsButton = document.createElement("button");
  SettingsButton.id = "FirstMenuSettingsButton";
  SettingsButton.type = "button";
  SettingsButton.className = "SecondaryMenuButton";
  SettingsButton.textContent = "SETTINGS";
  SettingsButton.addEventListener("click", () => {
    const Overlay = document.getElementById("SettingsOverlayR43");
    if (!Overlay) return;
    Overlay.classList.add("Open");
    Overlay.setAttribute("aria-hidden", "false");
  });
  Actions.appendChild(SettingsButton);
}

window.__STORE_SINGLE_MENU_BUILD__ = "V0.12.25";