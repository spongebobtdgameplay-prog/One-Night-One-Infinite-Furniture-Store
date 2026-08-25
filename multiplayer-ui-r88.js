const Multiplayer = window.__STORE_MULTIPLAYER_R88__;
if (!Multiplayer) throw new Error("Multiplayer client must load before multiplayer UI.");

const Style = document.createElement("style");
Style.textContent = `
#MultiplayerEntryR88,.MultiplayerMenuEntryR88{min-height:46px;border:1px solid rgba(236,226,205,.46);background:rgba(33,37,34,.82);color:#eee4cf;padding:0 18px;font:850 .66rem Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;transition:background .15s ease,border-color .15s ease,transform .15s ease}
#MultiplayerEntryR88:hover,.MultiplayerMenuEntryR88:hover{background:rgba(57,63,58,.96);border-color:rgba(242,233,214,.82);transform:translateY(-1px)}
#MultiplayerEntryR88{width:100%;margin-top:9px}
#MultiplayerOverlayR88{position:fixed;inset:0;z-index:1450;display:grid;place-items:center;padding:24px;background:rgba(5,7,6,.90);backdrop-filter:blur(10px);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .18s ease}
#MultiplayerOverlayR88.Open{opacity:1;visibility:visible;pointer-events:auto}
.MultiplayerPanelR88{width:min(720px,calc(100vw - 34px));max-height:calc(100dvh - 36px);overflow:auto;border:1px solid rgba(235,226,207,.62);background:linear-gradient(180deg,#202420 0%,#151816 100%);box-shadow:0 26px 90px rgba(0,0,0,.65);color:#f2ead9}
.MultiplayerHeadR88{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:22px 24px 18px;border-bottom:1px solid rgba(239,229,207,.18)}
.MultiplayerHeadR88 small{display:block;margin-bottom:7px;color:rgba(242,234,217,.48);font:800 .58rem Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase}
.MultiplayerHeadR88 h2{margin:0;font:900 1.14rem Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase}
.MultiplayerCloseR88{width:42px;height:42px;border:1px solid rgba(240,231,212,.32);background:rgba(255,255,255,.035);color:#f2ead9;font-size:1.3rem;cursor:pointer}.MultiplayerCloseR88:hover{background:#eee4cf;color:#161916}
.MultiplayerBodyR88{padding:20px 24px 24px}.MultiplayerStatusLineR88{display:flex;align-items:center;gap:9px;margin-bottom:18px;color:rgba(242,234,217,.62);font:750 .64rem Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase}.MultiplayerDotR88{width:8px;height:8px;border-radius:50%;background:#7d817c;box-shadow:0 0 0 3px rgba(255,255,255,.035)}.MultiplayerDotR88.Online{background:#8cc58f}.MultiplayerDotR88.Waking,.MultiplayerDotR88.Connecting,.MultiplayerDotR88.Reconnecting{background:#d1a56b}
.MultiplayerGridR88{display:grid;grid-template-columns:1fr 1fr;gap:12px}.MultiplayerCardR88{border:1px solid rgba(239,229,207,.16);background:rgba(255,255,255,.025);padding:16px}.MultiplayerCardR88.Full{grid-column:1/-1}.MultiplayerCardR88 h3{margin:0 0 6px;font:900 .72rem Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase}.MultiplayerCardR88 p{margin:0 0 14px;color:rgba(242,234,217,.54);font:600 .69rem/1.45 Arial,sans-serif}
.MultiplayerFieldR88{display:grid;gap:6px;margin:11px 0}.MultiplayerFieldR88 label{font:850 .57rem Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:rgba(242,234,217,.58)}.MultiplayerFieldR88 input{width:100%;box-sizing:border-box;height:44px;border:1px solid rgba(239,229,207,.24);background:#101310;color:#f5ecda;padding:0 12px;outline:none;font:750 .76rem Arial,sans-serif}.MultiplayerFieldR88 input:focus{border-color:rgba(239,229,207,.72)}
.MultiplayerButtonR88{width:100%;min-height:44px;border:1px solid rgba(239,229,207,.34);background:#323833;color:#f2ead9;padding:0 14px;font:850 .62rem Arial,sans-serif;letter-spacing:.11em;text-transform:uppercase;cursor:pointer}.MultiplayerButtonR88:hover{background:#eee4cf;color:#151815}.MultiplayerButtonR88.Primary{background:#e9dfca;color:#171a17;border-color:#e9dfca}.MultiplayerButtonR88.Primary:hover{background:#fff6e4}.MultiplayerButtonR88.Danger{background:rgba(112,49,42,.25);border-color:rgba(194,111,99,.36)}.MultiplayerButtonR88:disabled{opacity:.42;cursor:default}
.MultiplayerActionsR88{display:grid;grid-template-columns:1fr 1fr;gap:9px}.MultiplayerMessageR88{min-height:18px;margin-top:10px;color:#ddb57c;font:700 .66rem/1.4 Arial,sans-serif}.MultiplayerIdentityR88{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:14px 16px;border:1px solid rgba(239,229,207,.16);background:rgba(255,255,255,.025);margin-bottom:12px}.MultiplayerIdentityR88 strong{display:block;font:900 .83rem Arial,sans-serif;letter-spacing:.08em}.MultiplayerIdentityR88 span{display:block;margin-top:3px;color:rgba(242,234,217,.48);font:700 .58rem Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase}
.MultiplayerRoomCodeR88{font:900 1.45rem ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.12em;margin:7px 0 14px}.MultiplayerStatsR88{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:12px}.MultiplayerStatR88{padding:10px;border:1px solid rgba(239,229,207,.12);text-align:center}.MultiplayerStatR88 strong{display:block;font:900 .86rem Arial,sans-serif}.MultiplayerStatR88 span{display:block;margin-top:4px;color:rgba(242,234,217,.45);font:800 .52rem Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase}
#NetworkHudR88{position:fixed;left:14px;bottom:56px;z-index:72;display:none;align-items:center;gap:8px;padding:7px 10px;border:1px solid rgba(238,228,207,.20);background:rgba(12,15,13,.74);backdrop-filter:blur(7px);color:rgba(242,234,217,.72);font:800 .55rem Arial,sans-serif;letter-spacing:.09em;text-transform:uppercase;pointer-events:none}#NetworkHudR88.Show{display:flex}#NetworkHudR88 .Dot{width:6px;height:6px;border-radius:50%;background:#8cc58f}
@media(max-width:650px){.MultiplayerGridR88{grid-template-columns:1fr}.MultiplayerCardR88.Full{grid-column:auto}.MultiplayerActionsR88{grid-template-columns:1fr}.MultiplayerBodyR88{padding:16px}.MultiplayerHeadR88{padding:18px 16px}.MultiplayerStatsR88{grid-template-columns:1fr 1fr 1fr}}
`;
document.head.appendChild(Style);

const Overlay = document.createElement("section");
Overlay.id = "MultiplayerOverlayR88";
Overlay.setAttribute("aria-hidden", "true");
Overlay.innerHTML = `
  <div class="MultiplayerPanelR88" role="dialog" aria-modal="true" aria-label="Account and multiplayer">
    <div class="MultiplayerHeadR88">
      <div><small>The Infinity Store Network</small><h2>Account + Multiplayer</h2></div>
      <button class="MultiplayerCloseR88" type="button" aria-label="Close">×</button>
    </div>
    <div class="MultiplayerBodyR88">
      <div class="MultiplayerStatusLineR88"><span class="MultiplayerDotR88"></span><span data-network-status>Offline</span></div>
      <div data-network-content></div>
    </div>
  </div>`;
document.body.appendChild(Overlay);

const NetworkHud = document.createElement("div");
NetworkHud.id = "NetworkHudR88";
NetworkHud.innerHTML = `<span class="Dot"></span><span data-network-hud>Multiplayer</span>`;
document.body.appendChild(NetworkHud);

const Content = Overlay.querySelector("[data-network-content]");
const StatusText = Overlay.querySelector("[data-network-status]");
const StatusDot = Overlay.querySelector(".MultiplayerDotR88");
let Message = "";
let Busy = false;

const ErrorText = {
  USERNAME_LENGTH: "Username must be 3–20 characters.",
  USERNAME_CHARACTERS: "Username can use letters, numbers, and underscore only.",
  USERNAME_TAKEN: "That username is already taken.",
  PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",
  PASSWORD_TOO_LONG: "Password is too long.",
  INVALID_LOGIN: "Username or password is incorrect.",
  MISSING_CREDENTIALS: "Enter both username and password.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Wait a minute and try again.",
  SERVER_TIMEOUT: "The server took too long to respond. Render may still be waking up.",
  SERVER_UNREACHABLE: "Could not reach the multiplayer server.",
  SOCKET_OFFLINE: "The realtime server is not connected yet.",
  ROOM_NOT_FOUND: "That room does not exist anymore.",
  ROOM_FULL: "That room is full.",
  ROOM_CODE_REQUIRED: "Enter a room code.",
  AUTH_REQUIRED: "Sign in first."
};

function FriendlyError(Result) {
  return ErrorText[Result?.error] || String(Result?.error || "Something went wrong.").replaceAll("_", " ");
}

function Open() {
  Overlay.classList.add("Open");
  Overlay.setAttribute("aria-hidden", "false");
  if (document.pointerLockElement) document.exitPointerLock?.();
  Render();
}

function Close() {
  Overlay.classList.remove("Open");
  Overlay.setAttribute("aria-hidden", "true");
}

Overlay.querySelector(".MultiplayerCloseR88")?.addEventListener("click", Close);
Overlay.addEventListener("mousedown", Event => {
  if (Event.target === Overlay) Close();
});

function EnsureEntryButtons() {
  const StartButton = document.getElementById("StartButton");
  if (StartButton?.parentElement && !document.getElementById("MultiplayerEntryR88")) {
    const Button = document.createElement("button");
    Button.id = "MultiplayerEntryR88";
    Button.type = "button";
    Button.textContent = "ACCOUNT + MULTIPLAYER";
    Button.addEventListener("click", Open);
    StartButton.insertAdjacentElement("afterend", Button);
  }

  const RuntimeActions = document.querySelector("#RuntimeMainMenuR83 .RuntimeMenuActionsR83, #RuntimeMainMenuR84 .RuntimeMenuActionsR84");
  if (RuntimeActions && !RuntimeActions.querySelector(".MultiplayerMenuEntryR88")) {
    const Button = document.createElement("button");
    Button.className = "MultiplayerMenuEntryR88";
    Button.type = "button";
    Button.textContent = "ACCOUNT + MULTIPLAYER";
    Button.addEventListener("click", Open);
    RuntimeActions.appendChild(Button);
  }
}

function SetMessage(Value) {
  Message = String(Value || "");
  const Element = Content?.querySelector?.("[data-network-message]");
  if (Element) Element.textContent = Message;
}

function SetBusy(Value) {
  Busy = Boolean(Value);
  Content?.querySelectorAll?.("button,input").forEach(Element => Element.disabled = Busy);
}

function StatusLabel(State) {
  if (State.status === "waking") return "Waking Render server…";
  if (State.status === "connecting") return "Connecting realtime server…";
  if (State.status === "reconnecting") return "Connection lost — reconnecting…";
  if (State.status === "authenticating") return "Checking account…";
  if (State.connected) return "Server online";
  return "Offline";
}

function UpdateStatus(State) {
  StatusText.textContent = StatusLabel(State);
  StatusDot.className = `MultiplayerDotR88 ${State.connected ? "Online" : State.status ? State.status[0].toUpperCase() + State.status.slice(1) : ""}`;
  const Hud = document.getElementById("Hud");
  const HudActive = Hud && !Hud.classList.contains("Hidden");
  NetworkHud.classList.toggle("Show", Boolean(HudActive && State.room));
  const HudText = NetworkHud.querySelector("[data-network-hud]");
  if (HudText) HudText.textContent = State.room ? `${State.room.playerCount || 1}/${State.room.maxPlayers || 8} • ${State.room.code}` : "Multiplayer";
}

function AuthMarkup() {
  return `
    <div class="MultiplayerGridR88">
      <form class="MultiplayerCardR88" data-login-form>
        <h3>Sign in</h3><p>Use your Infinity Store account. Your password is sent only to the Render server over HTTPS and is never stored in the game client.</p>
        <div class="MultiplayerFieldR88"><label>Username</label><input name="username" autocomplete="username" minlength="3" maxlength="20" required></div>
        <div class="MultiplayerFieldR88"><label>Password</label><input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required></div>
        <button class="MultiplayerButtonR88 Primary" type="submit">SIGN IN</button>
      </form>
      <form class="MultiplayerCardR88" data-register-form>
        <h3>Create account</h3><p>No email is required. Usernames use letters, numbers, and underscores. Passwords are Argon2id-hashed on the server.</p>
        <div class="MultiplayerFieldR88"><label>Username</label><input name="username" autocomplete="username" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" required></div>
        <div class="MultiplayerFieldR88"><label>Password</label><input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div>
        <button class="MultiplayerButtonR88" type="submit">CREATE ACCOUNT</button>
      </form>
      <div class="MultiplayerCardR88 Full"><p style="margin:0">Single-player still works without an account. An account is only required when you join the multiplayer server.</p><div class="MultiplayerMessageR88" data-network-message>${Message}</div></div>
    </div>`;
}

function RoomMarkup(State) {
  const Room = State.room;
  const Profile = State.profile || {};
  if (Room) {
    const IsHost = State.account?.id === Room.hostUserId;
    return `
      <div class="MultiplayerIdentityR88"><div><strong>${Escape(State.account.username)}</strong><span>${IsHost ? "Room host" : "Connected account"}</span></div><button class="MultiplayerButtonR88" style="width:auto" type="button" data-logout>LOG OUT</button></div>
      <div class="MultiplayerCardR88 Full">
        <h3>${Room.public ? "Public room" : "Private room"}</h3><p>Everyone in this room receives the same deterministic store seed and synchronized player/task state.</p>
        <div class="MultiplayerRoomCodeR88">${Escape(Room.code)}</div>
        <div class="MultiplayerStatsR88"><div class="MultiplayerStatR88"><strong>${Room.playerCount || 1}/${Room.maxPlayers || 8}</strong><span>Players</span></div><div class="MultiplayerStatR88"><strong>${Number(Profile.tasks_completed || 0)}</strong><span>Tasks</span></div><div class="MultiplayerStatR88"><strong>${Number(Profile.best_aisle || 0)}</strong><span>Best aisle</span></div></div>
        <div class="MultiplayerActionsR88" style="margin-top:12px"><button class="MultiplayerButtonR88" type="button" data-copy-room>COPY ROOM CODE</button><button class="MultiplayerButtonR88 Danger" type="button" data-leave-room>LEAVE ROOM</button></div>
        <div class="MultiplayerMessageR88" data-network-message>${Message}</div>
      </div>`;
  }

  return `
    <div class="MultiplayerIdentityR88"><div><strong>${Escape(State.account.username)}</strong><span>Signed in</span></div><button class="MultiplayerButtonR88" style="width:auto" type="button" data-logout>LOG OUT</button></div>
    <div class="MultiplayerGridR88">
      <div class="MultiplayerCardR88"><h3>Quick play</h3><p>Join the busiest available public room. If none exists, the server creates one automatically.</p><button class="MultiplayerButtonR88 Primary" type="button" data-quick-join>JOIN PUBLIC ROOM</button></div>
      <div class="MultiplayerCardR88"><h3>Create private room</h3><p>Create an invite-code room for up to eight players. You become the host.</p><button class="MultiplayerButtonR88" type="button" data-create-room>CREATE PRIVATE ROOM</button></div>
      <form class="MultiplayerCardR88 Full" data-join-form><h3>Join by code</h3><p>Enter the room code another player gave you.</p><div class="MultiplayerActionsR88"><div class="MultiplayerFieldR88" style="margin:0"><input name="code" maxlength="16" placeholder="ROOM CODE" autocomplete="off" required></div><button class="MultiplayerButtonR88" type="submit">JOIN ROOM</button></div><div class="MultiplayerMessageR88" data-network-message>${Message}</div></form>
    </div>`;
}

function Escape(Value) {
  const Node = document.createElement("span");
  Node.textContent = String(Value || "");
  return Node.innerHTML;
}

function BindAuthForms() {
  Content.querySelector("[data-login-form]")?.addEventListener("submit", async Event => {
    Event.preventDefault();
    const Data = new FormData(Event.currentTarget);
    SetBusy(true); SetMessage("Signing in…");
    const Result = await Multiplayer.Login(Data.get("username"), Data.get("password"));
    Message = Result?.ok ? "Signed in." : FriendlyError(Result);
    Busy = false; Render();
  });
  Content.querySelector("[data-register-form]")?.addEventListener("submit", async Event => {
    Event.preventDefault();
    const Data = new FormData(Event.currentTarget);
    SetBusy(true); SetMessage("Creating account…");
    const Result = await Multiplayer.Register(Data.get("username"), Data.get("password"));
    Message = Result?.ok ? "Account created." : FriendlyError(Result);
    Busy = false; Render();
  });
}

function BindRoomControls() {
  Content.querySelector("[data-logout]")?.addEventListener("click", async () => {
    SetBusy(true); await Multiplayer.Logout(); Message = "Signed out."; Busy = false; Render();
  });
  Content.querySelector("[data-quick-join]")?.addEventListener("click", async () => {
    SetBusy(true); SetMessage("Finding a public room…"); const Result = await Multiplayer.QuickJoin(); Message = Result?.ok ? "Joined room." : FriendlyError(Result); Busy = false; Render();
  });
  Content.querySelector("[data-create-room]")?.addEventListener("click", async () => {
    SetBusy(true); SetMessage("Creating room…"); const Result = await Multiplayer.CreateRoom(false); Message = Result?.ok ? "Private room created." : FriendlyError(Result); Busy = false; Render();
  });
  Content.querySelector("[data-join-form]")?.addEventListener("submit", async Event => {
    Event.preventDefault(); const Data = new FormData(Event.currentTarget); SetBusy(true); SetMessage("Joining room…"); const Result = await Multiplayer.JoinRoom(Data.get("code")); Message = Result?.ok ? "Joined room." : FriendlyError(Result); Busy = false; Render();
  });
  Content.querySelector("[data-leave-room]")?.addEventListener("click", async () => {
    SetBusy(true); await Multiplayer.LeaveRoom(); Message = "Left room."; Busy = false; Render();
  });
  Content.querySelector("[data-copy-room]")?.addEventListener("click", async () => {
    const Code = Multiplayer.GetState().room?.code || "";
    try { await navigator.clipboard.writeText(Code); Message = "Room code copied."; } catch { Message = `Room code: ${Code}`; }
    Render();
  });
}

function Render() {
  EnsureEntryButtons();
  const State = Multiplayer.GetState();
  UpdateStatus(State);
  Content.innerHTML = State.account ? RoomMarkup(State) : AuthMarkup();
  if (Busy) Content.querySelectorAll("button,input").forEach(Element => Element.disabled = true);
  if (State.account) BindRoomControls(); else BindAuthForms();
}

addEventListener("store-network-change", Render);
addEventListener("store-account-change", Render);
addEventListener("store-room-change", Render);
addEventListener("keydown", Event => {
  if (Event.code === "Escape" && Overlay.classList.contains("Open")) {
    Event.preventDefault();
    Event.stopImmediatePropagation();
    Close();
  }
}, true);

const Observer = new MutationObserver(() => {
  EnsureEntryButtons();
  UpdateStatus(Multiplayer.GetState());
});
Observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
addEventListener("pagehide", () => Observer.disconnect(), { once: true });

EnsureEntryButtons();
Render();
window.__STORE_MULTIPLAYER_UI_R88__ = { Open, Close, Render };
window.__STORE_MULTIPLAYER_UI_BUILD__ = "V0.25.0-R88";
