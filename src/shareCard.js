import { SITE_CONFIG } from "./siteConfig";
import { formatAnnual } from "./mapUtils";

const { app, formatting, levels, share } = SITE_CONFIG;

function countLevels(wageTable, annual, hoursPerYear) {
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  if (!wageTable || !Number.isFinite(annual)) return counts;
  const hourly = annual / hoursPerYear;
  Object.values(wageTable).forEach((wages) => {
    if (!wages) return;
    let level = 0;
    if (wages.IV && hourly >= wages.IV) level = 4;
    else if (wages.III && hourly >= wages.III) level = 3;
    else if (wages.II && hourly >= wages.II) level = 2;
    else if (wages.I && hourly >= wages.I) level = 1;
    counts[level] += 1;
  });
  return counts;
}

export function buildShareText({ occupation, salary, url }) {
  const salaryLabel =
    salary === "" || !Number.isFinite(Number(salary))
      ? ""
      : ` at ${formatting.currencySymbol}${Number(salary).toLocaleString(formatting.locale)}`;
  return `${share.text}\n${occupation}${salaryLabel}\n${url}`;
}

export function drawShareCard({ occupation, salary, wageTable, hoursPerYear }) {
  const width = 1200;
  const height = 630;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, width, height);

  const accent = ["#7EC8E3", "#3D9B7A", "#C07AA8", "#3D5A80"];
  accent.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(48 + index * 18, 48, 12, 48);
  });

  ctx.fillStyle = "#f8fafc";
  ctx.font = "700 42px Inter, system-ui, sans-serif";
  ctx.fillText(app.name, 140, 84);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 22px Inter, system-ui, sans-serif";
  ctx.fillText(app.shareEyebrow || "FY 2028 prevailing wages by county", 140, 118);

  const salaryLabel =
    salary === "" || !Number.isFinite(Number(salary))
      ? formatting.emptyValue
      : `${formatting.currencySymbol}${Number(salary).toLocaleString(formatting.locale)}`;

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "600 28px Inter, system-ui, sans-serif";
  wrapText(ctx, occupation || "Occupation", 48, 200, 1100, 36);

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 72px Inter, system-ui, sans-serif";
  ctx.fillText(salaryLabel, 48, 320);

  const counts = countLevels(wageTable, Number(salary), hoursPerYear);
  const pills = [
    ["L I", counts[1], levels.colors[1]],
    ["L II", counts[2], levels.colors[2]],
    ["L III", counts[3], levels.colors[3]],
    ["L IV", counts[4], levels.colors[4]],
  ];
  pills.forEach((pill, index) => {
    const x = 48 + index * 280;
    const y = 380;
    roundRect(ctx, x, y, 256, 120, 16);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.fillStyle = pill[2];
    ctx.beginPath();
    ctx.arc(x + 28, y + 36, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "700 18px Inter, system-ui, sans-serif";
    ctx.fillText(pill[0], x + 46, y + 42);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 36px Inter, system-ui, sans-serif";
    ctx.fillText(`${pill[1].toLocaleString(formatting.locale)} counties`, x + 22, y + 88);
  });

  ctx.fillStyle = "#64748b";
  ctx.font = "500 20px Inter, system-ui, sans-serif";
  ctx.fillText(app.siteUrl.replace(/^https:\/\//, ""), 48, 560);
  ctx.fillText("Not official DOL / USCIS advice", 48, 590);

  return canvas;
}

export async function shareView({ occupation, salary, wageTable, hoursPerYear, url }) {
  const text = buildShareText({ occupation, salary, url });
  const canvas = drawShareCard({ occupation, salary, wageTable, hoursPerYear });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const file = blob ? new File([blob], "h1b-wagemap.png", { type: "image/png" }) : null;

  if (file && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: share.title, text, url, files: [file] });
    return "shared";
  }
  if (navigator.share) {
    await navigator.share({ title: share.title, text, url });
    return "shared-link";
  }
  await navigator.clipboard.writeText(url);
  if (blob) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = "h1b-wagemap.png";
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }
  return "copied";
}

export function summarizeFloors(wageTable, annual, hoursPerYear) {
  return countLevels(wageTable, annual, hoursPerYear);
}

export function formatFloorLabel(annual) {
  return formatAnnual(annual);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(" ");
  let line = "";
  let cursor = y;
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursor);
      line = word;
      cursor += lineHeight;
    } else {
      line = test;
    }
  });
  if (line) ctx.fillText(line, x, cursor);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
