const Card = document.querySelector(".BootCard");
const StartButton = document.getElementById("StartButton");
const BuildVersion = document.getElementById("BuildVersion");

if (Card) {
  Card.dataset.R43Built = "1";
  Card.classList.remove("R43Menu");
}

for (const Shape of document.querySelectorAll(".R43Vector")) Shape.remove();

let Actions = document.getElementById("MainMenuActions");
if (Card && StartButton && !Actions) {
  Actions = document.createElement("div");
  Actions.id = "MainMenuActions";
  Actions.className = "MainMenuActions";
  StartButton.insertAdjacentElement("afterend", Actions);
}

function CreateMenuButton(Id, Text, ClassName, Handler) {
  let Button = document.getElementById(Id);
  if (Button) return Button;
  Button = document.createElement("button");
  Button.id = Id;
  Button.type = "button";
  Button.className = ClassName;
  Button.textContent = Text;
  Button.addEventListener("click", Handler);
  Actions?.appendChild(Button);
  return Button;
}

if (Actions) {
  CreateMenuButton(
    "StoreMultiplayerMainButton",
    "MULTIPLAYER",
    "MainMenuButton MainMenuButtonMultiplayer",
    () => window.__STORE_MULTIPLAYER__?.OpenMultiplayer?.()
  );

  CreateMenuButton(
    "FirstMenuSettingsButton",
    "SETTINGS",
    "MainMenuButton",
    () => {
      const Overlay = document.getElementById("SettingsOverlayR43");
      if (!Overlay) return;
      Overlay.classList.add("Open");
      Overlay.setAttribute("aria-hidden", "false");
    }
  );
}

window.__STORE_SINGLE_MENU_BUILD__ = "V0.27.3";