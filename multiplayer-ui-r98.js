const Multiplayer = window.__STORE_MULTIPLAYER_R88__;
if (!Multiplayer) throw new Error("Multiplayer R98 client must load before multiplayer UI R98.");

const Style = document.createElement("style");
Style.id = "MultiplayerUiStyleR98";
Style.textContent = `
#NetworkOverlayR98{position:fixed;inset:0;z-index:1450;display:none;place-items:center;padding:18px;background:#050705;color:#eee4d0;font-family:Arial,sans-serif}#NetworkOverlayR98.Open{display:grid}.NetFrameR98{width:min(760px,calc(100vw - 28px));max-height:calc(100dvh - 28px);overflow:auto;border:1px solid rgba(224,211,186,.42);background:#111411;contain:layout paint style}.NetHeadR98{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:12px;padding:15px 17px;border-bottom:1px solid rgba(224,211,186,.14);background:#181c18}.NetHeadR98 button{width:40px;height:40px;border:1px solid rgba(224,211,186,.25);background:#202520;color:#eee4d0;cursor:pointer}.NetTitleR98{flex:1}.NetTitleR98 small{display:block;color:#a27c58;font:900 9px Arial;letter-spacing:.17em}.NetTitleR98 h2{margin:4px 0 0;font:900 16px Arial;letter-spacing:.12em}.NetBodyR98{padding:17px}.NetStatusR98{display:flex;gap:8px;align-items:center;margin-bottom:13px;color:rgba(238,228,208,.52);font:850 9px Arial;letter-spacing:.1em}.NetStatusR98 i{width:7px;height:7px;border-radius:50%;background:#777}.NetStatusR98.On i{background:#8caf88}.NetCardR98{padding:15px;margin-bottom:10px;border:1px solid rgba(224,211,186,.13);background:#171b17}.NetCardR98 h3{margin:0 0 7px;font:900 12px Arial;letter-spacing:.12em}.NetCardR98 p{margin:0 0 12px;color:rgba(238,228,208,.48);font:600 11px/1.45 Arial}.NetGridR98{display:grid;grid-template-columns:1fr 1fr;gap:9px}.NetFieldR98{display:grid;gap:6px;margin:10px 0}.NetFieldR98 label{color:rgba(238,228,208,.54);font:900 9px Arial;letter-spacing:.1em}.NetFieldR98 input,.NetFieldR98 select{box-sizing:border-box;width:100%;height:44px;border:1px solid rgba(224,211,186,.22);background:#090b09;color:#f2e8d5;padding:0 12px;outline:none;font:800 13px Arial}.NetFieldR98 input[data-code]{text-transform:uppercase;letter-spacing:.16em;font-family:Consolas,monospace}.NetButtonR98,.MainNetR98,.RuntimeNetR98{min-height:44px;border:1px solid rgba(224,211,186,.28);background:#2a302a;color:#eee4d0;padding:0 14px;font:900 10px Arial;letter-spacing:.1em;cursor:pointer}.NetButtonR98{width:100%}.NetButtonR98.Primary,.MainNetR98.Primary{background:#e2d7c0;color:#141714;border-color:#e2d7c0}.NetButtonR98.Danger{border-color:#653e37;background:#321f1c}.NetButtonR98:disabled,.MainNetR98:disabled{opacity:.42;cursor:default}.NetActionsR98{display:grid;grid-template-columns:1fr 1fr;gap:8px}.NetMessageR98{min-height:17px;margin-top:9px;color:#d0a16d;font:700 11px/1.4 Arial}.NetToggleRowR98{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-top:1px solid rgba(224,211,186,.08)}.NetToggleRowR98 strong{display:block;font:900 10px Arial;letter-spacing:.08em}.NetToggleRowR98 small{display:block;margin-top:3px;color:rgba(238,228,208,.4);font:600 10px Arial}.NetToggleR98{width:18px;height:18px;accent-color:#d9c8aa}.NetCodeR98{margin:6px 0 12px;font:900 25px Consolas,monospace;letter-spacing:.17em}.NetMetaR98{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.NetMetaR98 span{padding:5px 7px;border:1px solid rgba(224,211,186,.12);color:rgba(238,228,208,.54);font:900 9px Arial}.NetPlayerR98,.NetProfileR98,.NetSavedR98{display:flex;align-items:center;gap:11px;padding:11px;border:1px solid rgba(224,211,186,.12);background:#1b201b;margin-bottom:7px}.NetAvatarR98{width:36px;height:36px;display:grid;place-items:center;border-radius:7px;border:1px solid rgba(224,211,186,.22);background:#252b25;flex:none}.NetAvatarR98 svg{width:19px;height:19px;fill:#eee4d0}.NetInfoR98{flex:1;min-width:0}.NetInfoR98 strong{display:block;font:900 12px Arial}.NetInfoR98 small{display:block;margin-top:3px;color:rgba(238,228,208,.4);font:800 9px Arial;letter-spacing:.07em}.NetHostR98{font:900 8px Arial;color:#d1a06b}.NetStatsR98{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:10px}.NetStatsR98 div{padding:10px;text-align:center;border:1px solid rgba(224,211,186,.11)}.NetStatsR98 strong{display:block}.NetStatsR98 span{display:block;margin-top:3px;color:rgba(238,228,208,.4);font:900 8px Arial}.NetWaitR98{padding:10px;margin:9px 0;border:1px solid rgba(183,133,78,.22);color:#cfa06b;font:700 11px Arial}.NetWaitR98.Ready{color:#98b894;border-color:rgba(126,166,123,.25)}.MainWrapR98{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;margin-top:10px}.MainProfileR98{grid-column:1/-1;display:flex;align-items:center;gap:10px;min-height:52px;padding:7px 10px;border:1px solid rgba(224,211,186,.24);background:#171b17;color:#eee4d0;cursor:pointer;text-align:left}.MainProfileR98 .NetAvatarR98{width:34px;height:34px}.MainProfileR98 b{margin-left:auto}.MainNetR98{width:100%}.MainNetR98.Wide{grid-column:1/-1}.RuntimeNetR98{min-width:140px}.NetworkHudR98{position:fixed;left:14px;bottom:58px;z-index:72;display:none;padding:7px 9px;border:1px solid rgba(224,211,186,.16);background:#080a08;color:rgba(238,228,208,.62);font:900 9px Arial;letter-spacing:.08em;pointer-events:none}.NetworkHudR98.Show{display:block}@media(max-width:620px){.NetGridR98,.NetActionsR98,.MainWrapR98{grid-template-columns:1fr}.MainProfileR98,.MainNetR98.Wide{grid-column:auto}}
`;
document.head.appendChild(Style);

const Overlay = document.createElement("section");
Overlay.id = "NetworkOverlayR98";
Overlay.innerHTML = `<div class="NetFrameR98"><div class="NetHeadR98"><button type="button" data-back>←</button><div class="NetTitleR98"><small>THE INFINITY STORE NETWORK</small><h2 data-title>MULTIPLAYER</h2></div><button type="button" data-close>×</button></div><div class="NetBodyR98"><div class="NetStatusR98"><i></i><span data-status>OFFLINE</span></div><div data-content></div></div></div>`;
document.body.appendChild(Overlay);

const NetworkHud = document.createElement("div");
NetworkHud.className = "NetworkHudR98";
document.body.appendChild(NetworkHud);

const Content = Overlay.querySelector("[data-content]");
const Title = Overlay.querySelector("[data-title]");
const StatusLine = Overlay.querySelector(".NetStatusR98");
const StatusText = Overlay.querySelector("[data-status]");
const Back = Overlay.querySelector("[data-back]");
const StartButton = document.getElementById("StartButton");
const BootScreen = document.getElementById("BootScreen");

let Page = "profile";
let Message = "";
let Busy = false;
let PublicRooms = null;
let MainSignature = "";
let LobbySignature = "";
let StartTransitioning = false;

const Errors = {
  USERNAME_LENGTH: "Username must be 3–20 characters.", USERNAME_CHARACTERS: "Username can use letters, numbers, and underscore only.", USERNAME_TAKEN: "That username is already taken.", PASSWORD_TOO_SHORT: "Password must be at least 8 characters.", PASSWORD_TOO_LONG: "Password can be at most 20 characters.", PASSWORD_ASCII_ONLY: "Password can use standard keyboard characters only.", PASSWORDS_DO_NOT_MATCH: "The two passwords do not match.", INVALID_LOGIN: "Username or password is incorrect.", TOO_MANY_ATTEMPTS: "Too many attempts. Try again shortly.", SERVER_TIMEOUT: "The server took too long to answer.", SERVER_UNREACHABLE: "The multiplayer server could not be reached.", SOCKET_OFFLINE: "The realtime server is not connected.", ROOM_NOT_FOUND: "That game code does not exist.", ROOM_FULL: "That game is full.", LATE_JOIN_DISABLED: "That game already started and late join is disabled.", NO_PUBLIC_SERVERS: "There are no random-join servers available.", NEED_MORE_PLAYERS: "At least 2 players are required to start.", HOST_ONLY: "Only the host can do that.", MAX_BELOW_PLAYER_COUNT: "The limit cannot be below the current player count.", SAVED_SESSION_EXPIRED: "That saved login expired.", AUTH_REQUIRED: "Log in first."
};

function State() { return Multiplayer.GetState(); }
function Escape(Value) { return String(Value ?? "").replace(/[&<>'"]/g, Character => ({ "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;" })[Character]); }
function ErrorText(Result) { return Errors[Result?.error] || String(Result?.error || "Something went wrong.").replaceAll("_", " "); }
function NormalizeCode(Value) { return String(Value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); }
function Avatar() { return `<span class="NetAvatarR98" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 11.1a3.35 3.35 0 1 0 0-6.7 3.35 3.35 0 0 0 0 6.7Zm0 2.15c-4.2 0-7 2.15-7 5.35 0 .62.5 1.12 1.12 1.12h11.76c.62 0 1.12-.5 1.12-1.12 0-3.2-2.8-5.35-7-5.35Z"/></svg></span>`; }

function SetBusy(Value) {
  Busy = Boolean(Value);
  Content.querySelectorAll("button,input,select").forEach(Element => Element.disabled = Busy);
}

function UpdateStatus() {
  const Current = State();
  const Label = Current.status === "waking" ? "WAKING SERVER…" : Current.status === "connecting" ? "CONNECTING…" : Current.status === "reconnecting" ? "RECONNECTING…" : Current.connected ? "NETWORK ONLINE" : "OFFLINE";
  if (StatusText.textContent !== Label) StatusText.textContent = Label;
  StatusLine.classList.toggle("On", Boolean(Current.connected));
  const HudText = Current.room ? `${Current.room.code} • ${Current.room.playerCount}/${Current.room.maxPlayers}` : Current.connected ? "NETWORK ONLINE" : "NETWORK OFFLINE";
  NetworkHud.textContent = HudText;
  NetworkHud.classList.toggle("Show", Boolean(Current.room));
}

function LoginMarkup() {
  return `<form class="NetCardR98" data-login><h3>LOG IN</h3><div class="NetFieldR98"><label>USERNAME</label><input name="username" maxlength="20" autocomplete="username" required></div><div class="NetFieldR98"><label>PASSWORD</label><input name="password" type="password" maxlength="20" autocomplete="current-password" required></div><button class="NetButtonR98 Primary" type="submit">LOG IN</button><div class="NetMessageR98">${Escape(Message)}</div></form><button class="NetButtonR98" data-create-page>CREATE ACCOUNT</button>`;
}

function CreateAccountMarkup() {
  return `<form class="NetCardR98" data-create-account><h3>CREATE ACCOUNT</h3><div class="NetFieldR98"><label>USERNAME</label><input name="username" maxlength="20" pattern="[A-Za-z0-9_]+" required></div><div class="NetFieldR98"><label>PASSWORD</label><input name="password" type="password" minlength="8" maxlength="20" required></div><div class="NetFieldR98"><label>RETYPE PASSWORD</label><input name="confirm" type="password" minlength="8" maxlength="20" required></div><button class="NetButtonR98 Primary" type="submit">CREATE ACCOUNT</button><div class="NetMessageR98">${Escape(Message)}</div></form>`;
}

function ProfileMarkup() {
  const Current = State();
  if (!Current.account) return LoginMarkup();
  const Profile = Current.profile || {};
  return `<div class="NetProfileR98">${Avatar()}<div class="NetInfoR98"><strong>${Escape(Current.account.username)}</strong><small>INFINITY STORE ACCOUNT</small></div></div><div class="NetStatsR98"><div><strong>${Number(Profile.games_played || 0)}</strong><span>GAMES</span></div><div><strong>${Number(Profile.tasks_completed || 0)}</strong><span>TASKS</span></div><div><strong>${Number(Profile.best_aisle || 0)}</strong><span>BEST AISLE</span></div></div><div class="NetActionsR98"><button class="NetButtonR98 Primary" data-multiplayer>MULTIPLAYER</button><button class="NetButtonR98" data-switch>SWITCH ACCOUNT</button></div><button class="NetButtonR98 Danger" data-logout>LOG OUT</button><div class="NetMessageR98">${Escape(Message)}</div>`;
}

function SwitchMarkup() {
  const Rows = State().savedAccounts.map(Item => `<div class="NetSavedR98">${Avatar()}<div class="NetInfoR98"><strong>${Escape(Item.username)}</strong><small>SAVED ON THIS DEVICE</small></div><button class="NetButtonR98" data-account="${Escape(Item.userId)}">USE</button></div>`).join("");
  return `<div class="NetCardR98"><h3>SWITCH ACCOUNT</h3>${Rows || `<p>No other saved accounts.</p>`}<div class="NetMessageR98">${Escape(Message)}</div></div><button class="NetButtonR98" data-login-another>LOG IN TO ANOTHER ACCOUNT</button>`;
}

function MultiplayerMarkup() {
  const Count = PublicRooms === null ? "NOT CHECKED" : `${PublicRooms.length} AVAILABLE`;
  return `<div class="NetGridR98"><div class="NetCardR98"><h3>RANDOM AVAILABLE SERVER</h3><p>Joins an existing public game. It never creates one.</p><button class="NetButtonR98 Primary" data-random ${PublicRooms !== null && PublicRooms.length === 0 ? "disabled" : ""}>${Count}</button><button class="NetButtonR98" data-refresh>REFRESH SERVERS</button></div><form class="NetCardR98" data-join><h3>JOIN WITH GAME CODE</h3><p>Codes use uppercase letters and numbers only.</p><div class="NetFieldR98"><label>GAME CODE</label><input name="code" data-code maxlength="8" autocomplete="off" required></div><button class="NetButtonR98" type="submit">JOIN GAME</button></form></div><div class="NetCardR98"><h3>CREATE GAME</h3><p>Create a lobby for 2–6 players.</p><button class="NetButtonR98" data-create-game>CREATE GAME</button><div class="NetMessageR98">${Escape(Message)}</div></div>`;
}

function CreateGameMarkup() {
  return `<form class="NetCardR98" data-create-game-form><h3>GAME SETTINGS</h3><p>The game cannot start until at least 2 players are connected.</p><div class="NetFieldR98"><label>MAXIMUM PLAYERS</label><select name="maxPlayers">${[2,3,4,5,6].map(Value => `<option value="${Value}" ${Value === 4 ? "selected" : ""}>${Value} PLAYERS</option>`).join("")}</select></div><label class="NetToggleRowR98"><span><strong>ALLOW LATE JOIN</strong><small>Players may join after the game starts.</small></span><input class="NetToggleR98" name="late" type="checkbox" checked></label><label class="NetToggleRowR98"><span><strong>ALLOW RANDOM JOIN</strong><small>Allows Random Available Server to find this lobby.</small></span><input class="NetToggleR98" name="public" type="checkbox" checked></label><button class="NetButtonR98 Primary" type="submit">CREATE LOBBY</button><div class="NetMessageR98">${Escape(Message)}</div></form>`;
}

function LobbyMarkup() {
  const Current = State();
  const Room = Current.room;
  if (!Room) return `<div class="NetCardR98"><h3>LOBBY ENDED</h3><button class="NetButtonR98" data-multiplayer>BACK TO MULTIPLAYER</button></div>`;
  const Players = Current.players?.length ? Current.players : [{ userId: Current.account?.id, name: Current.account?.username }];
  const Rows = Players.map(Item => `<div class="NetPlayerR98">${Avatar()}<div class="NetInfoR98"><strong>${Escape(Item.name || "UNKNOWN")}</strong><small>${Item.userId === Current.account?.id ? "YOU" : "CONNECTED PLAYER"}</small></div>${Item.userId === Room.hostUserId ? `<b class="NetHostR98">HOST</b>` : ""}</div>`).join("");
  const Host = Current.account?.id === Room.hostUserId;
  const Ready = Number(Room.playerCount || Players.length) >= 2;
  const Settings = Host && !Room.started ? `<form class="NetCardR98" data-settings><h3>LOBBY SETTINGS</h3><div class="NetFieldR98"><label>MAXIMUM PLAYERS</label><select name="maxPlayers">${[2,3,4,5,6].map(Value => `<option value="${Value}" ${Number(Room.maxPlayers) === Value ? "selected" : ""}>${Value} PLAYERS</option>`).join("")}</select></div><label class="NetToggleRowR98"><span><strong>ALLOW LATE JOIN</strong></span><input class="NetToggleR98" name="late" type="checkbox" ${Room.allowLateJoin ? "checked" : ""}></label><label class="NetToggleRowR98"><span><strong>ALLOW RANDOM JOIN</strong></span><input class="NetToggleR98" name="public" type="checkbox" ${Room.public ? "checked" : ""}></label><button class="NetButtonR98" type="submit">SAVE SETTINGS</button></form>` : "";
  return `<div class="NetCardR98"><h3>${Room.started ? "GAME IN PROGRESS" : "WAITING LOBBY"}</h3><div class="NetCodeR98">${Escape(NormalizeCode(Room.code))}</div><div class="NetMetaR98"><span>${Number(Room.playerCount || Players.length)}/${Room.maxPlayers} PLAYERS</span><span>${Room.allowLateJoin ? "LATE JOIN ON" : "LATE JOIN OFF"}</span><span>${Room.public ? "RANDOM JOIN ON" : "CODE ONLY"}</span></div><button class="NetButtonR98" data-copy>COPY GAME CODE</button></div><div class="NetCardR98"><h3>PLAYERS</h3>${Rows}<div class="NetWaitR98 ${Ready ? "Ready" : ""}">${Room.started ? "GAME STARTED" : Ready ? "READY TO START" : "WAITING FOR ANOTHER PLAYER"}</div>${Host && !Room.started ? `<button class="NetButtonR98 Primary" data-start ${Ready ? "" : "disabled"}>START GAME</button>` : ""}<div class="NetMessageR98">${Escape(Message)}</div></div>${Settings}<button class="NetButtonR98 Danger" data-leave>LEAVE LOBBY</button>`;
}

function TitleForPage() {
  return Page === "login" ? "LOG IN" : Page === "create" ? "CREATE ACCOUNT" : Page === "switch" ? "SWITCH ACCOUNT" : Page === "multiplayer" ? "MULTIPLAYER" : Page === "createGame" ? "CREATE GAME" : Page === "lobby" ? "MULTIPLAYER LOBBY" : "PROFILE";
}

function Render() {
  const Current = State();
  if (!Current.account && !["login","create"].includes(Page)) Page = "login";
  if (Current.room && Page === "multiplayer") Page = "lobby";
  Title.textContent = TitleForPage();
  Back.style.visibility = ["login","profile"].includes(Page) ? "hidden" : "visible";
  Content.innerHTML = Page === "login" ? LoginMarkup() : Page === "create" ? CreateAccountMarkup() : Page === "switch" ? SwitchMarkup() : Page === "multiplayer" ? MultiplayerMarkup() : Page === "createGame" ? CreateGameMarkup() : Page === "lobby" ? LobbyMarkup() : ProfileMarkup();
  BindPage();
  if (Busy) Content.querySelectorAll("button,input,select").forEach(Element => Element.disabled = true);
  UpdateStatus();
  SyncStartButton();
}

async function RefreshServers() {
  if (Busy || !State().account) return;
  SetBusy(true);
  Message = "Checking available servers…";
  const Result = await Multiplayer.ListPublicRooms();
  PublicRooms = Result?.ok ? (Result.rooms || []) : [];
  Message = Result?.ok ? "" : ErrorText(Result);
  SetBusy(false);
  if (Page === "multiplayer") Render();
}

function BindPage() {
  Content.querySelector("[data-login]")?.addEventListener("submit", async Event => {
    Event.preventDefault(); if (Busy) return;
    const Data = new FormData(Event.currentTarget); SetBusy(true); Message = "Logging in…";
    const Result = await Multiplayer.Login(Data.get("username"), Data.get("password")); SetBusy(false);
    if (Result?.ok) { Page = "profile"; Message = "Logged in."; } else Message = ErrorText(Result); Render();
  });
  Content.querySelector("[data-create-page]")?.addEventListener("click", () => { Page = "create"; Message = ""; Render(); });
  Content.querySelector("[data-create-account]")?.addEventListener("submit", async Event => {
    Event.preventDefault(); if (Busy) return;
    const Data = new FormData(Event.currentTarget); const Password = String(Data.get("password") || ""); const Confirm = String(Data.get("confirm") || "");
    if (Password !== Confirm) { Message = Errors.PASSWORDS_DO_NOT_MATCH; return Render(); }
    SetBusy(true); Message = "Creating account…"; const Result = await Multiplayer.Register(Data.get("username"), Password, Confirm); SetBusy(false);
    if (Result?.ok) { Page = "profile"; Message = "Account created."; } else Message = ErrorText(Result); Render();
  });
  Content.querySelector("[data-multiplayer]")?.addEventListener("click", () => { Page = State().room ? "lobby" : "multiplayer"; Message = ""; PublicRooms = null; Render(); if (Page === "multiplayer") RefreshServers(); });
  Content.querySelector("[data-switch]")?.addEventListener("click", () => { Page = "switch"; Message = ""; Render(); });
  Content.querySelectorAll("[data-account]").forEach(Button => Button.addEventListener("click", async () => { if (Busy) return; SetBusy(true); Message = "Checking saved account…"; const Result = await Multiplayer.SwitchAccount(Button.dataset.account); SetBusy(false); if (Result?.ok) { Page = "profile"; Message = `Switched to ${Result.account.username}.`; } else Message = ErrorText(Result); Render(); }));
  Content.querySelector("[data-login-another]")?.addEventListener("click", () => { Page = "login"; Message = ""; Render(); });
  Content.querySelector("[data-logout]")?.addEventListener("click", async () => { if (Busy) return; SetBusy(true); await Multiplayer.Logout(); SetBusy(false); Page = "login"; Message = "Logged out."; Render(); });
  Content.querySelector("[data-refresh]")?.addEventListener("click", RefreshServers);
  Content.querySelector("[data-random]")?.addEventListener("click", async () => { if (Busy) return; SetBusy(true); Message = "Joining server…"; const Result = await Multiplayer.QuickJoin(); SetBusy(false); if (Result?.ok) { Page = "lobby"; Message = "Joined lobby."; } else Message = ErrorText(Result); Render(); });
  const Code = Content.querySelector("[data-code]");
  Code?.addEventListener("input", () => { const Clean = NormalizeCode(Code.value); if (Code.value !== Clean) Code.value = Clean; });
  Content.querySelector("[data-join]")?.addEventListener("submit", async Event => { Event.preventDefault(); if (Busy) return; const Data = new FormData(Event.currentTarget); const Clean = NormalizeCode(Data.get("code")); if (!Clean) return; SetBusy(true); Message = "Joining game…"; const Result = await Multiplayer.JoinRoom(Clean); SetBusy(false); if (Result?.ok) { Page = "lobby"; Message = "Joined lobby."; } else Message = ErrorText(Result); Render(); });
  Content.querySelector("[data-create-game]")?.addEventListener("click", () => { Page = "createGame"; Message = ""; Render(); });
  Content.querySelector("[data-create-game-form]")?.addEventListener("submit", async Event => { Event.preventDefault(); if (Busy) return; const Data = new FormData(Event.currentTarget); SetBusy(true); Message = "Creating lobby…"; const Result = await Multiplayer.CreateRoom({ maxPlayers: Data.get("maxPlayers"), allowLateJoin: Data.get("late") === "on", public: Data.get("public") === "on" }); SetBusy(false); if (Result?.ok) { Page = "lobby"; Message = "Lobby created. Waiting for another player."; } else Message = ErrorText(Result); Render(); });
  Content.querySelector("[data-settings]")?.addEventListener("submit", async Event => { Event.preventDefault(); if (Busy) return; const Data = new FormData(Event.currentTarget); SetBusy(true); const Result = await Multiplayer.UpdateRoomSettings({ maxPlayers: Data.get("maxPlayers"), allowLateJoin: Data.get("late") === "on", public: Data.get("public") === "on" }); SetBusy(false); Message = Result?.ok ? "Lobby settings saved." : ErrorText(Result); Render(); });
  Content.querySelector("[data-start]")?.addEventListener("click", async () => { if (Busy) return; SetBusy(true); Message = "Starting…"; const Result = await Multiplayer.StartRoom(); SetBusy(false); if (!Result?.ok) { Message = ErrorText(Result); Render(); } });
  Content.querySelector("[data-copy]")?.addEventListener("click", async () => { const CodeValue = NormalizeCode(State().room?.code); try { await navigator.clipboard.writeText(CodeValue); Message = "Game code copied."; } catch { Message = `Game code: ${CodeValue}`; } const Target = Content.querySelector(".NetMessageR98"); if (Target) Target.textContent = Message; });
  Content.querySelector("[data-leave]")?.addEventListener("click", async () => { if (Busy) return; SetBusy(true); await Multiplayer.LeaveRoom(); SetBusy(false); Page = "multiplayer"; PublicRooms = null; Message = "Left lobby."; Render(); });
}

function Open(Target = "profile") {
  const Current = State();
  Page = Current.account ? (Current.room && Target === "multiplayer" ? "lobby" : Target) : "login";
  Message = "";
  Overlay.classList.add("Open");
  Overlay.setAttribute("aria-hidden", "false");
  Render();
  if (Page === "multiplayer") RefreshServers();
}

function Close() {
  Overlay.classList.remove("Open");
  Overlay.setAttribute("aria-hidden", "true");
  Message = "";
}

function EnsureMainControls() {
  const Current = State();
  const Signature = `${Current.account?.id || "guest"}|${Current.account?.username || ""}|${Current.room?.code || ""}|${Current.room?.started || false}`;
  let Wrap = document.getElementById("MainNetworkControlsR98");
  if (!Wrap && StartButton?.parentElement) {
    Wrap = document.createElement("div"); Wrap.id = "MainNetworkControlsR98"; Wrap.className = "MainWrapR98"; StartButton.insertAdjacentElement("afterend", Wrap);
  }
  if (Wrap && Signature !== MainSignature) {
    MainSignature = Signature;
    Wrap.innerHTML = Current.account ? `<button class="MainProfileR98" data-main-profile>${Avatar()}<span class="NetInfoR98"><strong>${Escape(Current.account.username)}</strong><small>PROFILE & ACCOUNT SETTINGS</small></span><b>›</b></button><button class="MainNetR98 Wide Primary" data-main-multi>MULTIPLAYER</button>` : `<button class="MainNetR98" data-main-login>LOG IN</button><button class="MainNetR98" data-main-create>CREATE ACCOUNT</button>`;
    Wrap.querySelector("[data-main-profile]")?.addEventListener("click", () => Open("profile"));
    Wrap.querySelector("[data-main-login]")?.addEventListener("click", () => Open("login"));
    Wrap.querySelector("[data-main-create]")?.addEventListener("click", () => Open("create"));
    Wrap.querySelector("[data-main-multi]")?.addEventListener("click", () => Open("multiplayer"));
  }

  const RuntimeActions = document.querySelector("#RuntimeMainMenuR83 .RuntimeMenuActionsR84");
  if (RuntimeActions) {
    let ProfileButton = RuntimeActions.querySelector("[data-r98-profile]");
    if (!ProfileButton) { ProfileButton = document.createElement("button"); ProfileButton.type = "button"; ProfileButton.className = "RuntimeNetR98"; ProfileButton.dataset.r98Profile = "1"; RuntimeActions.appendChild(ProfileButton); }
    ProfileButton.textContent = Current.account ? `PROFILE • ${Current.account.username}` : "LOG IN / CREATE ACCOUNT";
    ProfileButton.onclick = () => Open(Current.account ? "profile" : "login");
    let MultiButton = RuntimeActions.querySelector("[data-r98-multi]");
    if (!MultiButton) { MultiButton = document.createElement("button"); MultiButton.type = "button"; MultiButton.className = "RuntimeNetR98"; MultiButton.dataset.r98Multi = "1"; RuntimeActions.appendChild(MultiButton); }
    MultiButton.textContent = "MULTIPLAYER";
    MultiButton.onclick = () => Open("multiplayer");
  }
}

function SyncStartButton() {
  if (!StartButton) return;
  const Room = State().room;
  if (Room && !Room.started) {
    StartButton.dataset.NetworkR98 = "1";
    StartButton.disabled = true;
    StartButton.textContent = Number(Room.playerCount || 0) >= 2 ? "START FROM MULTIPLAYER LOBBY" : "WAITING FOR ANOTHER PLAYER";
  } else if (StartButton.dataset.NetworkR98) {
    delete StartButton.dataset.NetworkR98;
    StartButton.textContent = "ENTER THE STORE";
    if (window.__STORE_BOOTSTRAP_BUILD__) StartButton.disabled = false;
  }
}

async function EnterMultiplayer() {
  if (StartTransitioning) return;
  StartTransitioning = true;
  Close();
  for (let Attempt = 0; Attempt < 40; Attempt += 1) {
    SyncStartButton();
    if (!BootScreen?.classList.contains("ScreenVisible")) break;
    if (StartButton && !StartButton.disabled) { StartButton.click(); break; }
    await new Promise(Resolve => setTimeout(Resolve, 75));
  }
  StartTransitioning = false;
}

function LobbyStateSignature() {
  const Current = State();
  const Room = Current.room;
  if (!Room) return "none";
  const Players = (Current.players || []).map(Item => `${Item.id || ""}:${Item.userId || ""}:${Item.name || ""}`).sort().join("|");
  return `${Room.code}|${Room.playerCount}|${Room.maxPlayers}|${Room.started}|${Room.allowLateJoin}|${Room.public}|${Room.hostUserId}|${Players}`;
}

addEventListener("store-network-change", () => { UpdateStatus(); EnsureMainControls(); });
addEventListener("store-account-change", () => { MainSignature = ""; EnsureMainControls(); if (Overlay.classList.contains("Open")) Render(); });
addEventListener("store-room-change", () => {
  MainSignature = ""; EnsureMainControls(); SyncStartButton();
  if (Page === "lobby" && Overlay.classList.contains("Open")) {
    const Signature = LobbyStateSignature();
    if (Signature !== LobbySignature) { LobbySignature = Signature; Render(); }
  }
});
addEventListener("store-multiplayer-start", EnterMultiplayer);
addEventListener("keydown", Event => { if (Event.code === "Escape" && Overlay.classList.contains("Open")) { Event.preventDefault(); Event.stopImmediatePropagation(); Close(); } }, true);
Overlay.querySelector("[data-close]").addEventListener("click", Close);
Back.addEventListener("click", () => {
  if (Page === "lobby") Page = State().room ? "lobby" : "multiplayer";
  else if (["createGame"].includes(Page)) Page = "multiplayer";
  else if (["switch","multiplayer"].includes(Page)) Page = "profile";
  else if (Page === "create") Page = "login";
  Render();
});

UpdateStatus();
EnsureMainControls();
window.__STORE_MULTIPLAYER_UI_R98__ = { Open, Close, Render, RefreshServers, NormalizeCode };
window.__STORE_MULTIPLAYER_UI_R93__ = window.__STORE_MULTIPLAYER_UI_R98__;
window.__STORE_MULTIPLAYER_UI_BUILD__ = "V0.30.5-R98";
