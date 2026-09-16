export function ensurePopupInView(map, popup) {
  if (!map || !popup) return;
  const el = popup.getElement();
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const panel = document.querySelector(".control-panel");
  const topMin = (panel ? panel.getBoundingClientRect().bottom : 8) + 10;
  const bottomMax = window.innerHeight - 16;
  const leftMin = 8;
  const rightMax = window.innerWidth - 8;

  let dx = 0;
  let dy = 0;
  if (rect.top < topMin) dy -= topMin - rect.top;
  if (rect.bottom > bottomMax) dy += rect.bottom - bottomMax;
  if (rect.left < leftMin) dx -= leftMin - rect.left;
  if (rect.right > rightMax) dx += rect.right - rightMax;
  if (!dx && !dy) return;
  map.panBy([dx, dy], { duration: 280 });
}
