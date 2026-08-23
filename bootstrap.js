await import("./loading-prewarm-r38.js?v=20260823-33");

try {
  await import("./world-enhancements-r13.js?v=20260823-33");
} catch (PrimaryWorldError) {
  console.warn("Fresh world enhancements module failed, trying legacy path.", PrimaryWorldError);
  try {
    await import("./world-enhancements.js?v=20260823-33");
  } catch (LegacyWorldError) {
    console.warn("World enhancements unavailable; continuing game boot without them.", LegacyWorldError);
  }
}

await import("./player-controller.js?v=20260823-33");
await import("./player-system-r24.js?v=20260823-33");
await import("./first-person-fullbody-r32.js?v=20260823-33");
await import("./first-person-walk-bob-r33.js?v=20260823-33");
await import("./game.js?v=20260823-34");
await import("./task-visual-fix.js?v=20260823-33");
await import("./runtime-fixes.js?v=20260823-33");
await import("./precision-collision-v2.js?v=20260823-33");
await import("./collision-cleanup.js?v=20260823-33");
await import("./sign-fix.js?v=20260823-33");
await import("./price-signs.js?v=20260823-33");
await import("./performance-manager.js?v=20260823-33");

const ReadyButton = document.getElementById("StartButton");
if (ReadyButton) {
  ReadyButton.disabled = false;
  ReadyButton.style.opacity = "";
  ReadyButton.style.cursor = "";
}
