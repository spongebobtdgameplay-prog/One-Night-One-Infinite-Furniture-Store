import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const NativeLock = PointerLockControls.prototype.lock;
const NativeUnlock = PointerLockControls.prototype.unlock;

window.__STORE_NATIVE_POINTER_LOCK__ = {
  Lock: NativeLock,
  Unlock: NativeUnlock
};

PointerLockControls.prototype.lock = function VisibleCursorSoftLock() {
  const WasLocked = this.isLocked;
  this.enabled = false;
  this.isLocked = true;
  if (!WasLocked) {
    try { this.dispatchEvent({ type: "lock" }); } catch {}
  }
};

PointerLockControls.prototype.unlock = function VisibleCursorSoftUnlock() {
  const WasLocked = this.isLocked;
  this.enabled = false;
  this.isLocked = false;
  if (document.pointerLockElement) {
    try { document.exitPointerLock(); } catch {}
  }
  if (WasLocked) {
    try { this.dispatchEvent({ type: "unlock" }); } catch {}
  }
};

window.__STORE_VISIBLE_POINTER_PRE_BUILD__ = "V0.12.17";
