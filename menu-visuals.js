const NS = "http://www.w3.org/2000/svg";

function UpgradeMenuVisual() {
  const Old = document.querySelector(".R43Vector");
  if (!Old || Old.dataset.StoreUpgraded) return false;

  const Svg = document.createElementNS(NS, "svg");
  Svg.classList.add("R43Vector");
  Svg.dataset.StoreUpgraded = "1";
  Svg.setAttribute("viewBox", "0 0 520 330");
  Svg.setAttribute("aria-hidden", "true");
  Svg.innerHTML = `
    <path d="M30 290L230 125M490 290L290 125M85 290L242 125M435 290L278 125M145 290L251 125M375 290L269 125"/>
    <path d="M35 72L165 98L165 260L35 292M485 72L355 98L355 260L485 292"/>
    <path d="M50 110L150 126M50 158L150 162M50 206L150 198M50 250L150 234M470 110L370 126M470 158L370 162M470 206L370 198M470 250L370 234"/>
    <path d="M187 238C187 222 201 214 222 214H260C281 214 294 222 294 238V260H187ZM199 214V196C199 185 210 179 225 179H258C273 179 283 185 283 196V214M200 260V274M280 260V274"/>
    <path d="M319 226C319 209 333 198 351 198C369 198 382 209 382 226C382 242 369 252 351 252C333 252 319 242 319 226ZM351 252V279M335 279H367"/>
    <path d="M116 257L132 218H178L193 257M127 234H183M138 218V199H170V218"/>
    <path d="M310 161L327 130H355L372 161M341 130V92M327 92H355M333 90L341 78L349 90"/>
    <path d="M215 153L235 142H281L304 153L294 168H225ZM230 168L224 186M289 168L296 186"/>
    <path d="M177 112H210L216 132H170ZM310 112H343L350 132H304"/>
    <path d="M204 92H245M275 92H316M229 71H291M244 52H276"/>
    <path d="M398 267L418 243H454L466 267H398ZM408 267L403 280M454 267L460 280M414 243L419 225H448L453 243"/>
    <path d="M74 276L88 255H112L125 276H74ZM82 255V238H117V255M92 238V225H108V238"/>
    <path d="M28 304H492M55 315H465"/>
  `;

  Old.replaceWith(Svg);
  return true;
}

if (!UpgradeMenuVisual()) {
  const Observer = new MutationObserver(() => {
    if (UpgradeMenuVisual()) Observer.disconnect();
  });
  Observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => Observer.disconnect(), 5000);
}

window.__STORE_MENU_VISUAL_BUILD__ = "V0.12.1";
