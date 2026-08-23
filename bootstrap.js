await import("./inventory-preload-r35.js?v=20260823-32");
await import("./player-controller.js?v=20260823-32");
await import("./player-system-r24.js?v=20260823-32");
await import("./first-person-fullbody-r32.js?v=20260823-32");
await import("./first-person-walk-bob-r33.js?v=20260823-32");
await import("./game.js?v=20260823-32");

const ReadyButton = document.getElementById("StartButton");
if (ReadyButton) ReadyButton.disabled = false;

await import("./streaming-optimizer-r37.js?v=20260823-32");
await import("./task-visual-fix.js?v=20260823-32");
await import("./runtime-fixes.js?v=20260823-32");
await import("./precision-collision-r35.js?v=20260823-32");
await import("./collision-cleanup.js?v=20260823-32");
await import("./sign-fix.js?v=20260823-32");
await import("./price-signs-r36.js?v=20260823-32");
await import("./performance-manager-r37.js?v=20260823-32");
