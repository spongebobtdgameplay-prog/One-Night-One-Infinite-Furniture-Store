try {
  await import("./world-enhancements-r13.js?v=20260823-13");
} catch (PrimaryWorldError) {
  console.warn("Fresh world enhancements module failed, trying legacy path.", PrimaryWorldError);
  try {
    await import("./world-enhancements.js?v=20260823-13");
  } catch (LegacyWorldError) {
    console.warn("World enhancements unavailable; continuing game boot without them.", LegacyWorldError);
  }
}

await import("./player-controller.js?v=20260823-13");
await import("./base-animation-owner-r16.js?v=20260823-13");
await import("./player-system-r15.js?v=20260823-13");
await import("./stable-eye-camera-r18.js?v=20260823-13");
await import("./animation-motion-sync-r16.js?v=20260823-13");
await import("./game.js?v=20260823-13");
await import("./task-visual-fix.js?v=20260823-13");
await import("./runtime-fixes.js?v=20260823-13");
await import("./precision-collision-v2.js?v=20260823-13");
await import("./collision-cleanup.js?v=20260823-13");
await import("./sign-fix.js?v=20260823-13");
await import("./price-signs.js?v=20260823-13");
await import("./performance-manager.js?v=20260823-13");
