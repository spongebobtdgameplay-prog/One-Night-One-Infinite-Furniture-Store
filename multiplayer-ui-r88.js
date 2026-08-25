const Multiplayer = window.__STORE_MULTIPLAYER_R88__;
if (!Multiplayer) throw new Error("Multiplayer client must load before multiplayer UI.");

const Style = document.createElement("style");
Style.id = "MultiplayerUiStyleR90";
Style.textContent = `
#MainAccountActionsR90{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;margin-top:10px}
.MainNetButtonR90{min-height:46px;border:1px solid rgba(238,228,207,.38);background:rgba(31,35,32,.84);color:#eee4cf;padding:0 14px;font:850 .64rem Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;transition:transform .15s ease,background .15s ease,border-color .15s ease}.MainNetButtonR90:hover{transform:translateY(-1px);background:rgba(54,60,55,.96);border-color:rgba(242,233,214,.76)}.MainNetButtonR90.Primary{background:#e9dfca;color:#171a17;border-color:#e9dfca}.MainNetButtonR90.Wide{grid-column:1/-1}.MainNetButtonR90:disabled{opacity:.42;cursor:default;transform:none}
.ProfileBadgeR90{grid-column:1/-1;display:flex;align-items:center;gap:12px;min-height:54px;padding:7px 12px;border:1px solid rgba(238,228,207,.30);background:rgba(17,20,18,.84);color:#f1e8d6;cursor:pointer;text-align:left}.ProfileBadgeR90:hover{border-color:rgba(238,228,207,.68);background:rgba(35,40,36,.94)}.ProfileIconR90{width:34px;height:34px;display:grid;place-items:center;border:1px solid rgba(238,228,207,.32);border-radius:50%;background:rgba(238,228,207,.08);flex:0 0 auto}.ProfileIconR90 svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8}.ProfileBadgeR90 strong{display:block;font:900 .72rem Arial,sans-serif;letter-spacing:.08em}.ProfileBadgeR90 small{display:block;margin-top:3px;color:rgba(241,232,214,.48);font:800 .52rem Arial,sans-serif;letter-spacing:.11em;text-transform:uppercase}.ProfileBadgeR90 .Arrow{margin-left:auto;color:rgba(241,232,214,.42);font-size:1rem}
#MultiplayerOverlayR90{position:fixed;inset:0;z-index:1450;display:grid;place-items:center;padding:22px;background:rgba(4,6,5,.91);backdrop-filter:blur(11px);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .18s ease}#MultiplayerOverlayR90.Open{opacity:1;visibility:visible;pointer-events:auto}
.NetPanelR90{width:min(760px,calc(100vw - 30px));max-height:calc(100dvh - 34px);overflow:auto;border:1px solid rgba(235,226,207,.58);background:linear-gradient(180deg,#202420 0%,#141714 100%);box-shadow:0 30px 100px rgba(0,0,0,.68);color:#f2ead9}.NetHeadR90{display:flex;align-items:center;gap:13px;padding:18px 20px;border-bottom:1px solid rgba(239,229,207,.16);position:sticky;top:0;z-index:4;background:rgba(29,33,30,.97);backdrop-filter:blur(10px)}.NetBackR90,.NetCloseR90{width:40px;height:40px;border:1px solid rgba(240,231,212,.27);background:rgba(255,255,255,.025);color:#f2ead9;cursor:pointer;font-size:1.1rem}.NetBackR90:hover,.NetCloseR90:hover{background:#eee4cf;color:#161916}.NetHeadTitleR90{min-width:0;flex:1}.NetHeadTitleR90 small{display:block;color:rgba(242,234,217,.45);font:800 .53rem Arial,sans-serif;letter-spacing:.17em;text-transform:uppercase}.NetHeadTitleR90 h2{margin:4px 0 0;font:900 1rem Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase}.NetBodyR90{padding:20px}.NetStatusR90{display:flex;align-items:center;gap:8px;margin-bottom:15px;color:rgba(242,234,217,.58);font:800 .58rem Arial,sans-serif;letter-spacing:.09em;text-transform:uppercase}.NetDotR90{width:7px;height:7px;border-radius:50%;background:#7b817b}.NetDotR90.On{background:#82c188}.NetDotR90.Wait{background:#d2a86d}
.NetCardR90{border:1px solid rgba(239,229,207,.15);background:rgba(255,255,255,.025);padding:17px;margin-bottom:11px}.NetCardR90 h3{margin:0 0 7px;font:900 .73rem Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase}.NetCardR90 p{margin:0 0 13px;color:rgba(242,234,217,.52);font:600 .69rem/1.5 Arial,sans-serif}.NetCardR90:last-child{margin-bottom:0}.NetGridR90{display:grid;grid-template-columns:1fr 1fr;gap:10px}.NetActionsR90{display:grid;grid-template-columns:1fr 1fr;gap:8px}.NetButtonR90{min-height:44px;width:100%;border:1px solid rgba(239,229,207,.32);background:#313731;color:#f2ead9;padding:0 13px;font:850 .61rem Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}.NetButtonR90:hover{background:#eee4cf;color:#151815}.NetButtonR90.Primary{background:#e9dfca;color:#171a17;border-color:#e9dfca}.NetButtonR90.Danger{background:rgba(113,48,42,.23);border-color:rgba(194,111,99,.35)}.NetButtonR90:disabled{opacity:.4;cursor:default}.NetFieldR90{display:grid;gap:6px;margin:10px 0}.NetFieldR90 label{color:rgba(242,234,217,.56);font:850 .55rem Arial,sans-serif;letter-spacing:.11em;text-transform:uppercase}.NetFieldR90 input,.NetFieldR90 select{box-sizing:border-box;width:100%;height:44px;border:1px solid rgba(239,229,207,.23);background:#0f120f;color:#f5ecda;padding:0 12px;outline:none;font:750 .76rem Arial,sans-serif}.NetFieldR90 input:focus,.NetFieldR90 select:focus{border-color:rgba(239,229,207,.68)}.NetMessageR90{min-height:18px;margin-top:10px;color:#dcb47b;font:700 .65rem/1.4 Arial,sans-serif}
.NetProfileHeroR90{display:flex;align-items:center;gap:15px;padding:17px;border:1px solid rgba(239,229,207,.16);background:rgba(255,255,255,.025);margin-bottom:11px}.NetProfileHeroR90 .ProfileIconR90{width:48px;height:48px}.NetProfileHeroR90 strong{display:block;font:900 1rem Arial,sans-serif;letter-spacing:.08em}.NetProfileHeroR90 span{display:block;margin-top:4px;color:rgba(242,234,217,.48);font:800 .55rem Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase}.NetStatsR90{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:11px 0}.NetStatR90{padding:11px;border:1px solid rgba(239,229,207,.12);text-align:center}.NetStatR90 strong{display:block;font:900 .9rem Arial,sans-serif}.NetStatR90 span{display:block;margin-top:4px;color:rgba(242,234,217,.43);font:800 .51rem Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase}
.SavedAccountR90,.LobbyPlayerR90{display:flex;align-items:center;gap:11px;padding:11px;border:1px solid rgba(239,229,207,.13);background:rgba(255,255,255,.018);margin-top:7px}.SavedAccountR90 .Info,.LobbyPlayerR90 .Info{flex:1;min-width:0}.SavedAccountR90 strong,.LobbyPlayerR90 strong{display:block;font:900 .7rem Arial,sans-serif;letter-spacing:.06em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.SavedAccountR90 span,.LobbyPlayerR90 span{display:block;margin-top:3px;color:rgba(242,234,217,.43);font:750 .52rem Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase}.SavedAccountR90 button{width:auto;min-width:92px}.LobbyHostR90{padding:3px 6px;border:1px solid rgba(214,170,108,.38);color:#d8b37b;font:850 .48rem Arial,sans-serif;letter-spacing:.09em;text-transform:uppercase}
.ToggleRowR90{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:12px 0;border-top:1px solid rgba(239,229,207,.10)}.ToggleRowR90:first-of-type{border-top:0}.ToggleRowR90 strong{font:850 .62rem Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase}.ToggleRowR90 small{display:block;margin-top:4px;color:rgba(242,234,217,.42);font:600 .6rem/1.35 Arial,sans-serif}.ToggleR90{appearance:none;width:46px;height:25px;border:1px solid rgba(239,229,207,.34);background:#303630;position:relative;cursor:pointer;flex:0 0 auto}.ToggleR90:after{content:"";position:absolute;width:17px;height:17px;left:3px;top:3px;background:#8c938d;transition:transform .16s ease,background .16s ease}.ToggleR90:checked:after{transform:translateX(21px);background:#eee4cf}
.RoomCodeR90{font:900 1.6rem ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.15em;margin:5px 0 12px}.RoomMetaR90{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}.RoomMetaR90 span{padding:5px 7px;border:1px solid rgba(239,229,207,.13);color:rgba(242,234,217,.58);font:800 .51rem Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase}.LobbyWaitR90{padding:11px;border:1px solid rgba(211,168,107,.22);background:rgba(211,168,107,.055);color:#d8b37b;font:750 .63rem/1.4 Arial,sans-serif;margin:10px 0}.LobbyWaitR90.Ready{border-color:rgba(127,191,132,.25);background:rgba(127,191,132,.055);color:#9bc79e}
#NetworkHudR90{position:fixed;left:14px;bottom:56px;z-index:72;display:none;align-items:center;gap:8px;padding:7px 10px;border:1px solid rgba(238,228,207,.20);background:rgba(12,15,13,.74);backdrop-filter:blur(7px);color:rgba(242,234,217,.72);font:800 .55rem Arial,sans-serif;letter-spacing:.09em;text-transform:uppercase;pointer-events:none}#NetworkHudR90.Show{display:flex}#NetworkHudR90 .Dot{width:6px;height:6px;border-radius:50%;background:#8cc58f}
.MultiplayerMenuEntryR90{min-height:44px;border:1px solid rgba(255,255,255,.28);background:#303733;color:#fff;padding:0 15px;font-size:.65rem;font-weight:850;letter-spacing:.1em;cursor:pointer}.MultiplayerMenuEntryR90:hover{background:#fff;color:#202522}
@media(max-width:650px){#MainAccountActionsR90,.NetGridR90,.NetActionsR90{grid-template-columns:1fr}.MainNetButtonR90.Wide,.ProfileBadgeR90{grid-column:auto}.NetBodyR90{padding:15px}.NetStatsR90{grid-template-columns:1fr 1fr 1fr}}
`;
document.head.appendChild(Style);

const Overlay = document.createElement("section");
Overlay.id = "MultiplayerOverlayR90";
Overlay.setAttribute("aria-hidden", "true");
Overlay.innerHTML = `
  <div class="NetPanelR90" role="dialog" aria-modal="true" aria-label="The Infinity Store account and multiplayer">
    <div class="NetHeadR90">
      <button class="NetBackR90" type="button" aria-label="Back">←</button>
      <div class="NetHeadTitleR90"><small>The Infinity Store Network</small><h2 data-page-title>ACCOUNT</h2></div>
      <button class="NetCloseR90" type="button" aria-label="Close">×</button>
    </div>
    <div class="NetBodyR90">
      <div class="NetStatusR90"><span class="NetDotR90"></span><span data-network-status>Offline</span></div>
      <div data-network-content></div>
    </div>
  </div>`;
document.body.appendChild(Overlay);

const NetworkHud = document.createElement("div");
NetworkHud.id = "NetworkHudR90";
NetworkHud.innerHTML = `<span class="Dot"></span><span data-network-hud>Multiplayer</span>`;
document.body.appendChild(NetworkHud);

const Content = Overlay.querySelector("[data-network-content]");
const Title = Overlay.querySelector("[data-page-title]");
const BackButton = Overlay.querySelector(".NetBackR90");
const StatusText = Overlay.querySelector("[data-network-status]");
const StatusDot = Overlay.querySelector(".NetDotR90");
const StartButton = document.getElementById("StartButton");
const BootScreen = document.getElementById("BootScreen");
let Page = "login";
let Message = "";
let Busy = false;
let AvailableServers = null;
let LobbyPlayers = [];
let BoundSocket = null;
let MultiplayerStartInProgress = false;

const ErrorText = {
  USERNAME_LENGTH: "Username must be 3–20 characters.",
  USERNAME_CHARACTERS: "Username can use letters, numbers, and underscore only.",
  USERNAME_TAKEN: "That username is already taken.",
  PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",
  PASSWORD_TOO_LONG: "Password can be at most 20 characters.",
  PASSWORD_ASCII_ONLY: "Password can use standard keyboard (ASCII) characters only.",
  PASSWORDS_DO_NOT_MATCH: "The two passwords do not match.",
  INVALID_LOGIN: "Username or password is incorrect.",
  MISSING_CREDENTIALS: "Enter both username and password.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Wait a minute and try again.",
  SERVER_TIMEOUT: "The server took too long to respond. Render may still be waking up.",
  SERVER_UNREACHABLE: "Could not reach the multiplayer server.",
  SOCKET_OFFLINE: "The realtime server is not connected yet.",
  ROOM_NOT_FOUND: "That game code does not exist anymore.",
  ROOM_FULL: "That game is full.",
  ROOM_CODE_REQUIRED: "Enter a game code.",
  LATE_JOIN_DISABLED: "That game already started and late join is disabled.",
  NO_PUBLIC_SERVERS: "There are no random-join servers available right now.",
  NEED_MORE_PLAYERS: "You need at least 2 players before multiplayer can start.",
  HOST_ONLY: "Only the lobby host can do that.",
  GAME_ALREADY_STARTED: "That multiplayer game already started.",
  MAX_BELOW_PLAYER_COUNT: "The player limit cannot be lower than the number already in the lobby.",
  SAVED_SESSION_EXPIRED: "That saved account session expired. Log in to that account again.",
  SAVED_ACCOUNT_NOT_FOUND: "That saved account is no longer on this device.",
  AUTH_REQUIRED: "Log in first."
};

function Escape(Value) {
  return String(Value ?? "").replace(/[&<>'"]/g, Character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[Character]));
}

function ProfileIcon() {
  return `<span class="ProfileIconR90" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"></circle><path d="M5.5 20c.7-4.1 3-6.2 6.5-6.2s5.8 2.1 6.5 6.2"></path></svg></span>`;
}

function FriendlyError(Result) {
  return ErrorText[Result?.error] || String(Result?.error || "Something went wrong.").replaceAll("_", " ");
}

function SetMessage(Value) {
  Message = String(Value || "");
  const Element = Content.querySelector("[data-message]");
  if (Element) Element.textContent = Message;
}

function SetBusy(Value) {
  Busy = Boolean(Value);
  Content.querySelectorAll("button,input,select").forEach(Element => Element.disabled = Busy);
}

function StatusLabel(State) {
  if (State.status === "waking") return "Waking multiplayer server…";
  if (State.status === "connecting") return "Connecting realtime server…";
  if (State.status === "reconnecting") return "Connection lost — reconnecting…";
  if (State.status === "authenticating") return "Checking account with server…";
  if (State.connected) return "Network online";
  return "Offline";
}

function UpdateStatus(State) {
  StatusText.textContent = StatusLabel(State);
  StatusDot.className = `NetDotR90 ${State.connected ? "On" : ["waking", "connecting", "reconnecting", "authenticating"].includes(State.status) ? "Wait" : ""}`;
  const Hud = document.getElementById("Hud");
  const HudActive = Hud && !Hud.classList.contains("Hidden");
  NetworkHud.classList.toggle("Show", Boolean(HudActive && State.room?.started));
  const Text = NetworkHud.querySelector("[data-network-hud]");
  if (Text && State.room) Text.textContent = `${State.room.playerCount || 1}/${State.room.maxPlayers || 6} • ${State.room.code}`;
}

function Open(TargetPage) {
  const State = Multiplayer.GetState();
  Page = TargetPage || (State.account ? "profile" : "login");
  if (["profile", "switch", "multiplayer", "createGame", "lobby"].includes(Page) && !State.account) {
    Page = "login";
    Message = "Log in to use that feature.";
  }
  if (Page === "multiplayer" && State.room) Page = "lobby";
  Overlay.classList.add("Open");
  Overlay.setAttribute("aria-hidden", "false");
  if (document.pointerLockElement) document.exitPointerLock?.();
  Render();
  if (Page === "multiplayer") RefreshAvailability();
}

function Close() {
  Overlay.classList.remove("Open");
  Overlay.setAttribute("aria-hidden", "true");
}

function Back() {
  const State = Multiplayer.GetState();
  const Parent = {
    create: "login",
    profile: State.account ? "profile" : "login",
    switch: "profile",
    multiplayer: State.account ? "profile" : "login",
    createGame: "multiplayer",
    lobby: State.room ? "multiplayer" : "multiplayer"
  }[Page];
  if (Page === "login" || (Page === "profile" && State.account)) return Close();
  Page = Parent || (State.account ? "profile" : "login");
  Message = "";
  Render();
  if (Page === "multiplayer") RefreshAvailability();
}

Overlay.querySelector(".NetCloseR90").addEventListener("click", Close);
BackButton.addEventListener("click", Back);
Overlay.addEventListener("mousedown", Event => { if (Event.target === Overlay) Close(); });

function PageTitle() {
  return {
    login: "LOG IN",
    create: "CREATE ACCOUNT",
    profile: "ACCOUNT SETTINGS",
    switch: "SWITCH ACCOUNT",
    multiplayer: "MULTIPLAYER",
    createGame: "CREATE GAME",
    lobby: "MULTIPLAYER LOBBY"
  }[Page] || "NETWORK";
}

function LoginMarkup() {
  return `
    <form class="NetCardR90" data-login-form>
      <h3>Log In</h3><p>Log in to your Infinity Store account. Saved accounts on this device still have to be validated by the server when switched.</p>
      <div class="NetFieldR90"><label>Username</label><input name="username" autocomplete="username" minlength="3" maxlength="20" required></div>
      <div class="NetFieldR90"><label>Password</label><input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="20" required></div>
      <button class="NetButtonR90 Primary" type="submit">LOG IN</button>
      <div class="NetMessageR90" data-message>${Escape(Message)}</div>
    </form>
    <div class="NetCardR90"><h3>New account?</h3><p>Create an account on its own page instead of mixing registration into login.</p><button class="NetButtonR90" type="button" data-open-create>CREATE ACCOUNT</button></div>`;
}

function CreateMarkup() {
  return `
    <form class="NetCardR90" data-create-form>
      <h3>Create Account</h3><p>Usernames are 3–20 letters, numbers, or underscores. Passwords are 8–20 standard keyboard characters. Retype the password so a typo cannot become your saved password.</p>
      <div class="NetFieldR90"><label>Username</label><input name="username" autocomplete="username" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" required></div>
      <div class="NetFieldR90"><label>Password</label><input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="20" required></div>
      <div class="NetFieldR90"><label>Retype Password</label><input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="20" required></div>
      <button class="NetButtonR90 Primary" type="submit">CREATE ACCOUNT</button>
      <div class="NetMessageR90" data-message>${Escape(Message)}</div>
    </form>`;
}

function ProfileMarkup(State) {
  const Profile = State.profile || {};
  return `
    <div class="NetProfileHeroR90">${ProfileIcon()}<div><strong>${Escape(State.account.username)}</strong><span>Infinity Store account</span></div></div>
    <div class="NetStatsR90">
      <div class="NetStatR90"><strong>${Number(Profile.games_played || 0)}</strong><span>Games</span></div>
      <div class="NetStatR90"><strong>${Number(Profile.tasks_completed || 0)}</strong><span>Tasks</span></div>
      <div class="NetStatR90"><strong>${Number(Profile.best_aisle || 0)}</strong><span>Best Aisle</span></div>
    </div>
    <div class="NetCardR90">
      <h3>Account Settings</h3><p>This device currently remembers ${State.savedAccounts?.length || 1} account session${(State.savedAccounts?.length || 1) === 1 ? "" : "s"}. Passwords are never stored in this list.</p>
      <div class="NetActionsR90"><button class="NetButtonR90" type="button" data-switch>SWITCH ACCOUNT</button><button class="NetButtonR90 Danger" type="button" data-logout>LOG OUT</button></div>
      <div class="NetMessageR90" data-message>${Escape(Message)}</div>
    </div>
    <button class="NetButtonR90 Primary" type="button" data-multiplayer>MULTIPLAYER</button>`;
}

function SwitchMarkup(State) {
  const Accounts = State.savedAccounts || [];
  const Rows = Accounts.length ? Accounts.map(Item => `
    <div class="SavedAccountR90">${ProfileIcon()}<div class="Info"><strong>${Escape(Item.username)}</strong><span>${Item.userId === State.account?.id ? "Current account" : "Saved on this device"}</span></div>${Item.userId === State.account?.id ? `<span class="LobbyHostR90">ACTIVE</span>` : `<button class="NetButtonR90" type="button" data-switch-id="${Escape(Item.userId)}">SWITCH</button>`}</div>`).join("") : `<p>No saved accounts.</p>`;
  return `
    <div class="NetCardR90"><h3>Saved Accounts</h3><p>Switching does not bypass login security. The saved session is checked with Render before the account becomes active.</p>${Rows}<div class="NetMessageR90" data-message>${Escape(Message)}</div></div>
    <button class="NetButtonR90" type="button" data-login-another>LOG IN TO ANOTHER ACCOUNT</button>`;
}

function MultiplayerMarkup() {
  const Count = AvailableServers === null ? "CHECKING…" : `${AvailableServers} AVAILABLE`;
  return `
    <div class="NetGridR90">
      <div class="NetCardR90"><h3>Random Available Server</h3><p>Join an existing game that allows random players. This does not create a server when none exist.</p><button class="NetButtonR90 Primary" type="button" data-random ${AvailableServers === 0 ? "disabled" : ""}>${Count}</button></div>
      <div class="NetCardR90"><h3>Join With Game Code</h3><p>Enter the code from another player's lobby.</p><form data-join-form><div class="NetFieldR90"><label>Game Code</label><input name="code" maxlength="8" autocomplete="off" required></div><button class="NetButtonR90" type="submit">JOIN GAME</button></form></div>
    </div>
    <div class="NetCardR90"><h3>Create Game</h3><p>Create a lobby, choose the maximum players, and decide whether people can join after the game has started.</p><button class="NetButtonR90" type="button" data-create-game>CREATE GAME</button><div class="NetMessageR90" data-message>${Escape(Message)}</div></div>`;
}

function CreateGameMarkup() {
  return `
    <form class="NetCardR90" data-create-game-form>
      <h3>Game Settings</h3><p>A multiplayer game cannot start with only the host. The server requires at least two connected players.</p>
      <div class="NetFieldR90"><label>Maximum Players</label><select name="maxPlayers"><option value="2">2 players</option><option value="3">3 players</option><option value="4" selected>4 players</option><option value="5">5 players</option><option value="6">6 players</option></select></div>
      <label class="ToggleRowR90"><span><strong>Allow Late Join</strong><small>Players with the code, or random players when enabled, can join after the game starts.</small></span><input class="ToggleR90" name="allowLateJoin" type="checkbox" checked></label>
      <label class="ToggleRowR90"><span><strong>Allow Random Join</strong><small>Makes this lobby eligible for the Random Available Server button.</small></span><input class="ToggleR90" name="public" type="checkbox" checked></label>
      <button class="NetButtonR90 Primary" type="submit">CREATE LOBBY</button>
      <div class="NetMessageR90" data-message>${Escape(Message)}</div>
    </form>`;
}

function LobbyMarkup(State) {
  const Room = State.room;
  if (!Room) return `<div class="NetCardR90"><h3>Lobby Ended</h3><p>This lobby no longer exists.</p><button class="NetButtonR90" data-back-multiplayer>BACK TO MULTIPLAYER</button></div>`;
  const IsHost = State.account?.id === Room.hostUserId;
  const Players = LobbyPlayers.length ? LobbyPlayers : [{ userId: State.account?.id, name: State.account?.username }];
  const PlayerRows = Players.map(Member => `
    <div class="LobbyPlayerR90">${ProfileIcon()}<div class="Info"><strong>${Escape(Member.name || "PLAYER")}</strong><span>${Member.userId === State.account?.id ? "You" : "Connected player"}</span></div>${Member.userId === Room.hostUserId ? `<span class="LobbyHostR90">HOST</span>` : ""}</div>`).join("");
  const Ready = Room.playerCount >= 2;
  const StartStatus = Room.started ? "Game already started." : Ready ? "Two or more players are here. The host can start." : "Waiting for at least one more player. Multiplayer cannot start with only you.";
  const Settings = IsHost && !Room.started ? `
    <form class="NetCardR90" data-lobby-settings>
      <h3>Lobby Settings</h3>
      <div class="NetFieldR90"><label>Maximum Players</label><select name="maxPlayers">${[2,3,4,5,6].map(Value => `<option value="${Value}" ${Value === Room.maxPlayers ? "selected" : ""}>${Value} players</option>`).join("")}</select></div>
      <label class="ToggleRowR90"><span><strong>Allow Late Join</strong><small>Allow players to enter after START GAME.</small></span><input class="ToggleR90" name="allowLateJoin" type="checkbox" ${Room.allowLateJoin ? "checked" : ""}></label>
      <label class="ToggleRowR90"><span><strong>Allow Random Join</strong><small>Let Random Available Server find this lobby.</small></span><input class="ToggleR90" name="public" type="checkbox" ${Room.public ? "checked" : ""}></label>
      <button class="NetButtonR90" type="submit">SAVE SETTINGS</button>
    </form>` : "";
  return `
    <div class="NetCardR90"><h3>${Room.started ? "Game In Progress" : "Waiting Lobby"}</h3><p>Share this game code with another player.</p><div class="RoomCodeR90">${Escape(Room.code)}</div><div class="RoomMetaR90"><span>${Room.playerCount}/${Room.maxPlayers} players</span><span>${Room.allowLateJoin ? "Late join on" : "Late join off"}</span><span>${Room.public ? "Random join on" : "Code only"}</span></div><button class="NetButtonR90" type="button" data-copy-code>COPY GAME CODE</button></div>
    <div class="NetCardR90"><h3>Players</h3>${PlayerRows}<div class="LobbyWaitR90 ${Ready ? "Ready" : ""}">${Escape(StartStatus)}</div>${IsHost && !Room.started ? `<button class="NetButtonR90 Primary" type="button" data-start-game ${Ready ? "" : "disabled"}>START GAME</button>` : !Room.started ? `<button class="NetButtonR90" type="button" disabled>WAITING FOR HOST</button>` : ""}<div class="NetMessageR90" data-message>${Escape(Message)}</div></div>
    ${Settings}
    <button class="NetButtonR90 Danger" type="button" data-leave>LEAVE LOBBY</button>`;
}

function Render() {
  const State = Multiplayer.GetState();
  UpdateStatus(State);
  Title.textContent = PageTitle();
  BackButton.style.visibility = ["login", "profile"].includes(Page) ? "hidden" : "visible";
  if (Page === "login") Content.innerHTML = LoginMarkup();
  else if (Page === "create") Content.innerHTML = CreateMarkup();
  else if (Page === "profile") Content.innerHTML = ProfileMarkup(State);
  else if (Page === "switch") Content.innerHTML = SwitchMarkup(State);
  else if (Page === "multiplayer") Content.innerHTML = MultiplayerMarkup();
  else if (Page === "createGame") Content.innerHTML = CreateGameMarkup();
  else if (Page === "lobby") Content.innerHTML = LobbyMarkup(State);
  BindPage();
  if (Busy) SetBusy(true);
  RenderMainMenu();
  SyncLobbySocket();
  SyncStartButton();
}

function BindPage() {
  Content.querySelector("[data-open-create]")?.addEventListener("click", () => { Page = "create"; Message = ""; Render(); });
  Content.querySelector("[data-login-form]")?.addEventListener("submit", async Event => {
    Event.preventDefault();
    const Data = new FormData(Event.currentTarget);
    SetBusy(true); SetMessage("Logging in…");
    const Result = await Multiplayer.Login(Data.get("username"), Data.get("password"));
    Busy = false;
    if (Result?.ok) { Page = "profile"; Message = "Logged in."; }
    else Message = FriendlyError(Result);
    Render();
  });
  Content.querySelector("[data-create-form]")?.addEventListener("submit", async Event => {
    Event.preventDefault();
    const Data = new FormData(Event.currentTarget);
    const Password = String(Data.get("password") || "");
    const Confirm = String(Data.get("confirmPassword") || "");
    if (Password !== Confirm) { Message = ErrorText.PASSWORDS_DO_NOT_MATCH; return Render(); }
    SetBusy(true); SetMessage("Creating account…");
    const Result = await Multiplayer.Register(Data.get("username"), Password, Confirm);
    Busy = false;
    if (Result?.ok) { Page = "profile"; Message = "Account created."; }
    else Message = FriendlyError(Result);
    Render();
  });
  Content.querySelector("[data-switch]")?.addEventListener("click", () => { Page = "switch"; Message = ""; Render(); });
  Content.querySelector("[data-logout]")?.addEventListener("click", async () => {
    SetBusy(true); await Multiplayer.Logout(); Busy = false; Page = "login"; Message = "Logged out."; Render();
  });
  Content.querySelectorAll("[data-switch-id]").forEach(Button => Button.addEventListener("click", async () => {
    SetBusy(true); SetMessage("Checking saved account with server…");
    const Result = await Multiplayer.SwitchAccount(Button.dataset.switchId);
    Busy = false;
    if (Result?.ok) { Page = "profile"; Message = `Switched to ${Result.account.username}.`; }
    else Message = FriendlyError(Result);
    Render();
  }));
  Content.querySelector("[data-login-another]")?.addEventListener("click", () => { Page = "login"; Message = "Log in to add or refresh another account on this device."; Render(); });
  Content.querySelector("[data-multiplayer]")?.addEventListener("click", () => { Page = Multiplayer.GetState().room ? "lobby" : "multiplayer"; Message = ""; Render(); if (Page === "multiplayer") RefreshAvailability(); });
  Content.querySelector("[data-random]")?.addEventListener("click", async () => {
    SetBusy(true); SetMessage("Joining an available server…");
    const Result = await Multiplayer.QuickJoin();
    Busy = false;
    if (Result?.ok) { LobbyPlayers = [Result.player, ...(Result.players || [])]; Page = "lobby"; Message = "Joined lobby."; }
    else Message = FriendlyError(Result);
    Render();
    if (!Result?.ok) RefreshAvailability();
  });
  Content.querySelector("[data-join-form]")?.addEventListener("submit", async Event => {
    Event.preventDefault(); const Data = new FormData(Event.currentTarget);
    SetBusy(true); SetMessage("Joining game…");
    const Result = await Multiplayer.JoinRoom(Data.get("code"));
    Busy = false;
    if (Result?.ok) { LobbyPlayers = [Result.player, ...(Result.players || [])]; Page = "lobby"; Message = RoomMessageForJoin(Result.room); }
    else Message = FriendlyError(Result);
    Render();
  });
  Content.querySelector("[data-create-game]")?.addEventListener("click", () => { Page = "createGame"; Message = ""; Render(); });
  Content.querySelector("[data-create-game-form]")?.addEventListener("submit", async Event => {
    Event.preventDefault(); const Data = new FormData(Event.currentTarget);
    SetBusy(true); SetMessage("Creating multiplayer lobby…");
    const Result = await Multiplayer.CreateRoom({ maxPlayers: Data.get("maxPlayers"), allowLateJoin: Data.get("allowLateJoin") === "on", public: Data.get("public") === "on" });
    Busy = false;
    if (Result?.ok) { LobbyPlayers = [Result.player, ...(Result.players || [])]; Page = "lobby"; Message = "Lobby created. Waiting for another player."; }
    else Message = FriendlyError(Result);
    Render();
  });
  Content.querySelector("[data-lobby-settings]")?.addEventListener("submit", async Event => {
    Event.preventDefault(); const Data = new FormData(Event.currentTarget);
    SetBusy(true); SetMessage("Saving lobby settings…");
    const Result = await Multiplayer.UpdateRoomSettings({ maxPlayers: Data.get("maxPlayers"), allowLateJoin: Data.get("allowLateJoin") === "on", public: Data.get("public") === "on" });
    Busy = false; Message = Result?.ok ? "Lobby settings saved." : FriendlyError(Result); Render();
  });
  Content.querySelector("[data-start-game]")?.addEventListener("click", async () => {
    SetBusy(true); SetMessage("Starting multiplayer game…");
    const Result = await Multiplayer.StartRoom();
    Busy = false; Message = Result?.ok ? "Starting…" : FriendlyError(Result); Render();
  });
  Content.querySelector("[data-copy-code]")?.addEventListener("click", async () => {
    const Code = Multiplayer.GetState().room?.code || "";
    try { await navigator.clipboard.writeText(Code); Message = "Game code copied."; }
    catch { Message = `Game code: ${Code}`; }
    Render();
  });
  Content.querySelector("[data-leave]")?.addEventListener("click", async () => {
    SetBusy(true); await Multiplayer.LeaveRoom(); Busy = false; LobbyPlayers = []; Page = "multiplayer"; Message = "Left lobby."; Render(); RefreshAvailability();
  });
  Content.querySelector("[data-back-multiplayer]")?.addEventListener("click", () => { Page = "multiplayer"; Render(); RefreshAvailability(); });
}

function RoomMessageForJoin(Room) {
  return Room?.started ? "Joined the game in progress." : "Joined lobby.";
}

async function RefreshAvailability() {
  if (!Multiplayer.GetState().account) return;
  const Result = await Multiplayer.ListPublicRooms();
  AvailableServers = Result?.ok ? Number(Result.count || 0) : 0;
  if (Page === "multiplayer") Render();
}

function SyncLobbySocket() {
  const Socket = Multiplayer.GetSocket?.();
  if (Socket === BoundSocket) return;
  BoundSocket = Socket;
  if (!Socket) return;
  Socket.on("room:sync", Payload => {
    if (Array.isArray(Payload?.players)) LobbyPlayers = Payload.players;
    if (Page === "lobby") Render();
  });
  Socket.on("player:joined", Player => {
    if (!Player?.id) return;
    LobbyPlayers = [...LobbyPlayers.filter(Item => Item.id !== Player.id), Player];
    if (Page === "lobby") Render();
  });
  Socket.on("player:left", Player => {
    LobbyPlayers = LobbyPlayers.filter(Item => Item.id !== Player?.id);
    if (Page === "lobby") Render();
  });
}

function RenderMainMenu() {
  const State = Multiplayer.GetState();
  const Parent = StartButton?.parentElement;
  if (Parent) {
    let Wrap = document.getElementById("MainAccountActionsR90");
    if (!Wrap) {
      Wrap = document.createElement("div");
      Wrap.id = "MainAccountActionsR90";
      StartButton.insertAdjacentElement("afterend", Wrap);
    }
    if (State.account) {
      Wrap.innerHTML = `<button class="ProfileBadgeR90" type="button" data-main-profile>${ProfileIcon()}<span><strong>${Escape(State.account.username)}</strong><small>Profile & account settings</small></span><span class="Arrow">›</span></button><button class="MainNetButtonR90 Wide Primary" type="button" data-main-multiplayer>MULTIPLAYER</button>`;
      Wrap.querySelector("[data-main-profile]")?.addEventListener("click", () => Open("profile"));
      Wrap.querySelector("[data-main-multiplayer]")?.addEventListener("click", () => Open(State.room ? "lobby" : "multiplayer"));
    } else {
      Wrap.innerHTML = `<button class="MainNetButtonR90" type="button" data-main-login>LOG IN</button><button class="MainNetButtonR90" type="button" data-main-create>CREATE ACCOUNT</button><button class="MainNetButtonR90 Wide Primary" type="button" data-main-multiplayer>MULTIPLAYER</button>`;
      Wrap.querySelector("[data-main-login]")?.addEventListener("click", () => Open("login"));
      Wrap.querySelector("[data-main-create]")?.addEventListener("click", () => Open("create"));
      Wrap.querySelector("[data-main-multiplayer]")?.addEventListener("click", () => { Message = "Log in before joining multiplayer."; Open("login"); });
    }
  }

  const RuntimeActions = document.querySelector("#RuntimeMainMenuR83 .RuntimeMenuActionsR84");
  if (RuntimeActions) {
    RuntimeActions.querySelectorAll(".MultiplayerMenuEntryR90").forEach(Item => Item.remove());
    const Profile = document.createElement("button");
    Profile.className = "MultiplayerMenuEntryR90";
    Profile.type = "button";
    Profile.textContent = State.account ? `PROFILE • ${State.account.username}` : "LOG IN / CREATE ACCOUNT";
    Profile.addEventListener("click", () => Open(State.account ? "profile" : "login"));
    RuntimeActions.appendChild(Profile);
    const Multi = document.createElement("button");
    Multi.className = "MultiplayerMenuEntryR90";
    Multi.type = "button";
    Multi.textContent = "MULTIPLAYER";
    Multi.addEventListener("click", () => Open(State.account ? (State.room ? "lobby" : "multiplayer") : "login"));
    RuntimeActions.appendChild(Multi);
  }
}

function SyncStartButton() {
  if (!StartButton) return;
  const Room = Multiplayer.GetState().room;
  if (Room && !Room.started) {
    if (!StartButton.dataset.NetworkLockedR90) StartButton.dataset.NetworkLockedR90 = StartButton.disabled ? "was-disabled" : "was-ready";
    StartButton.disabled = true;
    StartButton.textContent = Room.playerCount >= 2 ? "START FROM MULTIPLAYER LOBBY" : "WAITING FOR ANOTHER PLAYER";
    return;
  }
  if (StartButton.dataset.NetworkLockedR90) {
    const WasReady = StartButton.dataset.NetworkLockedR90 === "was-ready";
    delete StartButton.dataset.NetworkLockedR90;
    StartButton.textContent = "ENTER THE STORE";
    if (WasReady || window.__STORE_BOOTSTRAP_BUILD__) StartButton.disabled = false;
  }
}

async function EnterMultiplayerGame() {
  if (MultiplayerStartInProgress) return;
  MultiplayerStartInProgress = true;
  Close();
  for (let Attempt = 0; Attempt < 80; Attempt += 1) {
    if (!BootScreen?.classList.contains("ScreenVisible")) break;
    SyncStartButton();
    if (StartButton && !StartButton.disabled) {
      StartButton.click();
      break;
    }
    await new Promise(Resolve => setTimeout(Resolve, 75));
  }
  MultiplayerStartInProgress = false;
}

addEventListener("store-network-change", () => { UpdateStatus(Multiplayer.GetState()); RenderMainMenu(); SyncLobbySocket(); });
addEventListener("store-account-change", () => { if (Overlay.classList.contains("Open")) Render(); else RenderMainMenu(); });
addEventListener("store-room-change", () => { if (Overlay.classList.contains("Open") && Page === "lobby") Render(); else { RenderMainMenu(); SyncStartButton(); } });
addEventListener("store-multiplayer-start", EnterMultiplayerGame);
addEventListener("keydown", Event => {
  if (Event.code !== "Escape" || !Overlay.classList.contains("Open")) return;
  Event.preventDefault(); Event.stopImmediatePropagation(); Close();
}, true);

const Observer = new MutationObserver(() => RenderMainMenu());
Observer.observe(document.body, { childList: true, subtree: true });
setInterval(() => {
  RenderMainMenu();
  SyncStartButton();
  if (Page === "multiplayer" && Overlay.classList.contains("Open")) RefreshAvailability();
}, 5000);

RenderMainMenu();
UpdateStatus(Multiplayer.GetState());
SyncLobbySocket();
window.__STORE_MULTIPLAYER_UI_R88__ = { Open, Close, Render };
window.__STORE_MULTIPLAYER_UI_BUILD__ = "V0.26.0-R90";