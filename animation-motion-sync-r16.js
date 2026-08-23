const Player = window.__STORE_PLAYER__;
const BasePlayer = window.__STORE_BASE_PLAYER__;

if (!Player || !BasePlayer) throw new Error("Player systems must load before animation motion sync.");

function GetMovementSpeed(WantsSprint, Moving) {
  const Speed = Player.GetMovementSpeed?.(WantsSprint, Moving) ?? 3.45;
  BasePlayer.GetMovementSpeed?.(false, Moving);
  return Speed;
}

window.__STORE_PLAYER__ = {
  ...Player,
  GetMovementSpeed
};

window.__STORE_ANIMATION_MOTION_SYNC_BUILD__ = "V0.11-R16";
