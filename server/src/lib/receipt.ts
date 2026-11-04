import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { RESTAURANT } from "../../../shared/config.js";
import { ORDER_TYPE_LABELS, formatDateTime, type Order } from "../../../shared/types.js";
import { config } from "../config.js";

export type ReceiptWidth = 58 | 80;

function money(value: number) {
  return new Intl.NumberFormat("en-TZ").format(Math.round(value));
}

export async function buildReceiptPdf(order: Order, widthMm: ReceiptWidth = 80): Promise<Buffer> {
  const widthPt = widthMm === 58 ? 164.41 : 226.77;
  const marginPt = 6;
  const contentWidth = widthPt - marginPt * 2;
  const fontSize = widthMm === 58 ? 8 : 9;
  const smallSize = widthMm === 58 ? 7 : 8;

  const doc = new PDFDocument({
    size: [widthPt, 700],
    margin: marginPt,
    info: { Title: `Receipt ${order.receiptNumber}`, Author: RESTAURANT.name },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk as Buffer));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const ensureSpace = (needed: number) => {
    if (doc.y + needed > 700 - marginPt) {
      doc.addPage();
      doc.y = marginPt;
    }
  };

  const divider = (style: "solid" | "dashed" = "dashed") => {
    const y = doc.y;
    if (style === "dashed") {
      for (let x = marginPt; x < marginPt + contentWidth; x += 6) {
        doc.moveTo(x, y).lineTo(Math.min(x + 3, marginPt + contentWidth), y).lineWidth(0.6).strokeColor("#000").stroke();
      }
    } else {
      doc.moveTo(marginPt, y).lineTo(marginPt + contentWidth, y).lineWidth(0.8).strokeColor("#000").stroke();
    }
    doc.y = y + 6;
  };

  const line = (label: string, value: string, opts: { bold?: boolean; size?: number; align?: "left" | "right" } = {}) => {
    const size = opts.size ?? fontSize;
    doc.font(opts.bold ? "Courier-Bold" : "Courier").fontSize(size).fillColor("#000");
    const labelWidth = contentWidth * 0.55;
    const valueWidth = contentWidth - labelWidth;
    doc.text(label, marginPt, doc.y, { width: labelWidth, lineBreak: false });
    doc.text(value, marginPt + labelWidth, doc.y - (doc.currentLineHeight() || size + 2), {
      width: valueWidth,
      align: "right",
      lineBreak: false,
    });
    doc.y += size + 3;
  };

  const centered = (str: string, opts: { bold?: boolean; size?: number; gap?: number } = {}) => {
    const size = opts.size ?? fontSize;
    doc.font(opts.bold ? "Courier-Bold" : "Courier").fontSize(size).fillColor("#000");
    doc.text(str, marginPt, doc.y, { width: contentWidth, align: "center" });
    doc.y += (opts.gap ?? 2);
  };

  // ── Header ──────────────────────────────────────────────────────────────
  const logoPath = path.join(config.publicDir, "images", "jamaa-logo.png");
  if (fs.existsSync(logoPath)) {
    const logoWidth = contentWidth * 0.7;
    const logoHeight = logoWidth * (301 / 829);
    const x = marginPt + (contentWidth - logoWidth) / 2;
    doc.image(logoPath, x, doc.y, { width: logoWidth });
    doc.y += logoHeight + 4;
  }

  centered("JAMAA FAST FOOD", { bold: true, size: fontSize + 3, gap: 2 });
  centered(RESTAURANT.address, { size: smallSize, gap: 1 });
  centered(`Tel: ${RESTAURANT.phone}`, { size: smallSize, gap: 1 });
  centered(RESTAURANT.email, { size: smallSize, gap: 1 });
  centered(RESTAURANT.socials.map((s) => s.handle).join("  |  "), { size: smallSize - 0.5, gap: 4 });

  divider("solid");

  // ── Order items ─────────────────────────────────────────────────────────
  centered("ORDER ITEMS", { bold: true, size: smallSize, gap: 2 });
  doc.font("Courier-Bold").fontSize(smallSize).fillColor("#000");
  const priceColWidth = contentWidth * 0.28;
  const nameColWidth = contentWidth - priceColWidth;
  doc.text("Item", marginPt, doc.y, { width: nameColWidth, lineBreak: false });
  doc.text("Price", marginPt + nameColWidth, doc.y - (doc.currentLineHeight() || smallSize + 2), {
    width: priceColWidth,
    align: "right",
    lineBreak: false,
  });
  doc.y += smallSize + 2;
  divider("dashed");

  for (const item of order.items) {
    const addonsTotal = item.addons.reduce((sum, addon) => sum + addon.price, 0);
    const unitWithAddons = item.unitPrice + addonsTotal;
    const priceStr = money(item.lineTotal);

    doc.font("Courier").fontSize(fontSize).fillColor("#000");
    doc.text(item.name, marginPt, doc.y, { width: nameColWidth });
    const nameHeight = doc.heightOfString(item.name, { width: nameColWidth });
    // price on first line, right aligned
    doc.font("Courier-Bold").fontSize(fontSize).fillColor("#000");
    doc.text(priceStr, marginPt + nameColWidth, doc.y - nameHeight, {
      width: priceColWidth,
      align: "right",
      lineBreak: false,
    });
    doc.y = doc.y + 0; // keep
    // advance y to after name
    // doc.y already advanced by text? text with lineBreak true advances. We used lineBreak default true for name text, so doc.y moved. Good.
    if (item.quantity > 1 || item.addons.length || item.instructions) {
      doc.font("Courier").fontSize(smallSize).fillColor("#444");
      const detail = `${item.quantity} x ${money(unitWithAddons)}`;
      doc.text(detail, marginPt, doc.y, { width: contentWidth });
      doc.y += 1;
      for (const addon of item.addons) {
        doc.text(`  + ${addon.name} (${money(addon.price)})`, marginPt, doc.y, { width: contentWidth });
      }
      if (item.instructions) {
        doc.text(`  Note: ${item.instructions}`, marginPt, doc.y, { width: contentWidth });
      }
    }
    doc.y += 2;
    divider("dashed");
  }

  if (order.items.length === 0) {
    centered("No items", { size: smallSize, gap: 2 });
    divider("dashed");
  }

  // ── Totals ──────────────────────────────────────────────────────────────
  ensureSpace(120);
  centered("TOTALS", { bold: true, size: smallSize, gap: 2 });
  line("Subtotal", money(order.subtotal));
  if (order.orderType === "delivery") {
    line("Delivery fee", order.deliveryFee === 0 ? "FREE" : money(order.deliveryFee));
  }
  line("Discount", "0");
  line("Tax (VAT incl.)", "Included");
  divider("solid");
  line("TOTAL", `TZS ${money(order.total)}`, { bold: true, size: fontSize + 1 });
  line("Amount paid", money(order.amountPaid));
  divider("dashed");

  // ── Transaction information ─────────────────────────────────────────────
  ensureSpace(150);
  centered("TRANSACTION INFO", { bold: true, size: smallSize, gap: 2 });
  const txnRows: Array<[string, string]> = [
    ["Order ref", order.reference],
    ["Receipt no", order.receiptNumber],
    ["Transaction ref", order.payment?.reference ?? "—"],
    ["Payment method", order.payment?.method ?? "Demo Payment"],
    ["Payment status", order.paymentStatus.toUpperCase()],
    ["Date & time", formatDateTime(order.createdAt)],
    ["Order type", ORDER_TYPE_LABELS[order.orderType]],
  ];
  if (order.orderType === "delivery" && order.delivery && order.delivery.lat !== null && order.delivery.lng !== null) {
    txnRows.push(["Delivery pin", `${order.delivery!.lat!.toFixed(5)}, ${order.delivery!.lng!.toFixed(5)}`]);
  }
  for (const [label, value] of txnRows) {
    line(label, value, { size: smallSize });
  }
  divider("dashed");

  // ── QR code ─────────────────────────────────────────────────────────────
  const qrSize = Math.min(contentWidth * 0.55, 90);
  ensureSpace(qrSize + 30);
  const qrBuffer = await QRCode.toBuffer(order.receiptNumber, {
    type: "png",
    width: Math.round(qrSize * 2),
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const qrX = marginPt + (contentWidth - qrSize) / 2;
  doc.image(qrBuffer, qrX, doc.y, { width: qrSize });
  doc.y += qrSize + 4;
  centered(order.receiptNumber, { size: smallSize - 1, gap: 2 });
  centered("Scan to verify this receipt", { size: smallSize - 1, gap: 6 });

  divider("dashed");

  // ── Footer ──────────────────────────────────────────────────────────────
  centered("Thank you for your purchase!", { bold: true, size: fontSize + 1, gap: 2 });
  centered("We appreciate your business.", { size: smallSize, gap: 1 });
  centered("Visit us again!", { size: smallSize, gap: 4 });
  centered("DEMO MODE - No real money was transferred.", { bold: true, size: smallSize - 0.5, gap: 2 });
  centered(`${RESTAURANT.phone}  |  ${RESTAURANT.shortAddress}`, { size: smallSize - 1, gap: 1 });
  centered("Keep this receipt for your records.", { size: smallSize - 1, gap: 2 });

  doc.end();
  return finished;
}

export function receiptFileName(order: Order): string {
  return `Jamaa-Receipt-${order.reference}.pdf`;
}

export function receiptSummary(order: Order): string {
  return `${order.reference} · ${money(order.total)} TZS · ${formatDateTime(order.createdAt)}`;
}
