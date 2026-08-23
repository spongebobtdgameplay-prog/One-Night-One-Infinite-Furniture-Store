await import("./loading-prewarm-r38.js?v=20260823-33");

try {
  await import("./world-enhancements-r42.js?v=20260823-37");
} catch (WorldError) {
  console.warn("R42 world enhancements unavailable; continuing without them.", WorldError);
}

await import("./player-controller.js?v=20260823-33");
await import("./player-system-r24.js?v=20260823-33");
await import("./sprint-animation-rate-r40.js?v=20260823-35");
await import("./menu-settings-r42.js?v=20260823-37");
await import("./camera-input-r42.js?v=20260823-37");
await import("./first-person-fullbody-r32.js?v=20260823-33");
await import("./first-person-walk-bob-r33.js?v=20260823-33");
await import("./game.js?v=20260823-34");
await import("./task-visual-fix.js?v=20260823-33");
await import("./runtime-fixes.js?v=20260823-33");
await import("./precision-collision-r42.js?v=20260823-37");
await import("./collision-cleanup.js?v=20260823-33");
await import("./sign-fix-r42.js?v=20260823-37");
await import("./price-signs-r42.js?v=20260823-37");
await import("./performance-manager-r42.js?v=20260823-37");
await import("./fps-counter-r42.js?v=20260823-37");

const ReadyButton = document.getElementById("StartButton");
if (ReadyButton) {
  ReadyButton.disabled = false;
  ReadyButton.style.opacity = "";
  ReadyButton.style.cursor = "";
}
