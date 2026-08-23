try {
  await import("./world-enhancements-r13.js?v=20260823-15");
} catch (PrimaryWorldError) {
  console.warn("Fresh world enhancements module failed, trying legacy path.", PrimaryWorldError);
  try {
    await import("./world-enhancements.js?v=20260823-15");
  } catch (LegacyWorldError) {
    console.warn("World enhancements unavailable; continuing game boot without them.", LegacyWorldError);
  }
}

await import("./player-controller.js?v=20260823-15");
await import("./base-animation-owner-r16.js?v=20260823-15");
await import("./player-system-r15.js?v=20260823-15");
await import("./animation-motion-sync-r16.js?v=20260823-15");
await import("./game.js?v=20260823-15");
await import("./task-visual-fix.js?v=20260823-15");
await import("./runtime-fixes.js?v=20260823-15");
await import("./precision-collision-v2.js?v=20260823-15");
await import("./collision-cleanup.js?v=20260823-15");
await import("./sign-fix.js?v=20260823-15");
await import("./price-signs.js?v=20260823-15");
await import("./performance-manager.js?v=20260823-15");
