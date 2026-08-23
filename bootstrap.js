await import("./inventory-preload-r35.js?v=20260823-31");
await import("./player-controller.js?v=20260823-31");
await import("./player-system-r24.js?v=20260823-31");
await import("./first-person-fullbody-r32.js?v=20260823-31");
await import("./first-person-walk-bob-r33.js?v=20260823-31");
await import("./game.js?v=20260823-31");

const ReadyButton = document.getElementById("StartButton");
if (ReadyButton) ReadyButton.disabled = false;

await import("./streaming-optimizer-r36.js?v=20260823-31");
await import("./task-visual-fix.js?v=20260823-31");
await import("./runtime-fixes.js?v=20260823-31");
await import("./precision-collision-r35.js?v=20260823-31");
await import("./collision-cleanup.js?v=20260823-31");
await import("./sign-fix.js?v=20260823-31");
await import("./price-signs-r36.js?v=20260823-31");
await import("./performance-manager-r36.js?v=20260823-31");
