try {
  await import("./world-enhancements-r13.js?v=20260823-22");
} catch (PrimaryWorldError) {
  console.warn("Fresh world enhancements module failed, trying legacy path.", PrimaryWorldError);
  try {
    await import("./world-enhancements.js?v=20260823-22");
  } catch (LegacyWorldError) {
    console.warn("World enhancements unavailable; continuing game boot without them.", LegacyWorldError);
  }
}

await import("./player-controller.js?v=20260823-22");
await import("./player-system-r24.js?v=20260823-22");
await import("./first-person-arm-render-r27.js?v=20260823-22");
await import("./game.js?v=20260823-22");
await import("./task-visual-fix.js?v=20260823-22");
await import("./runtime-fixes.js?v=20260823-22");
await import("./precision-collision-v2.js?v=20260823-22");
await import("./collision-cleanup.js?v=20260823-22");
await import("./sign-fix.js?v=20260823-22");
await import("./price-signs.js?v=20260823-22");
await import("./performance-manager.js?v=20260823-22");