try {
  await import("./world-enhancements-r13.js?v=20260823-30");
} catch (PrimaryWorldError) {
  console.warn("Fresh world enhancements module failed, trying legacy path.", PrimaryWorldError);
  try {
    await import("./world-enhancements.js?v=20260823-30");
  } catch (LegacyWorldError) {
    console.warn("World enhancements unavailable; continuing game boot without them.", LegacyWorldError);
  }
}

await import("./inventory-preload-r35.js?v=20260823-30");
await import("./player-controller.js?v=20260823-30");
await import("./player-system-r24.js?v=20260823-30");
await import("./first-person-fullbody-r32.js?v=20260823-30");
await import("./first-person-walk-bob-r33.js?v=20260823-30");
await import("./game.js?v=20260823-30");
await import("./task-visual-fix.js?v=20260823-30");
await import("./runtime-fixes.js?v=20260823-30");
await import("./precision-collision-r35.js?v=20260823-30");
await import("./collision-cleanup.js?v=20260823-30");
await import("./sign-fix.js?v=20260823-30");
await import("./price-signs-r35.js?v=20260823-30");
await import("./performance-manager.js?v=20260823-30");