  Element.textContent = Message || "";
  Element.classList.toggle("Error", Boolean(Error));
}

function SetAccountMode(Mode) {
  AccountMode = Mode === "create" ? "create" : "login";
  for (const Tab of AccountOverlay.querySelectorAll("[data-account-tab]")) {
    Tab.classList.toggle("Active", Tab.dataset.accountTab === AccountMode);
  }
  AccountRepeatWrap.hidden = AccountMode !== "create";
  AccountPassword.setAttribute("autocomplete", AccountMode === "create" ? "new-password" : "one-time-code");
  AccountPassword.name = AccountMode === "create" ? "infinity-store-new-secret-v2" : "infinity-store-login-secret-v2";
  AccountSubmit.textContent = AccountMode === "create" ? "CREATE ACCOUNT" : "LOGIN";
  AccountRepeat.value = "";
  SetMessage(AccountStatus, "");
}

function ShowAccountStep(Name) {
  AccountChooser.hidden = Name !== "chooser";
  QuickAccount.hidden = Name !== "quick";
  ManualAccount.hidden = Name !== "manual";
}

function GetChooserAccounts() {
  const Excluded = String(AccountChooserExcludedName || "").toLowerCase();
  return ReadSavedAccounts().filter(Name => !Excluded || Name.toLowerCase() !== Excluded);
}

function RenderAccountChoices(Accounts = GetChooserAccounts()) {
  AccountChoices.replaceChildren();
  for (const Name of Accounts) {
    const Button = document.createElement("button");
    Button.type = "button";
    Button.className = "StoreAccountChoice";
    Button.dataset.accountName = Name;
    const Label = document.createElement("strong");
    Label.textContent = Name;
    const Continue = document.createElement("span");
    Continue.textContent = "CONTINUE";
    Button.append(Label, Continue);
    Button.addEventListener("click", () => {
      SelectedAccountName = Name;
      QuickAccountName.textContent = Name;
      QuickPassword.value = "";
      SetMessage(QuickStatus, "");
      ShowAccountStep("quick");
      requestAnimationFrame(() => QuickPassword.focus());
    });
    AccountChoices.appendChild(Button);
  }
}

function ShowManualAccount(Mode = "login", Message = "") {
  SelectedAccountName = "";
  SetAccountMode(Mode);
  AccountUsername.value = "";
  AccountPassword.value = "";
  AccountRepeat.value = "";
  document.getElementById("StoreManualBack").hidden = GetChooserAccounts().length === 0;
  SetMessage(AccountStatus, Message);
  ShowAccountStep("manual");
  requestAnimationFrame(() => AccountUsername.focus());
}

function ShowAccountChooser(Message = "") {
  const Accounts = GetChooserAccounts();
  if (!Accounts.length) {
    ShowManualAccount("login", Message);
    return;
  }
  RenderAccountChoices(Accounts);
  SelectedAccountName = "";
  QuickPassword.value = "";
  AccountPassword.value = "";
  AccountRepeat.value = "";
  ShowAccountStep("chooser");
  SetMessage(AccountChooserStatus, Message);
}

function ShowOutdated() {
  AccountOverlay.hidden = false;
  AccountNormal.hidden = true;
  AccountOutdated.hidden = false;
  SetStatus("outdated");
}

function ShowAccountScreen(Message = "", ExcludedName = "") {
  AccountChooserExcludedName = String(ExcludedName || "");
  AccountOverlay.hidden = false;
  AccountNormal.hidden = false;
  AccountOutdated.hidden = true;
  ShowAccountChooser(Message);
}

function HideAccountScreen() {
  AccountOverlay.hidden = true;
}

function RenderNetworkStatus() {
  const ProfileConnection = document.getElementById("StoreProfileConnection");
  if (ProfileConnection) {
    ProfileConnection.textContent = Socket?.connected ? "ONLINE" : Status === "outdated" ? "SESSION OUTDATED" : "RECONNECTING";
  }
}

function RenderProfile() {
  document.getElementById("StoreProfileName").textContent = Account?.username || "PLAYER";
  document.getElementById("StoreProfileGames").textContent = String(Profile?.games_played ?? 0);
  document.getElementById("StoreProfileTasks").textContent = String(Profile?.tasks_completed ?? 0);
  document.getElementById("StoreProfileAisle").textContent = String(Profile?.best_aisle ?? 0);
  RenderNetworkStatus();
}

function ResetSharedRoomState() {
  SharedCompletedTasks.clear();
  PendingCompletedTasks.clear();
  Sequence = 0;
  LastSendAt = 0;
  HasLastSentPosition = false;
  LastAisleReport = 0;
  Game?.ResetTaskProgress?.();
}

function ClearRoomState() {
  const HadRoom = Boolean(CurrentRoom?.code || DesiredRoomCode);
  if (HadRoom) ResetSharedRoomState();
  else {
    SharedCompletedTasks.clear();
    PendingCompletedTasks.clear();
    Sequence = 0;
    LastSendAt = 0;
    HasLastSentPosition = false;
    LastAisleReport = 0;
  }
  CurrentRoom = null;
  CurrentRoomServerTime = 0;
  CurrentPlayers = [];
  SaveDesiredRoom("");
  RemoveAllRemotePlayers();
  RenderLobby();
  Dispatch("store-room-change", GetState());
}

async function RefreshAccount() {
  if (!SessionToken) return { ok: false, error: "AUTH_REQUIRED" };
  const Result = await Api("/api/auth/me", { timeout: SERVER_WAKE_TIMEOUT_MS });
  if (!Result?.ok) {
    if (Result?.error === "AUTH_REQUIRED") {
      StoreSession("");
      Account = null;
      Profile = null;
      DisconnectSocket();
      ClearRoomState();
      Dispatch("store-account-change", GetState());
    }
    return Result;
  }
  Account = Result.account;
  Profile = Result.profile;
  ApplyProfileSettings();
  SaveAccountName(Account.username);
  Dispatch("store-account-change", GetState());
  RenderProfile();
  MountNavigation();
  return Result;
}

function FinishAuthentication() {
  if (!Account) return;
  AccountChooserExcludedName = "";
  ApplyProfileSettings();
  SaveAccountName(Account.username);
  HideAccountScreen();
  Dispatch("store-account-change", GetState());
  RenderProfile();
  MountNavigation();
  ConnectSocket().catch(() => {});
  if (!AccountGateResolved) {
    AccountGateResolved = true;
    ResolveAccountGate?.({ ok: true, account: Account, profile: Profile });
  }
}

async function Login(Username, Password) {
  const UsernameError = ValidateClientUsername(Username);
  const PasswordError = ValidateClientPassword(Password);
  if (UsernameError) return { ok: false, error: UsernameError };
  if (PasswordError) return { ok: false, error: PasswordError };

  SetStatus("authenticating");
  const Result = await Api("/api/auth/login", {
    method: "POST",
    auth: false,
    timeout: SERVER_WAKE_TIMEOUT_MS,
    body: { username: String(Username).trim(), password: String(Password) }
  });
  if (!Result?.ok) {
    SetStatus(Account ? "online" : "offline");
    return Result;
  }

  DisconnectSocket();
  StoreSession(Result.token);