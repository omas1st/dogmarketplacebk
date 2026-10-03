const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const ProductSchema = new mongoose.Schema(
  {
    itemType: {
      type: String,
      enum: ["dog_supply", "dog_adoption"],
      default: "dog_supply",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    originalPrice: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, default: 20, min: 0, max: 100 },
    sellingPrice: { type: Number, min: 0 },
    category: {
      type: String,
      required: true,
      enum: [
        "dog_clothing_accessories",
        "food_chews_feeding",
        "bed",
        "collar_leashes_harnesses",
        "toy",
        "crates_gates_pens",
      ],
    },
    stockStatus: {
      type: String,
      enum: ["in_stock", "out_stock"],
      default: "in_stock",
    },
    image: { type: String, required: true },
    sizes: { type: [String], default: [] },
    reviews: { type: [ReviewSchema], default: [] },
  },
  { timestamps: true }
);

const CATEGORY_LABELS = {
  dog_clothing_accessories: "Dog; Clothing and Accessories",
  food_chews_feeding: "Food, Chews and Feeding",
  bed: "Bed",
  collar_leashes_harnesses: "Collar, Leashes and Harnesses",
  toy: "Toy",
  crates_gates_pens: "Crates, Gates and Pens",
};

ProductSchema.virtual("categoryLabel").get(function categoryLabel() {
  return CATEGORY_LABELS[this.category] || this.category;
});

ProductSchema.set("toJSON", { virtuals: true });
ProductSchema.set("toObject", { virtuals: true });

/* ----- Helper ----- */
function computeSelling(original, discount) {
  const orig = Number(original) || 0;
  const disc = Number(discount) || 0;
  const selling = orig - (orig * disc) / 100;
  return Number(selling.toFixed(2));
}

/* ----- Document middleware (create / save) — SYNC ----- */
ProductSchema.pre("save", function computeSellingPrice() {
  this.sellingPrice = computeSelling(this.originalPrice, this.discountPercent);
});

/* ----- Query middleware (findOneAndUpdate) — SYNC ----- */
ProductSchema.pre("findOneAndUpdate", function computeSellingPriceUpdate() {
  const update = this.getUpdate() || {};

  // Support both flat update and { $set: { ... } } form
  const target = update.$set ? update.$set : update;

  const original =
    target.originalPrice !== undefined
      ? Number(target.originalPrice)
      : undefined;

  const discount =
    target.discountPercent !== undefined
      ? Number(target.discountPercent)
      : undefined;

  // Only recompute if at least one of the two inputs is present.
  // If only one is present, we still compute against the other's current value
  // — the routes layer already handles that case, so we mirror it here.
  if (original !== undefined && !Number.isNaN(original)) {
    const safeDiscount = discount !== undefined && !Number.isNaN(discount) ? discount : 0;
    target.sellingPrice = computeSelling(original, safeDiscount);
  } else if (discount !== undefined && !Number.isNaN(discount)) {
    // discount changed but original not provided; nothing to recompute without original
    // The route will compute and set sellingPrice explicitly in this case.
  }

  this.setUpdate(update);
});

module.exports = mongoose.model("Product", ProductSchema);