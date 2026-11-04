import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { RESTAURANT } from "../../../shared/config.js";
import { ORDER_TYPE_LABELS, formatDateTime, formatTZS, type Order } from "../../../shared/types.js";
import { config } from "../config.js";

const BRAND = "#B91C23";
const GOLD = "#F2C230";
const INK = "#241A1B";
const MUTED = "#6B5B58";
const LINE = "#E6DCD5";

const PAGE_MARGIN = 48;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;

function money(value: number) {
  return new Intl.NumberFormat("en-TZ").format(Math.round(value));
}

export async function buildReceiptPdf(order: Order): Promise<Buffer> {
  const logoPath = path.join(config.publicDir, "images", "jamaa-logo.png");
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, info: { Title: `Jamaa receipt ${order.receiptNumber}` } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk as Buffer));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  let y = PAGE_MARGIN;

  // ── Header ──────────────────────────────────────────────────────────────
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, PAGE_MARGIN, y, { width: 132 });
  } else {
    doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(24).text(RESTAURANT.name, PAGE_MARGIN, y);
  }

  doc.font("Helvetica").fontSize(8).fillColor(MUTED);
  doc.text(RESTAURANT.address, 300, y + 4, { width: CONTENT_WIDTH - 252, align: "right" });
  doc.text(`Tel ${RESTAURANT.phone}  ·  ${RESTAURANT.email}`, { width: CONTENT_WIDTH - 252, align: "right" });
  doc.text(`${RESTAURANT.tin}  ·  ${RESTAURANT.vat}`, { width: CONTENT_WIDTH - 252, align: "right" });

  y += 64;
  doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 4).fill(BRAND);
  doc.rect(PAGE_MARGIN, y + 4, CONTENT_WIDTH * 0.28, 4).fill(GOLD);
  y += 20;

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(16).text("PAYMENT RECEIPT", PAGE_MARGIN, y);
  const statusLabel = order.paymentStatus === "paid" ? "PAID · DEMO" : order.paymentStatus.toUpperCase();
  const badgeWidth = doc.widthOfString(statusLabel) + 20;
  doc.roundedRect(PAGE_MARGIN + CONTENT_WIDTH - badgeWidth, y - 2, badgeWidth, 20, 10).fillAndStroke("#EAF7EE", "#BFE3C8");
  doc.fillColor("#1F7A3D").font("Helvetica-Bold").fontSize(8).text(statusLabel, PAGE_MARGIN + CONTENT_WIDTH - badgeWidth, y + 4, {
    width: badgeWidth,
    align: "center",
  });
  y += 26;

  const metaRows: Array<[string, string]> = [
    ["Receipt number", order.receiptNumber],
    ["Order reference", order.reference],
    ["Transaction reference", order.payment?.reference ?? "—"],
    ["Date & time", formatDateTime(order.createdAt)],
    ["Order type", ORDER_TYPE_LABELS[order.orderType]],
    ["Payment method", order.payment?.method ?? "Demo Payment"],
  ];

  const colWidth = CONTENT_WIDTH / 2;
  metaRows.forEach(([label, value], index) => {
    const col = index % 2;
    const rowY = y + Math.floor(index / 2) * 15;
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(label, PAGE_MARGIN + col * colWidth, rowY, { width: 110 });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(value, PAGE_MARGIN + col * colWidth + 112, rowY, {
      width: colWidth - 120,
    });
  });
  y += Math.ceil(metaRows.length / 2) * 15 + 12;

  // ── Customer & fulfilment ───────────────────────────────────────────────
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, 62, 8).fillAndStroke("#FFF7F0", LINE);
  doc.fillColor(MUTED).font("Helvetica").fontSize(7.5).text("CUSTOMER", PAGE_MARGIN + 14, y + 10);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text(order.customerName, PAGE_MARGIN + 14, y + 21);
  doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(`${order.customerPhone}${order.customerEmail ? `  ·  ${order.customerEmail}` : ""}`, PAGE_MARGIN + 14, y + 35);

  const fulfilX = PAGE_MARGIN + CONTENT_WIDTH / 2 + 8;
  doc.fillColor(MUTED).font("Helvetica").fontSize(7.5).text(ORDER_TYPE_LABELS[order.orderType].toUpperCase(), fulfilX, y + 10);
  let fulfilText = "Jamaa Fast Food counter, Samora Machel Avenue";
  if (order.orderType === "delivery" && order.delivery) {
    fulfilText = order.delivery.address || "Delivery address on file";
    if (order.delivery.lat !== null && order.delivery.lng !== null) {
      fulfilText += ` (${order.delivery.lat.toFixed(5)}, ${order.delivery.lng.toFixed(5)})`;
    }
  } else if (order.orderType === "takeaway" && order.scheduledFor) {
    fulfilText = `Collect at ${formatDateTime(order.scheduledFor)}`;
  } else if (order.orderType === "dine_in") {
    fulfilText = "Dine-in · served at the restaurant";
  }
  doc.fillColor(INK).font("Helvetica").fontSize(8).text(fulfilText, fulfilX, y + 22, {
    width: CONTENT_WIDTH / 2 - 26,
    lineGap: 1,
  });
  y += 78;

  // ── Items table ─────────────────────────────────────────────────────────
  const colQty = PAGE_MARGIN;
  const colDesc = PAGE_MARGIN + 34;
  const colUnit = PAGE_MARGIN + CONTENT_WIDTH - 190;
  const colAmount = PAGE_MARGIN + CONTENT_WIDTH - 100;

  doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 20).fill("#241A1B");
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);
  doc.text("QTY", colQty + 6, y + 6, { width: 28 });
  doc.text("ITEM", colDesc, y + 6, { width: 300 });
  doc.text("UNIT (TZS)", colUnit, y + 6, { width: 90, align: "right" });
  doc.text("AMOUNT (TZS)", colAmount, y + 6, { width: 94, align: "right" });
  y += 20;

  const ensureSpace = (height: number) => {
    if (y + height > 760) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
  };

  order.items.forEach((item, index) => {
    const addonsTotal = item.addons.reduce((sum, addon) => sum + addon.price, 0);
    const unitWithAddons = item.unitPrice + addonsTotal;
    const descriptionLines = [item.name];
    for (const addon of item.addons) descriptionLines.push(`+ ${addon.name} (${money(addon.price)})`);
    if (item.instructions) descriptionLines.push(`Note: ${item.instructions}`);

    const descHeight = doc.font("Helvetica").fontSize(8).heightOfString(descriptionLines.join("\n"), { width: 300 });
    const rowHeight = Math.max(26, descHeight + 12);
    ensureSpace(rowHeight);

    if (index % 2 === 0) doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, rowHeight).fill("#FBF6F2");
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(8.5);
    doc.text(String(item.quantity), colQty + 6, y + 6, { width: 28 });
    doc.font("Helvetica-Bold").fontSize(9).text(item.name, colDesc, y + 6, { width: 280 });
    let lineY = y + 6 + doc.heightOfString(item.name, { width: 280 });
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
    for (const addon of item.addons) {
      doc.text(`+ ${addon.name} (${money(addon.price)})`, colDesc, lineY, { width: 280 });
      lineY += 9;
    }
    if (item.instructions) {
      doc.text(`Note: ${item.instructions}`, colDesc, lineY, { width: 280 });
    }
    doc.fillColor(INK).font("Helvetica").fontSize(8.5);
    doc.text(money(unitWithAddons), colUnit, y + 6, { width: 90, align: "right" });
    doc.font("Helvetica-Bold").text(money(item.lineTotal), colAmount, y + 6, { width: 94, align: "right" });
    y += rowHeight;
    doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y).lineWidth(0.5).strokeColor(LINE).stroke();
  });

  if (order.items.length === 0) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(9).text("No items on this order.", colDesc, y + 8);
    y += 28;
  }

  y += 12;
  ensureSpace(120);

  // ── Totals ──────────────────────────────────────────────────────────────
  const totalsX = PAGE_MARGIN + CONTENT_WIDTH - 230;
  const totalsValueX = PAGE_MARGIN + CONTENT_WIDTH - 110;
  const totalRow = (label: string, value: string, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 10 : 8.5);
    doc.fillColor(bold ? INK : MUTED).text(label, totalsX, y, { width: 120 });
    doc.fillColor(INK).text(value, totalsValueX, y, { width: 110, align: "right" });
    y += bold ? 18 : 14;
  };
  totalRow("Subtotal", money(order.subtotal));
  if (order.orderType === "delivery") totalRow("Delivery fee", order.deliveryFee === 0 ? "FREE" : money(order.deliveryFee));
  doc.moveTo(totalsX, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y).lineWidth(0.8).strokeColor(LINE).stroke();
  y += 6;
  totalRow("TOTAL", `TZS ${money(order.total)}`, true);
  totalRow("Amount paid", money(order.amountPaid));

  // ── Notes ───────────────────────────────────────────────────────────────
  const notes: string[] = [];
  if (order.notes) notes.push(`Order notes: ${order.notes}`);
  if (order.dineInNote) notes.push(`Dine-in details: ${order.dineInNote}`);
  if (order.delivery?.instructions) notes.push(`Delivery instructions: ${order.delivery.instructions}`);

  if (notes.length) {
    y += 4;
    ensureSpace(24 + notes.length * 14);
    doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, 20 + notes.length * 13, 6).fillAndStroke("#FFFAE8", "#F3E2B0");
    doc.fillColor(INK).font("Helvetica").fontSize(8);
    notes.forEach((note, index) => {
      doc.text(note, PAGE_MARGIN + 10, y + 8 + index * 13, { width: CONTENT_WIDTH - 20 });
    });
    y += 24 + notes.length * 13;
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  ensureSpace(110);
  y += 10;
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, 46, 6).fillAndStroke("#FFF1F1", "#F6CFCF");
  doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(9).text("DEMO MODE – No real money was transferred.", PAGE_MARGIN + 10, y + 9);
  doc.fillColor(MUTED).font("Helvetica").fontSize(7.5).text(
    "This receipt was produced by the Jamaa Fast Food prototype for demonstration purposes. A production deployment will issue receipts from the live payment provider.",
    PAGE_MARGIN + 10,
    y + 22,
    { width: CONTENT_WIDTH - 20 },
  );
  y += 58;

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(9).text("Thank you for ordering with Jamaa Fast Food.", PAGE_MARGIN, y, {
    width: CONTENT_WIDTH,
    align: "center",
  });
  y += 14;
  doc.fillColor(MUTED).font("Helvetica").fontSize(7.5).text(
    `${RESTAURANT.phone}  ·  ${RESTAURANT.email}  ·  ${RESTAURANT.shortAddress}`,
    PAGE_MARGIN,
    y,
    { width: CONTENT_WIDTH, align: "center" },
  );
  y += 10;
  doc.text("Support hours: 07:00 – 23:00 daily. Keep this receipt for your records.", PAGE_MARGIN, y, {
    width: CONTENT_WIDTH,
    align: "center",
  });

  doc.end();
  return finished;
}

export function receiptFileName(order: Order): string {
  return `Jamaa-Receipt-${order.reference}.pdf`;
}

export function receiptSummary(order: Order): string {
  return `${order.reference} · ${formatTZS(order.total)} · ${formatDateTime(order.createdAt)}`;
}
