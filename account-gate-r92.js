const SERVER_URL = "https://the-infinity-store-vh88.onrender.com";
const ACCOUNTS_KEY = "InfinityStoreSavedAccountsV2";
const ACTIVE_ACCOUNT_KEY = "InfinityStoreActiveAccountV2";
const LEGACY_TOKEN_KEY = "InfinityStoreSessionV1";

const Gate = document.getElementById("AccountGateR92");
const Title = Gate?.querySelector("[data-gate-title]");
const Subtitle = Gate?.querySelector("[data-gate-subtitle]");
const Content = Gate?.querySelector("[data-gate-content]");
const Status = Gate?.querySelector("[data-gate-status]");

let ResolveGate;
let CurrentPage = "home";
let Message = "";
let Busy = false;
let ActiveAccount = null;
let ActiveProfile = null;
let SavedAccounts = LoadSavedAccounts();

window.__STORE_ACCOUNT_GATE_PROMISE__ = new Promise(Resolve => {
  ResolveGate = Resolve;
});

function LoadSavedAccounts() {
  try {
    const Parsed = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
    if (!Array.isArray(Parsed)) return [];
    return Parsed.filter(Item => Item && typeof Item.userId === "string" && typeof Item.username === "string" && typeof Item.token === "string");
  } catch {
    return [];
  }
}

function SaveSavedAccounts() {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(SavedAccounts.slice(0, 8)));
}

function SaveAccount(Account, Token) {
  if (!Account?.id || !Token) return;
  SavedAccounts = SavedAccounts.filter(Item => Item.userId !== Account.id);
  SavedAccounts.unshift({ userId: Account.id, username: Account.username, token: String(Token), lastUsedAt: Date.now() });
  SaveSavedAccounts();
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, Account.id);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

function RemoveSavedAccount(UserId) {
  SavedAccounts = SavedAccounts.filter(Item => Item.userId !== UserId);
  SaveSavedAccounts();
  if (localStorage.getItem(ACTIVE_ACCOUNT_KEY) === UserId) localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
}

function Esc(Value) {
  return String(Value ?? "").replace(/[&<>'"]/g, Character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[Character]);
}

function ProfileIcon() {
  return `<span class="AccountAvatarR92" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 11.15a3.35 3.35 0 1 0 0-6.7 3.35 3.35 0 0 0 0 6.7Zm0 2.15c-4.2 0-7 2.15-7 5.35 0 .62.5 1.12 1.12 1.12h11.76c.62 0 1.12-.5 1.12-1.12 0-3.2-2.8-5.35-7-5.35Z"/></svg></span>`;
}

async function Api(Path, Options = {}) {
  const Controller = new AbortController();
  const Timer = setTimeout(() => Controller.abort(), 12_000);
  try {
    const Headers = { "Content-Type": "application/json" };
    if (Options.token) Headers.Authorization = `Bearer ${Options.token}`;
    const Response = await fetch(`${SERVER_URL}${Path}`, {
      method: Options.method || "GET",
      headers: Headers,
      body: Options.body === undefined ? undefined : JSON.stringify(Options.body),
      signal: Controller.signal,
      cache: "no-store"
    });
    let Data;
    try { Data = await Response.json(); }
    catch { Data = { ok: false, error: "INVALID_SERVER_RESPONSE" }; }
    if (!Response.ok && !Data?.error) Data.error = `HTTP_${Response.status}`;
    return Data;
  } catch (Error) {
    return { ok: false, error: Error?.name === "AbortError" ? "SERVER_TIMEOUT" : "SERVER_UNREACHABLE" };
  } finally {
    clearTimeout(Timer);
  }
}

const ErrorMessages = {
  USERNAME_LENGTH: "Username must be 3–20 characters.",
  USERNAME_CHARACTERS: "Username can use letters, numbers, and underscores only.",
  USERNAME_TAKEN: "That username is already taken.",
  PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",
  PASSWORD_TOO_LONG: "Password can be at most 20 characters.",
  PASSWORD_ASCII_ONLY: "Password can use standard keyboard characters only.",
  PASSWORDS_DO_NOT_MATCH: "The two passwords do not match.",
  INVALID_LOGIN: "Username or password is incorrect.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Wait a minute and try again.",
  SERVER_TIMEOUT: "The account server took too long to answer.",
  SERVER_UNREACHABLE: "The account server could not be reached.",
  AUTH_REQUIRED: "That saved login expired. Log in again."
};

function FriendlyError(Result) {
  return ErrorMessages[Result?.error] || String(Result?.error || "Something went wrong.").replaceAll("_", " ");
}

function SetBusy(Value, Text = "") {
  Busy = Boolean(Value);
  if (Status) Status.textContent = Text;
  Content?.querySelectorAll("button,input").forEach(Element => Element.disabled = Busy);
}

function HomeMarkup() {
  if (ActiveAccount) {
    return `
      <button class="AccountProfileCardR92" type="button" data-profile>
        ${ProfileIcon()}
        <span class="AccountProfileTextR92"><strong>${Esc(ActiveAccount.username)}</strong><small>Signed in • account ready</small></span>
        <span class="AccountChevronR92">›</span>
      </button>
      <button class="AccountGateButtonR92 Primary" type="button" data-continue>CONTINUE</button>
      <div class="AccountGateSplitR92">
        <button class="AccountGateButtonR92" type="button" data-switch>SWITCH ACCOUNT</button>
        <button class="AccountGateButtonR92" type="button" data-logout>LOG OUT</button>
      </div>
      <div class="AccountGateMessageR92">${Esc(Message)}</div>`;
  }
  return `
    <div class="AccountGateChoiceR92">
      <button class="AccountGateButtonR92 Primary" type="button" data-login>LOG IN</button>
      <button class="AccountGateButtonR92" type="button" data-create>CREATE ACCOUNT</button>
    </div>
    ${SavedAccounts.length ? `<button class="AccountSavedShortcutR92" type="button" data-switch>${SavedAccounts.length} SAVED ACCOUNT${SavedAccounts.length === 1 ? "" : "S"} ON THIS DEVICE</button>` : ""}
    <button class="AccountGuestR92" type="button" data-guest>CONTINUE WITHOUT AN ACCOUNT</button>
    <div class="AccountGateMessageR92">${Esc(Message)}</div>`;
}

function LoginMarkup() {
  return `
    <form class="AccountGateFormR92" data-login-form>
      <label>USERNAME<input name="username" minlength="3" maxlength="20" autocomplete="username" required></label>
      <label>PASSWORD<input name="password" type="password" minlength="8" maxlength="20" autocomplete="current-password" required></label>
      <button class="AccountGateButtonR92 Primary" type="submit">LOG IN</button>
    </form>
    <button class="AccountGateBackR92" type="button" data-back>← BACK</button>
    <div class="AccountGateMessageR92">${Esc(Message)}</div>`;
}

function CreateMarkup() {
  return `
    <form class="AccountGateFormR92" data-create-form>
      <label>USERNAME<input name="username" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" autocomplete="username" required></label>
      <label>PASSWORD<input name="password" type="password" minlength="8" maxlength="20" autocomplete="new-password" required></label>
      <label>RETYPE PASSWORD<input name="confirm" type="password" minlength="8" maxlength="20" autocomplete="new-password" required></label>
      <button class="AccountGateButtonR92 Primary" type="submit">CREATE ACCOUNT</button>
    </form>
    <button class="AccountGateBackR92" type="button" data-back>← BACK</button>
    <div class="AccountGateMessageR92">${Esc(Message)}</div>`;
}

function SwitchMarkup() {
  const Rows = SavedAccounts
    .sort((A, B) => Number(B.lastUsedAt || 0) - Number(A.lastUsedAt || 0))
    .map(Account => `
      <button class="AccountSavedR92" type="button" data-account="${Esc(Account.userId)}">
        ${ProfileIcon()}
        <span><strong>${Esc(Account.username)}</strong><small>Verify with server and switch</small></span>
        <b>›</b>
      </button>`).join("");
  return `
    <div class="AccountSavedListR92">${Rows || `<div class="AccountEmptyR92">No saved accounts on this device.</div>`}</div>
    <button class="AccountGateButtonR92" type="button" data-login>LOG IN TO ANOTHER ACCOUNT</button>
    <button class="AccountGateBackR92" type="button" data-back>← BACK</button>
    <div class="AccountGateMessageR92">${Esc(Message)}</div>`;
}

function ProfileMarkup() {
  const Profile = ActiveProfile || {};
  return `
    <div class="AccountProfileHeroR92">
      ${ProfileIcon()}
      <div><strong>${Esc(ActiveAccount?.username || "ACCOUNT")}</strong><small>Infinity Store profile</small></div>
    </div>
    <div class="AccountProfileStatsR92">
      <div><strong>${Number(Profile.games_played || 0)}</strong><span>GAMES</span></div>
      <div><strong>${Number(Profile.tasks_completed || 0)}</strong><span>TASKS</span></div>
      <div><strong>${Number(Profile.best_aisle || 0)}</strong><span>BEST AISLE</span></div>
    </div>
    <button class="AccountGateButtonR92 Primary" type="button" data-continue>CONTINUE</button>
    <div class="AccountGateSplitR92"><button class="AccountGateButtonR92" type="button" data-switch>SWITCH ACCOUNT</button><button class="AccountGateButtonR92" type="button" data-logout>LOG OUT</button></div>
    <button class="AccountGateBackR92" type="button" data-back>← BACK</button>`;
}

function Render() {
  if (!Gate || !Content) return;
  const Titles = {
    home: ["WHO'S PLAYING?", "Choose your account before the store loads."],
    login: ["LOG IN", "Connect to your Infinity Store account."],
    create: ["CREATE ACCOUNT", "Create your account before entering the store."],
    switch: ["SWITCH ACCOUNT", "Saved accounts are still verified with the server."],
    profile: ["PROFILE", "Your account is ready."]
  };
  const [Heading, Subheading] = Titles[CurrentPage] || Titles.home;
  if (Title) Title.textContent = Heading;
  if (Subtitle) Subtitle.textContent = Subheading;
  Content.innerHTML = CurrentPage === "login" ? LoginMarkup() : CurrentPage === "create" ? CreateMarkup() : CurrentPage === "switch" ? SwitchMarkup() : CurrentPage === "profile" ? ProfileMarkup() : HomeMarkup();
  Bind();
  if (Busy) Content.querySelectorAll("button,input").forEach(Element => Element.disabled = true);
}

function Finish(Mode) {
  if (!Gate || Gate.dataset.finishing === "1") return;
  Gate.dataset.finishing = "1";
  Gate.classList.add("Leaving");
  setTimeout(() => {
    Gate.remove();
    ResolveGate?.({ mode: Mode, account: ActiveAccount });
    window.dispatchEvent(new CustomEvent("store-account-gate-complete", { detail: { mode: Mode, account: ActiveAccount } }));
  }, 180);
}

async function VerifySavedAccount(UserId) {
  const Saved = SavedAccounts.find(Item => Item.userId === UserId);
  if (!Saved) return { ok: false, error: "AUTH_REQUIRED" };
  SetBusy(true, "CHECKING ACCOUNT WITH SERVER…");
  const Result = await Api("/api/auth/me", { token: Saved.token });
  if (!Result?.ok) {
    RemoveSavedAccount(Saved.userId);
    SetBusy(false, "");
    return Result;
  }
  ActiveAccount = Result.account;
  ActiveProfile = Result.profile;
  SaveAccount(ActiveAccount, Saved.token);
  SetBusy(false, "ACCOUNT VERIFIED");
  return Result;
}

async function Login(Username, Password) {
  SetBusy(true, "LOGGING IN…");
  const Result = await Api("/api/auth/login", { method: "POST", body: { username: Username, password: Password } });
  if (!Result?.ok) {
    SetBusy(false, "");
    return Result;
  }
  SaveAccount(Result.account, Result.token);
  ActiveAccount = Result.account;
  const Me = await Api("/api/auth/me", { token: Result.token });
  if (Me?.ok) ActiveProfile = Me.profile;
  SetBusy(false, "ACCOUNT READY");
  return Result;
}

async function CreateAccount(Username, Password, Confirm) {
  if (Password !== Confirm) return { ok: false, error: "PASSWORDS_DO_NOT_MATCH" };
  SetBusy(true, "CREATING ACCOUNT…");
  const Result = await Api("/api/auth/register", { method: "POST", body: { username: Username, password: Password, confirmPassword: Confirm } });
  if (!Result?.ok) {
    SetBusy(false, "");
    return Result;
  }
  SaveAccount(Result.account, Result.token);
  ActiveAccount = Result.account;
  const Me = await Api("/api/auth/me", { token: Result.token });
  if (Me?.ok) ActiveProfile = Me.profile;
  SetBusy(false, "ACCOUNT CREATED");
  return Result;
}

async function LogoutActive() {
  const Saved = SavedAccounts.find(Item => Item.userId === ActiveAccount?.id);
  if (Saved?.token) await Api("/api/auth/logout", { method: "POST", token: Saved.token, body: {} });
  if (ActiveAccount?.id) RemoveSavedAccount(ActiveAccount.id);
  ActiveAccount = null;
  ActiveProfile = null;
  CurrentPage = "home";
  Message = "Logged out.";
  if (Status) Status.textContent = "";
  Render();
}

function Bind() {
  Content.querySelector("[data-login]")?.addEventListener("click", () => { CurrentPage = "login"; Message = ""; Render(); });
  Content.querySelector("[data-create]")?.addEventListener("click", () => { CurrentPage = "create"; Message = ""; Render(); });
  Content.querySelector("[data-switch]")?.addEventListener("click", () => { CurrentPage = "switch"; Message = ""; Render(); });
  Content.querySelector("[data-profile]")?.addEventListener("click", () => { CurrentPage = "profile"; Message = ""; Render(); });
  Content.querySelector("[data-back]")?.addEventListener("click", () => { CurrentPage = "home"; Message = ""; Render(); });
  Content.querySelector("[data-continue]")?.addEventListener("click", () => Finish("account"));
  Content.querySelector("[data-guest]")?.addEventListener("click", () => Finish("guest"));
  Content.querySelector("[data-logout]")?.addEventListener("click", LogoutActive);

  Content.querySelector("[data-login-form]")?.addEventListener("submit", async Event => {
    Event.preventDefault();
    const Data = new FormData(Event.currentTarget);
    const Result = await Login(Data.get("username"), Data.get("password"));
    Message = Result?.ok ? "Logged in." : FriendlyError(Result);
    if (Result?.ok) CurrentPage = "home";
    Render();
  });

  Content.querySelector("[data-create-form]")?.addEventListener("submit", async Event => {
    Event.preventDefault();
    const Data = new FormData(Event.currentTarget);
    const Result = await CreateAccount(Data.get("username"), String(Data.get("password") || ""), String(Data.get("confirm") || ""));
    Message = Result?.ok ? "Account created." : FriendlyError(Result);
    if (Result?.ok) CurrentPage = "home";
    Render();
  });

  Content.querySelectorAll("[data-account]").forEach(Button => Button.addEventListener("click", async () => {
    const Result = await VerifySavedAccount(Button.dataset.account);
    Message = Result?.ok ? `Switched to ${Result.account.username}.` : FriendlyError(Result);
    CurrentPage = Result?.ok ? "home" : "switch";
    Render();
  }));
}

async function RestorePreferredAccount() {
  const PreferredId = localStorage.getItem(ACTIVE_ACCOUNT_KEY) || "";
  const Preferred = SavedAccounts.find(Item => Item.userId === PreferredId) || SavedAccounts[0];
  if (!Preferred) {
    if (Status) Status.textContent = "CHOOSE HOW TO CONTINUE";
    Render();
    return;
  }
  Render();
  const Result = await VerifySavedAccount(Preferred.userId);
  if (Result?.ok) {
    Message = "Welcome back.";
    CurrentPage = "home";
  } else {
    Message = FriendlyError(Result);
    CurrentPage = SavedAccounts.length ? "switch" : "home";
  }
  Render();
}

if (!Gate || !Content) {
  ResolveGate?.({ mode: "guest", account: null });
} else {
  Render();
  RestorePreferredAccount();
}

window.__STORE_ACCOUNT_GATE_R92__ = {
  GetAccount: () => ActiveAccount,
  GetProfile: () => ActiveProfile,
  Open(Page = "home") {
    if (!document.body.contains(Gate)) return;
    CurrentPage = Page;
    Render();
  }
};
window.__STORE_ACCOUNT_GATE_BUILD__ = "V0.27.0-R92";
