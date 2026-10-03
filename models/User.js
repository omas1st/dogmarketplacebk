const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const CartItemSchema = new mongoose.Schema(
  {
    productId: { type: String },
    title: { type: String, required: true },
    image: { type: String },
    price: { type: Number, required: true },
    size: { type: String, default: "One Size" },
    qty: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: { type: String, required: true },
    mobilePhone: { type: String, required: true, trim: true },
    role: { type: String, default: "user", enum: ["user", "admin"] },
    cart: { type: [CartItemSchema], default: [] },
    orders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
  },
  { timestamps: true }
);

/* Async pre-save hook — NO `next` parameter.
   Mongoose 8 treats this as a Promise-based middleware, so returning
   from the function is enough. Calling next() would crash. */
UserSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

UserSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    _id: this._id,
    firstName: this.firstName,
    lastName: this.lastName,
    email: this.email,
    mobilePhone: this.mobilePhone,
    role: this.role,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("User", UserSchema);