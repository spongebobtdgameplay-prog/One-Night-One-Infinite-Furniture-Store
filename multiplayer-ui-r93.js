const Multiplayer = window.__STORE_MULTIPLAYER_R88__;
if (!Multiplayer) throw new Error("Multiplayer client must load before multiplayer UI.");

const Style = document.createElement("style");
Style.id = "MultiplayerUiStyleR93";
Style.textContent = `
#NetworkOverlayR93{position:fixed;inset:0;z-index:1450;display:grid;place-items:center;padding:20px;background:rgba(4,5,4,.93);backdrop-filter:blur(12px);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .16s ease}#NetworkOverlayR93.Open{opacity:1;visibility:visible;pointer-events:auto}.NetFrameR93{width:min(780px,calc(100vw - 28px));max-height:calc(100dvh - 30px);overflow:auto;border:1px solid rgba(224,211,186,.46);background:linear-gradient(180deg,#1b1e1a,#0f110f);box-shadow:0 30px 100px rgba(0,0,0,.76);color:#eee4d0}.NetHeadR93{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(224,211,186,.14);background:rgba(24,27,23,.98)}.NetHeadR93>button{width:40px;height:40px;border:1px solid rgba(224,211,186,.24);background:#151815;color:#eee4d0;cursor:pointer;font-size:1.05rem}.NetHeadR93>button:hover{background:#e8ddc7;color:#111}.NetTitleR93{flex:1}.NetTitleR93 small{display:block;color:#9c7958;font:900 .5rem Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase}.NetTitleR93 h2{margin:4px 0 0;font:900 1rem Arial,sans-serif;letter-spacing:.13em}.NetBodyR93{padding:18px}.NetStatusR93{display:flex;align-items:center;gap:8px;margin-bottom:14px;color:rgba(238,228,208,.52);font:850 .55rem Arial,sans-serif;letter-spacing:.09em;text-transform:uppercase}.NetStatusR93 i{width:7px;height:7px;border-radius:50%;background:#6e706b}.NetStatusR93.On i{background:#8cb18a;box-shadow:0 0 11px rgba(140,177,138,.34)}.NetStatusR93.Wait i{background:#bc8b55}.NetCardR93{border:1px solid rgba(224,211,186,.13);background:rgba(255,255,255,.022);padding:16px;margin-bottom:10px}.NetCardR93 h3{margin:0 0 7px;font:900 .72rem Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase}.NetCardR93 p{margin:0 0 13px;color:rgba(238,228,208,.47);font:600 .67rem/1.48 Arial,sans-serif}.NetGridR93,.NetActionsR93{display:grid;grid-template-columns:1fr 1fr;gap:9px}.NetFieldR93{display:grid;gap:6px;margin:10px 0}.NetFieldR93 label{color:rgba(238,228,208,.52);font:900 .53rem Arial,sans-serif;letter-spacing:.11em;text-transform:uppercase}.NetFieldR93 input,.NetFieldR93 select{box-sizing:border-box;width:100%;height:44px;border:1px solid rgba(224,211,186,.22);background:#090b09;color:#f4ead7;padding:0 12px;outline:none;font:800 .76rem Arial,sans-serif}.NetFieldR93 input:focus,.NetFieldR93 select:focus{border-color:rgba(224,211,186,.70)}.NetFieldR93 input[data-code-input]{font:900 .92rem ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase}.NetButtonR93,.MainNetR93,.RuntimeNetR93{min-height:44px;border:1px solid rgba(224,211,186,.30);background:#2b302b;color:#eee4d0;padding:0 14px;font:900 .61rem Arial,sans-serif;letter-spacing:.11em;text-transform:uppercase;cursor:pointer}.NetButtonR93{width:100%}.NetButtonR93:hover,.MainNetR93:hover,.RuntimeNetR93:hover{background:#e8ddc7;color:#111}.NetButtonR93.Primary,.MainNetR93.Primary{background:#e1d5bd;color:#151715;border-color:#e1d5bd}.NetButtonR93.Danger{border-color:rgba(143,65,55,.5);background:rgba(88,35,30,.28)}.NetButtonR93:disabled,.MainNetR93:disabled{opacity:.4;cursor:default}.NetMessageR93{min-height:18px;margin-top:10px;color:#d2a36f;font:700 .64rem/1.4 Arial,sans-serif}.NetAvatarR93{width:40px;height:40px;display:grid;place-items:center;flex:none;border:1px solid rgba(224,211,186,.23);border-radius:7px;background:#232722}.NetAvatarR93 svg{display:block;width:21px;height:21px;fill:#e7dcc6}.NetProfileHeroR93,.NetSavedR93,.NetPlayerR93{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid rgba(224,211,186,.13);background:rgba(255,255,255,.022);margin-bottom:8px}.NetProfileHeroR93 .NetAvatarR93{width:50px;height:50px}.NetProfileHeroR93 strong,.NetSavedR93 strong,.NetPlayerR93 strong{display:block;font:900 .78rem Arial,sans-serif}.NetProfileHeroR93 small,.NetSavedR93 small,.NetPlayerR93 small{display:block;margin-top:4px;color:rgba(238,228,208,.40);font:800 .5rem Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase}.NetInfoR93{flex:1;min-width:0}.NetStatsR93{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:10px}.NetStatR93{padding:10px;border:1px solid rgba(224,211,186,.11);text-align:center}.NetStatR93 strong{display:block;font:900 .9rem Arial,sans-serif}.NetStatR93 span{display:block;margin-top:4px;color:rgba(238,228,208,.40);font:900 .49rem Arial,sans-serif;letter-spacing:.08em}.NetHostR93{padding:4px 7px;border:1px solid rgba(194,143,85,.38);color:#d2a26a;font:900 .47rem Arial,sans-serif;letter-spacing:.08em}.NetCodeR93{font:900 1.6rem ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.17em;margin:5px 0 12px}.NetMetaR93{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:11px}.NetMetaR93 span{padding:5px 7px;border:1px solid rgba(224,211,186,.11);color:rgba(238,228,208,.52);font:900 .49rem Arial,sans-serif;text-transform:uppercase}.NetWaitR93{padding:10px;margin:9px 0;border:1px solid rgba(186,132,74,.22);background:rgba(186,132,74,.045);color:#cea16d;font:750 .62rem/1.4 Arial,sans-serif}.NetWaitR93.Ready{border-color:rgba(121,164,119,.25);color:#96b796}.NetToggleRowR93{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 0;border-top:1px solid rgba(224,211,186,.08)}.NetToggleRowR93 strong{font:900 .59rem Arial,sans-serif;text-transform:uppercase}.NetToggleRowR93 small{display:block;margin-top:4px;color:rgba(238,228,208,.39);font:600 .58rem/1.35 Arial,sans-serif}.NetToggleR93{appearance:none;width:45px;height:24px;border:1px solid rgba(224,211,186,.28);background:#2c312b;position:relative;cursor:pointer;flex:none}.NetToggleR93:after{content:"";position:absolute;width:16px;height:16px;left:3px;top:3px;background:#777c75;transition:transform .15s ease}.NetToggleR93:checked:after{transform:translateX(20px);background:#e5dac4}.NetSavedR93 button{width:auto;min-width:86px}.NetEmptyR93{padding:14px;border:1px solid rgba(224,211,186,.10);color:rgba(238,228,208,.42);font:650 .63rem Arial,sans-serif}.NetMainWrapR93{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;margin-top:10px}.MainNetR93{width:100%}.MainNetR93.Wide,.MainProfileR93{grid-column:1/-1}.MainProfileR93{display:flex;align-items:center;gap:11px;min-height:54px;padding:7px 10px;border:1px solid rgba(224,211,186,.24);background:rgba(19,22,19,.83);color:#eee4d0;cursor:pointer;text-align:left}.MainProfileR93:hover{border-color:rgba(224,211,186,.58)}.MainProfileR93 strong{display:block;font:900 .71rem Arial,sans-serif}.MainProfileR93 small{display:block;margin-top:3px;color:rgba(238,228,208,.39);font:850 .49rem Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase}.MainProfileR93 b{margin-left:auto;color:rgba(238,228,208,.38)}.RuntimeNetR93{min-width:142px}.NetworkHudR93{position:fixed;left:14px;bottom:58px;z-index:72;display:none;align-items:center;gap:7px;padding:7px 9px;border:1px solid rgba(224,211,186,.16);background:rgba(8,10,8,.78);color:rgba(238,228,208,.62);font:900 .53rem Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;pointer-events:none}.NetworkHudR93.Show{display:flex}.NetworkHudR93 i{width:6px;height:6px;border-radius:50%;background:#8caf88}
@media(max-width:650px){.NetGridR93,.NetActionsR93,.NetMainWrapR93{grid-template-columns:1fr}.MainNetR93.Wide,.MainProfileR93{grid-column:auto}.NetBodyR93{padding:14px}}
`;
document.head.appendChild(Style);

const Overlay = document.createElement("section");
Overlay.id = "NetworkOverlayR93";
Overlay.setAttribute("aria-hidden", "true");
Overlay.innerHTML = `
  <div class="NetFrameR93" role="dialog" aria-modal="true" aria-label="Account and multiplayer">
    <div class="NetHeadR93">
      <button type="button" data-back aria-label="Back">←</button>
      <div class="NetTitleR93"><small>THE INFINITY STORE NETWORK</small><h2 data-title>ACCOUNT</h2></div>
      <button type="button" data-close aria-label="Close">×</button>
    </div>
    <div class="NetBodyR93">
      <div class="NetStatusR93"><i></i><span data-status>Offline</span></div>
      <div data-content></div>
    </div>
  </div>`;
document.body.appendChild(Overlay);

const NetworkHud = document.createElement("div");
NetworkHud.className = "NetworkHudR93";
NetworkHud.innerHTML = `<i></i><span data-hud></span>`;
document.body.appendChild(NetworkHud);

const Content = Overlay.querySelector("[data-content]");
const Title = Overlay.querySelector("[data-title]");
const BackButton = Overlay.querySelector("[data-back]");
const StatusLine = Overlay.querySelector(".NetStatusR93");
const StatusText = Overlay.querySelector("[data-status]");
const StartButton = document.getElementById("StartButton");
const BootScreen = document.getElementById("BootScreen");

let Page = "login";
let Message = "";
let Busy = false;
let AvailableServers = null;
let LobbyPlayers = [];
let BoundSocket = null;
let LobbySignature = "";
let MainSignature = "";
let StartTransitioning = false;
let ServerRefreshBusy = false;

const ProtectedPages = new Set(["profile", "switch", "multiplayer", "createGame", "lobby"]);
const ErrorText = {
  USERNAME_LENGTH: "Username must be 3–20 characters.",
  USERNAME_CHARACTERS: "Username can use letters, numbers, and underscore only.",
  USERNAME_TAKEN: "That username is already taken.",
  PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",
  PASSWORD_TOO_LONG: "Password can be at most 20 characters.",
  PASSWORD_ASCII_ONLY: "Password can use standard keyboard characters only.",
  PASSWORDS_DO_NOT_MATCH: "The two passwords do not match.",
  INVALID_LOGIN: "Username or password is incorrect.",
  MISSING_CREDENTIALS: "Enter both username and password.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Wait a minute and try again.",
  SERVER_TIMEOUT: "The server took too long to respond.",
  SERVER_UNREACHABLE: "Could not reach the multiplayer server.",
  SOCKET_OFFLINE: "The realtime server is not connected yet.",
  ROOM_NOT_FOUND: "That game code does not exist.",
  ROOM_FULL: "That game is full.",
  ROOM_CODE_REQUIRED: "Enter a game code.",
  LATE_JOIN_DISABLED: "That game already started and late join is disabled.",
  NO_PUBLIC_SERVERS: "There are no random-join servers available right now.",
  NEED_MORE_PLAYERS: "At least 2 connected players are required to start.",
  HOST_ONLY: "Only the lobby host can do that.",
  MAX_BELOW_PLAYER_COUNT: "The player limit cannot be below the number already connected.",
  SAVED_SESSION_EXPIRED: "That saved account needs to be refreshed.",
  AUTH_REQUIRED: "Log in first."
};

function Escape(Value) {
  return String(Value ?? "").replace(/[&<>'"]/g, Character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[Character]);
}

function ProfileIcon() {
  return `<span class="NetAvatarR93" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 11.1a3.35 3.35 0 1 0 0-6.7 3.35 3.35 0 0 0 0 6.7Zm0 2.15c-4.2 0-7 2.15-7 5.35 0 .62.5 1.12 1.12 1.12h11.76c.62 0 1.12-.5 1.12-1.12 0-3.2-2.8-5.35-7-5.35Z"/></svg></span>`;
}

function FriendlyError(Result) {
  return ErrorText[Result?.error] || String(Result?.error || "Something went wrong.").replaceAll("_", " ");
}

function NormalizeCode(Value) {
  return String(Value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function State() {
  return Multiplayer.GetState();
}

function SetBusy(Value) {
  Busy = Boolean(Value);
  Content.querySelectorAll("button,input,select").forEach(Element => Element.disabled = Busy);
  UpdateServerAvailability();
}

function StatusLabel(Current) {
  if (Current.status === "waking") return "WAKING SERVER…";
  if (Current.status === "connecting") return "CONNECTING…";
  if (Current.status === "reconnecting") return "CONNECTION LOST — RECONNECTING…";
  if (Current.status === "authenticating") return "CHECKING ACCOUNT…";
  return Current.connected ? "NETWORK ONLINE" : "OFFLINE";
}

function UpdateStatus() {
  const Current = State();
  StatusText.textContent = StatusLabel(Current);
  StatusLine.classList.toggle("On", Boolean(Current.connected));
  StatusLine.classList.toggle("Wait", !Current.connected && ["waking", "connecting", "reconnecting", "authenticating"].includes(Current.status));
  const Hud = document.getElementById("Hud");
  const ShowHud = Boolean(Hud && !Hud.classList.contains("Hidden") && Current.room?.started);
  NetworkHud.classList.toggle("Show", ShowHud);
  NetworkHud.querySelector("[data-hud]").textContent = Current.room ? `${Current.room.playerCount}/${Current.room.maxPlayers} • ${Current.room.code}` : "";
}

function Open(Target) {
  const Current = State();
  Page = Target || (Current.account ? "profile" : "login");
  if (!Current.account && ProtectedPages.has(Page)) {
    Page = "login";
    Message = "Log in before using multiplayer.";
  }
  if (Page === "multiplayer" && Current.room) Page = "lobby";
  Overlay.classList.add("Open");
  Overlay.setAttribute("aria-hidden", "false");
  if (document.pointerLockElement) document.exitPointerLock?.();
  Render();
  if (Page === "multiplayer") RefreshServers();
}

function Close() {
  Overlay.classList.remove("Open");
  Overlay.setAttribute("aria-hidden", "true");
}

function GoBack() {
  const Current = State();
  if (Page === "login" || Page === "profile") return Close();
  if (Page === "create") Page = "login";
  else if (Page === "switch") Page = "profile";
  else if (Page === "createGame") Page = "multiplayer";
  else if (Page === "lobby") Page = Current.room ? "multiplayer" : "multiplayer";
  else Page = Current.account ? "profile" : "login";
  Message = "";
  Render();
  if (Page === "multiplayer") RefreshServers();
}

Overlay.querySelector("[data-close]").addEventListener("click", Close);
BackButton.addEventListener("click", GoBack);
Overlay.addEventListener("mousedown", Event => {
  if (Event.target === Overlay) Close();
});

function TitleForPage() {
  return ({
    login: "LOG IN",
    create: "CREATE ACCOUNT",
    profile: "ACCOUNT SETTINGS",
    switch: "SWITCH ACCOUNT",
    multiplayer: "MULTIPLAYER",
    createGame: "CREATE GAME",
    lobby: "MULTIPLAYER LOBBY"
  })[Page] || "NETWORK";
}

function LoginMarkup() {
  return `
    <form class="NetCardR93" data-login-form>
      <h3>Log In</h3><p>Use an Infinity Store account. Your saved session is checked with the server automatically.</p>
      <div class="NetFieldR93"><label>Username</label><input name="username" minlength="3" maxlength="20" autocomplete="username" required></div>
      <div class="NetFieldR93"><label>Password</label><input name="password" type="password" minlength="8" maxlength="20" autocomplete="current-password" required></div>
      <button class="NetButtonR93 Primary" type="submit">LOG IN</button>
      <div class="NetMessageR93">${Escape(Message)}</div>
    </form>
    <div class="NetCardR93"><h3>Need an account?</h3><button class="NetButtonR93" type="button" data-create-page>CREATE ACCOUNT</button></div>`;
}

function CreateMarkup() {
  return `
    <form class="NetCardR93" data-create-form>
      <h3>Create Account</h3><p>Username: 3–20 letters, numbers, or underscores. Password: 8–20 standard keyboard characters. Retype it to confirm.</p>
      <div class="NetFieldR93"><label>Username</label><input name="username" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" required></div>
      <div class="NetFieldR93"><label>Password</label><input name="password" type="password" minlength="8" maxlength="20" autocomplete="new-password" required></div>
      <div class="NetFieldR93"><label>Retype Password</label><input name="confirm" type="password" minlength="8" maxlength="20" autocomplete="new-password" required></div>
      <button class="NetButtonR93 Primary" type="submit">CREATE ACCOUNT</button>
      <div class="NetMessageR93">${Escape(Message)}</div>
    </form>`;
}

function ProfileMarkup(Current) {
  const Account = Current.account;
  if (!Account) return LoginMarkup();
  const Profile = Current.profile || {};
  return `
    <div class="NetProfileHeroR93">${ProfileIcon()}<div class="NetInfoR93"><strong>${Escape(Account.username)}</strong><small>Infinity Store profile</small></div></div>
    <div class="NetStatsR93">
      <div class="NetStatR93"><strong>${Number(Profile.games_played || 0)}</strong><span>GAMES</span></div>
      <div class="NetStatR93"><strong>${Number(Profile.tasks_completed || 0)}</strong><span>TASKS</span></div>
      <div class="NetStatR93"><strong>${Number(Profile.best_aisle || 0)}</strong><span>BEST AISLE</span></div>
    </div>
    <div class="NetCardR93"><h3>Account Settings</h3><p>Your password is never stored locally. Saved accounts keep only their server session.</p><div class="NetActionsR93"><button class="NetButtonR93" type="button" data-switch-page>SWITCH ACCOUNT</button><button class="NetButtonR93 Danger" type="button" data-logout>LOG OUT</button></div><div class="NetMessageR93">${Escape(Message)}</div></div>
    <button class="NetButtonR93 Primary" type="button" data-open-multiplayer>MULTIPLAYER</button>`;
}

function SwitchMarkup(Current) {
  const Accounts = Current.savedAccounts || [];
  const Rows = Accounts.map(Account => `
    <div class="NetSavedR93">${ProfileIcon()}<div class="NetInfoR93"><strong>${Escape(Account.username)}</strong><small>${Account.userId === Current.account?.id ? "Current account" : "Saved on this device"}</small></div>${Account.userId === Current.account?.id ? `<b class="NetHostR93">ACTIVE</b>` : `<button class="NetButtonR93" type="button" data-switch-account="${Escape(Account.userId)}">SWITCH</button>`}</div>`).join("");
  return `
    <div class="NetCardR93"><h3>Saved Accounts</h3><p>Switching checks the saved session with Render before it becomes active.</p>${Rows || `<div class="NetEmptyR93">No saved accounts on this device.</div>`}<div class="NetMessageR93">${Escape(Message)}</div></div>
    <button class="NetButtonR93" type="button" data-login-another>LOG IN TO ANOTHER ACCOUNT</button>`;
}

function MultiplayerMarkup() {
  const Availability = AvailableServers === null ? "CHECKING…" : `${AvailableServers} AVAILABLE`;
  return `
    <div class="NetGridR93">
      <div class="NetCardR93"><h3>Random Available Server</h3><p>Join an existing lobby or a started game that allows late random joining. This does not create a server.</p><button class="NetButtonR93 Primary" type="button" data-random><span data-server-count>${Availability}</span></button></div>
      <form class="NetCardR93" data-join-form><h3>Join With Game Code</h3><p>Game codes use uppercase letters and numbers only.</p><div class="NetFieldR93"><label>Game Code</label><input name="code" data-code-input inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="8" pattern="[A-Z0-9]+" placeholder="ABC123" required></div><button class="NetButtonR93" type="submit">JOIN GAME</button></form>
    </div>
    <div class="NetCardR93"><h3>Create Game</h3><p>Create a 2–6 player lobby and choose whether late/random joining is allowed.</p><button class="NetButtonR93" type="button" data-create-game>CREATE GAME</button><div class="NetMessageR93">${Escape(Message)}</div></div>`;
}

function CreateGameMarkup() {
  return `
    <form class="NetCardR93" data-create-game-form>
      <h3>Game Settings</h3><p>The host cannot start until at least one other player is connected. Maximum room size is 6.</p>
      <div class="NetFieldR93"><label>Maximum Players</label><select name="maxPlayers">${[2,3,4,5,6].map(NumberValue => `<option value="${NumberValue}" ${NumberValue === 4 ? "selected" : ""}>${NumberValue} PLAYERS</option>`).join("")}</select></div>
      <label class="NetToggleRowR93"><span><strong>Allow Late Join</strong><small>Players may enter after START GAME.</small></span><input class="NetToggleR93" type="checkbox" name="late" checked></label>
      <label class="NetToggleRowR93"><span><strong>Allow Random Join</strong><small>Lets Random Available Server find this game.</small></span><input class="NetToggleR93" type="checkbox" name="public" checked></label>
      <button class="NetButtonR93 Primary" type="submit">CREATE LOBBY</button><div class="NetMessageR93">${Escape(Message)}</div>
    </form>`;
}

function LobbyMarkup(Current) {
  const Room = Current.room;
  if (!Room) return `<div class="NetCardR93"><h3>Lobby Ended</h3><button class="NetButtonR93" type="button" data-back-multiplayer>BACK TO MULTIPLAYER</button></div>`;
  const Host = Current.account?.id === Room.hostUserId;
  const Players = LobbyPlayers.length ? LobbyPlayers : [{ userId: Current.account?.id, name: Current.account?.username || "PLAYER" }];
  const PlayerRows = Players.map(Player => `<div class="NetPlayerR93">${ProfileIcon()}<div class="NetInfoR93"><strong>${Escape(Player.name || "PLAYER")}</strong><small>${Player.userId === Current.account?.id ? "YOU" : "CONNECTED PLAYER"}</small></div>${Player.userId === Room.hostUserId ? `<b class="NetHostR93">HOST</b>` : ""}</div>`).join("");
  const Ready = Number(Room.playerCount || 0) >= 2;
  const Settings = Host && !Room.started ? `
    <form class="NetCardR93" data-lobby-settings>
      <h3>Lobby Settings</h3>
      <div class="NetFieldR93"><label>Maximum Players</label><select name="maxPlayers">${[2,3,4,5,6].map(NumberValue => `<option value="${NumberValue}" ${NumberValue === Number(Room.maxPlayers) ? "selected" : ""}>${NumberValue} PLAYERS</option>`).join("")}</select></div>
      <label class="NetToggleRowR93"><span><strong>Allow Late Join</strong><small>Players can enter after the game begins.</small></span><input class="NetToggleR93" type="checkbox" name="late" ${Room.allowLateJoin ? "checked" : ""}></label>
      <label class="NetToggleRowR93"><span><strong>Allow Random Join</strong><small>Allow random server browser joining.</small></span><input class="NetToggleR93" type="checkbox" name="public" ${Room.public ? "checked" : ""}></label>
      <button class="NetButtonR93" type="submit">SAVE SETTINGS</button>
    </form>` : "";
  return `
    <div class="NetCardR93"><h3>${Room.started ? "Game In Progress" : "Waiting Lobby"}</h3><p>Share this game code with another player.</p><div class="NetCodeR93">${Escape(NormalizeCode(Room.code))}</div><div class="NetMetaR93"><span>${Room.playerCount}/${Room.maxPlayers} PLAYERS</span><span>${Room.allowLateJoin ? "LATE JOIN ON" : "LATE JOIN OFF"}</span><span>${Room.public ? "RANDOM JOIN ON" : "CODE ONLY"}</span></div><button class="NetButtonR93" type="button" data-copy-code>COPY GAME CODE</button></div>
    <div class="NetCardR93"><h3>Players</h3>${PlayerRows}<div class="NetWaitR93 ${Ready ? "Ready" : ""}">${Room.started ? "GAME STARTED." : Ready ? "ENOUGH PLAYERS CONNECTED. THE HOST CAN START." : "WAITING FOR ANOTHER PLAYER. MULTIPLAYER CANNOT START WITH ONLY YOU."}</div>${Host && !Room.started ? `<button class="NetButtonR93 Primary" type="button" data-start-game ${Ready ? "" : "disabled"}>START GAME</button>` : !Room.started ? `<button class="NetButtonR93" type="button" disabled>WAITING FOR HOST</button>` : ""}<div class="NetMessageR93">${Escape(Message)}</div></div>
    ${Settings}
    <button class="NetButtonR93 Danger" type="button" data-leave-lobby>LEAVE LOBBY</button>`;
}

function Render() {
  const Current = State();
  if (!Current.account && ProtectedPages.has(Page)) {
    Page = "login";
    if (!Message) Message = "Your account session is not active. Refresh or log in again.";
  }
  if (Page === "multiplayer" && Current.room) Page = "lobby";
  Title.textContent = TitleForPage();
  BackButton.style.visibility = Page === "login" || Page === "profile" ? "hidden" : "visible";
  Content.innerHTML = Page === "login" ? LoginMarkup() : Page === "create" ? CreateMarkup() : Page === "profile" ? ProfileMarkup(Current) : Page === "switch" ? SwitchMarkup(Current) : Page === "multiplayer" ? MultiplayerMarkup() : Page === "createGame" ? CreateGameMarkup() : LobbyMarkup(Current);
  BindPage();
  if (Busy) Content.querySelectorAll("button,input,select").forEach(Element => Element.disabled = true);
  UpdateStatus();
  UpdateServerAvailability();
  EnsureMainControls();
  SyncStartButton();
  BindLobbySocket();
}

function BindPage() {
  Content.querySelector("[data-create-page]")?.addEventListener("click", () => { Page = "create"; Message = ""; Render(); });
  Content.querySelector("[data-login-form]")?.addEventListener("submit", async Event => {
    Event.preventDefault();
    const Data = new FormData(Event.currentTarget);
    SetBusy(true); Message = "Logging in…";
    const Result = await Multiplayer.Login(Data.get("username"), Data.get("password"));
    SetBusy(false);
    if (Result?.ok) { Page = "profile"; Message = "Logged in."; }
    else Message = FriendlyError(Result);
    Render();
  });
  Content.querySelector("[data-create-form]")?.addEventListener("submit", async Event => {
    Event.preventDefault();
    const Data = new FormData(Event.currentTarget);
    const Password = String(Data.get("password") || "");
    const Confirm = String(Data.get("confirm") || "");
    if (Password !== Confirm) { Message = ErrorText.PASSWORDS_DO_NOT_MATCH; return Render(); }
    SetBusy(true); Message = "Creating account…";
    const Result = await Multiplayer.Register(Data.get("username"), Password, Confirm);
    SetBusy(false);
    if (Result?.ok) { Page = "profile"; Message = "Account created."; }
    else Message = FriendlyError(Result);
    Render();
  });
  Content.querySelector("[data-switch-page]")?.addEventListener("click", () => { Page = "switch"; Message = ""; Render(); });
  Content.querySelector("[data-logout]")?.addEventListener("click", async () => {
    SetBusy(true);
    await Multiplayer.Logout();
    SetBusy(false);
    Page = "login";
    Message = "Logged out.";
    Render();
  });
  Content.querySelectorAll("[data-switch-account]").forEach(Button => Button.addEventListener("click", async () => {
    SetBusy(true); Message = "Checking saved account with server…";
    const Result = await Multiplayer.SwitchAccount(Button.dataset.switchAccount);
    SetBusy(false);
    if (Result?.ok) { Page = "profile"; Message = `Switched to ${Result.account.username}.`; }
    else Message = FriendlyError(Result);
    Render();
  }));
  Content.querySelector("[data-login-another]")?.addEventListener("click", () => { Page = "login"; Message = "Log in to add another saved account."; Render(); });
  Content.querySelector("[data-open-multiplayer]")?.addEventListener("click", () => { Page = State().room ? "lobby" : "multiplayer"; Message = ""; Render(); if (Page === "multiplayer") RefreshServers(); });
  const CodeInput = Content.querySelector("[data-code-input]");
  if (CodeInput) {
    CodeInput.addEventListener("input", () => {
      const Normalized = NormalizeCode(CodeInput.value);
      if (CodeInput.value !== Normalized) CodeInput.value = Normalized;
    });
    CodeInput.addEventListener("paste", () => queueMicrotask(() => { CodeInput.value = NormalizeCode(CodeInput.value); }));
  }
  Content.querySelector("[data-random]")?.addEventListener("click", async () => {
    SetBusy(true); Message = "Joining available server…";
    const Result = await Multiplayer.QuickJoin();
    SetBusy(false);
    if (Result?.ok) {
      LobbyPlayers = [Result.player, ...(Result.players || [])].filter(Boolean);
      Page = "lobby";
      Message = Result.room.started ? "Joining game in progress…" : "Joined lobby.";
      Render();
    } else {
      Message = FriendlyError(Result);
      const MessageElement = Content.querySelector(".NetMessageR93");
      if (MessageElement) MessageElement.textContent = Message;
      RefreshServers();
    }
  });
  Content.querySelector("[data-join-form]")?.addEventListener("submit", async Event => {
    Event.preventDefault();
    const Input = Event.currentTarget.querySelector("[data-code-input]");
    const Code = NormalizeCode(Input?.value);
    if (Input) Input.value = Code;
    if (!Code) { Message = ErrorText.ROOM_CODE_REQUIRED; return; }
    SetBusy(true); Message = "Joining game…";
    const Result = await Multiplayer.JoinRoom(Code);
    SetBusy(false);
    if (Result?.ok) {
      LobbyPlayers = [Result.player, ...(Result.players || [])].filter(Boolean);
      Page = "lobby";
      Message = Result.room.started ? "Joining game in progress…" : "Joined lobby.";
      Render();
    } else {
      Message = FriendlyError(Result);
      let MessageElement = Event.currentTarget.querySelector(".NetMessageR93");
      if (!MessageElement) {
        MessageElement = document.createElement("div");
        MessageElement.className = "NetMessageR93";
        Event.currentTarget.appendChild(MessageElement);
      }
      MessageElement.textContent = Message;
    }
  });
  Content.querySelector("[data-create-game]")?.addEventListener("click", () => { Page = "createGame"; Message = ""; Render(); });
  Content.querySelector("[data-create-game-form]")?.addEventListener("submit", async Event => {
    Event.preventDefault();
    const Data = new FormData(Event.currentTarget);
    SetBusy(true); Message = "Creating lobby…";
    const Result = await Multiplayer.CreateRoom({ maxPlayers: Data.get("maxPlayers"), allowLateJoin: Data.get("late") === "on", public: Data.get("public") === "on" });
    SetBusy(false);
    if (Result?.ok) {
      LobbyPlayers = [Result.player, ...(Result.players || [])].filter(Boolean);
      Page = "lobby";
      Message = "Lobby created. Waiting for another player.";
    } else Message = FriendlyError(Result);
    Render();
  });
  Content.querySelector("[data-lobby-settings]")?.addEventListener("submit", async Event => {
    Event.preventDefault();
    const Data = new FormData(Event.currentTarget);
    SetBusy(true); Message = "Saving settings…";
    const Result = await Multiplayer.UpdateRoomSettings({ maxPlayers: Data.get("maxPlayers"), allowLateJoin: Data.get("late") === "on", public: Data.get("public") === "on" });
    SetBusy(false);
    Message = Result?.ok ? "Lobby settings saved." : FriendlyError(Result);
    Render();
  });
  Content.querySelector("[data-start-game]")?.addEventListener("click", async () => {
    SetBusy(true); Message = "Starting multiplayer…";
    const Result = await Multiplayer.StartRoom();
    SetBusy(false);
    Message = Result?.ok ? "Starting…" : FriendlyError(Result);
    if (!Result?.ok) Render();
  });
  Content.querySelector("[data-copy-code]")?.addEventListener("click", async () => {
    const Code = NormalizeCode(State().room?.code);
    try { await navigator.clipboard.writeText(Code); Message = "Game code copied."; }
    catch { Message = `Game code: ${Code}`; }
    const MessageElement = Content.querySelector(".NetMessageR93");
    if (MessageElement) MessageElement.textContent = Message;
  });
  Content.querySelector("[data-leave-lobby]")?.addEventListener("click", async () => {
    SetBusy(true);
    await Multiplayer.LeaveRoom();
    SetBusy(false);
    LobbyPlayers = [];
    LobbySignature = "";
    Page = "multiplayer";
    Message = "Left lobby.";
    Render();
    RefreshServers();
  });
  Content.querySelector("[data-back-multiplayer]")?.addEventListener("click", () => { Page = "multiplayer"; Message = ""; Render(); RefreshServers(); });
}

function UpdateServerAvailability() {
  const CountElement = Content.querySelector("[data-server-count]");
  const RandomButton = Content.querySelector("[data-random]");
  if (CountElement) CountElement.textContent = AvailableServers === null ? "CHECKING…" : `${AvailableServers} AVAILABLE`;
  if (RandomButton) RandomButton.disabled = Busy || AvailableServers === 0 || ServerRefreshBusy;
}

async function RefreshServers() {
  if (ServerRefreshBusy || !State().account) return;
  ServerRefreshBusy = true;
  UpdateServerAvailability();
  const Result = await Multiplayer.ListPublicRooms();
  AvailableServers = Result?.ok ? Number(Result.count || 0) : 0;
  ServerRefreshBusy = false;
  UpdateServerAvailability();
}

function LobbyStateSignature() {
  const Current = State();
  const Room = Current.room;
  if (!Room) return "none";
  const Players = LobbyPlayers.map(Player => `${Player.id || ""}:${Player.userId || ""}:${Player.name || ""}`).sort().join("|");
  return `${Room.code}|${Room.playerCount}|${Room.maxPlayers}|${Room.started}|${Room.allowLateJoin}|${Room.public}|${Room.hostUserId}|${Players}`;
}

function MaybeRenderLobby() {
  if (Page !== "lobby" || !Overlay.classList.contains("Open")) return;
  const Signature = LobbyStateSignature();
  if (Signature === LobbySignature) return;
  LobbySignature = Signature;
  Render();
}

function BindLobbySocket() {
  const Socket = Multiplayer.GetSocket?.();
  if (Socket === BoundSocket) return;
  if (BoundSocket) {
    BoundSocket.off?.("room:sync", OnRoomSync);
    BoundSocket.off?.("player:joined", OnPlayerJoined);
    BoundSocket.off?.("player:left", OnPlayerLeft);
  }
  BoundSocket = Socket;
  if (!Socket) return;
  Socket.on("room:sync", OnRoomSync);
  Socket.on("player:joined", OnPlayerJoined);
  Socket.on("player:left", OnPlayerLeft);
}

function OnRoomSync(Payload) {
  if (Array.isArray(Payload?.players)) LobbyPlayers = Payload.players;
  MaybeRenderLobby();
}

function OnPlayerJoined(Player) {
  if (Player?.id) LobbyPlayers = [...LobbyPlayers.filter(Item => Item.id !== Player.id), Player];
  MaybeRenderLobby();
}

function OnPlayerLeft(Player) {
  LobbyPlayers = LobbyPlayers.filter(Item => Item.id !== Player?.id);
  MaybeRenderLobby();
}

function EnsureMainControls() {
  const Current = State();
  const Signature = `${Current.account?.id || "guest"}|${Current.account?.username || ""}|${Current.room?.code || ""}|${Current.room?.started || false}`;
  let Wrap = document.getElementById("MainNetworkControlsR93");
  if (!Wrap && StartButton?.parentElement) {
    Wrap = document.createElement("div");
    Wrap.id = "MainNetworkControlsR93";
    Wrap.className = "NetMainWrapR93";
    StartButton.insertAdjacentElement("afterend", Wrap);
  }
  if (Wrap && Signature !== MainSignature) {
    MainSignature = Signature;
    if (Current.account) {
      Wrap.innerHTML = `<button class="MainProfileR93" type="button" data-main-profile>${ProfileIcon()}<span class="NetInfoR93"><strong>${Escape(Current.account.username)}</strong><small>PROFILE & ACCOUNT SETTINGS</small></span><b>›</b></button><button class="MainNetR93 Wide Primary" type="button" data-main-multiplayer>MULTIPLAYER</button>`;
    } else {
      Wrap.innerHTML = `<button class="MainNetR93" type="button" data-main-login>LOG IN</button><button class="MainNetR93" type="button" data-main-create>CREATE ACCOUNT</button><button class="MainNetR93 Wide Primary" type="button" data-main-multiplayer>MULTIPLAYER</button>`;
    }
    Wrap.querySelector("[data-main-profile]")?.addEventListener("click", () => Open("profile"));
    Wrap.querySelector("[data-main-login]")?.addEventListener("click", () => Open("login"));
    Wrap.querySelector("[data-main-create]")?.addEventListener("click", () => Open("create"));
    Wrap.querySelector("[data-main-multiplayer]")?.addEventListener("click", () => {
      const Latest = State();
      if (!Latest.account) { Message = "Log in before joining multiplayer."; Open("login"); }
      else Open(Latest.room ? "lobby" : "multiplayer");
    });
  }

  const RuntimeActions = document.querySelector("#RuntimeMainMenuR83 .RuntimeMenuActionsR84");
  if (RuntimeActions) {
    let ProfileButton = RuntimeActions.querySelector("[data-runtime-profile-r93]");
    if (!ProfileButton) {
      ProfileButton = document.createElement("button");
      ProfileButton.type = "button";
      ProfileButton.className = "RuntimeNetR93";
      ProfileButton.dataset.runtimeProfileR93 = "1";
      RuntimeActions.appendChild(ProfileButton);
    }
    ProfileButton.textContent = Current.account ? `PROFILE • ${Current.account.username}` : "LOG IN / CREATE ACCOUNT";
    ProfileButton.onclick = () => Open(Current.account ? "profile" : "login");

    let MultiplayerButton = RuntimeActions.querySelector("[data-runtime-multiplayer-r93]");
    if (!MultiplayerButton) {
      MultiplayerButton = document.createElement("button");
      MultiplayerButton.type = "button";
      MultiplayerButton.className = "RuntimeNetR93";
      MultiplayerButton.dataset.runtimeMultiplayerR93 = "1";
      RuntimeActions.appendChild(MultiplayerButton);
    }
    MultiplayerButton.textContent = "MULTIPLAYER";
    MultiplayerButton.onclick = () => {
      const Latest = State();
      if (!Latest.account) { Message = "Log in before joining multiplayer."; Open("login"); }
      else Open(Latest.room ? "lobby" : "multiplayer");
    };
  }
}

function SyncStartButton() {
  if (!StartButton) return;
  const Room = State().room;
  if (Room && !Room.started) {
    StartButton.dataset.NetworkR93 = "1";
    StartButton.disabled = true;
    StartButton.textContent = Number(Room.playerCount || 0) >= 2 ? "START FROM MULTIPLAYER LOBBY" : "WAITING FOR ANOTHER PLAYER";
  } else if (StartButton.dataset.NetworkR93) {
    delete StartButton.dataset.NetworkR93;
    StartButton.textContent = "ENTER THE STORE";
    if (window.__STORE_BOOTSTRAP_BUILD__) StartButton.disabled = false;
  }
}

async function EnterMultiplayer() {
  if (StartTransitioning) return;
  StartTransitioning = true;
  Close();
  for (let Attempt = 0; Attempt < 80; Attempt += 1) {
    SyncStartButton();
    if (!BootScreen?.classList.contains("ScreenVisible")) break;
    if (StartButton && !StartButton.disabled) {
      StartButton.click();
      break;
    }
    await new Promise(Resolve => setTimeout(Resolve, 75));
  }
  StartTransitioning = false;
}

addEventListener("store-network-change", () => { UpdateStatus(); EnsureMainControls(); BindLobbySocket(); });
addEventListener("store-account-change", () => {
  MainSignature = "";
  const Current = State();
  if (!Current.account && ProtectedPages.has(Page)) {
    Page = "login";
    Message = "Account state changed. Refresh if this happened after being AFK.";
  }
  if (Overlay.classList.contains("Open")) Render();
  else EnsureMainControls();
});
addEventListener("store-room-change", () => {
  MainSignature = "";
  EnsureMainControls();
  SyncStartButton();
  MaybeRenderLobby();
});
addEventListener("store-multiplayer-start", EnterMultiplayer);
addEventListener("keydown", Event => {
  if (Event.code === "Escape" && Overlay.classList.contains("Open")) {
    Event.preventDefault();
    Event.stopImmediatePropagation();
    Close();
  }
}, true);

setInterval(() => {
  EnsureMainControls();
  SyncStartButton();
  BindLobbySocket();
  if (Page === "multiplayer" && Overlay.classList.contains("Open")) RefreshServers();
}, 5000);

UpdateStatus();
EnsureMainControls();
BindLobbySocket();

window.__STORE_MULTIPLAYER_UI_R93__ = { Open, Close, Render, NormalizeCode, RefreshServers };
window.__STORE_MULTIPLAYER_UI_BUILD__ = "V0.28.0-R93";
