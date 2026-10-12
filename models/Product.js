const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

/* Food sizes carry their own ORIGINAL price. The product-level
   `discountPercent` is applied to each one to derive the final
   selling price shown to the customer. */
const FoodSizeSchema = new mongoose.Schema(
  {
    size: { type: String, required: true, trim: true },
    price: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
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
    originalPrice: { type: Number, default: 0, min: 0 },
    discountPercent: { type: Number, default: 20, min: 0, max: 100 },
    sellingPrice: { type: Number, min: 0, default: 0 },
    category: {
      type: String,
      required: true,
      enum: [
        "dog_clothing_accessories",
        "food",
        "chews",
        "feeding",
        "bed",
        "collar_leashes_harnesses",
        "toy",
        "crates_gates_pens",
        /* Legacy — kept so existing products still validate */
        "food_chews_feeding",
      ],
    },
    stockStatus: {
      type: String,
      enum: ["in_stock", "out_stock"],
      default: "in_stock",
    },
    /* Primary image — always mirrors images[0] */
    image: { type: String, default: "" },
    /* All product images (max 4, first one is the card thumbnail) */
    images: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length <= 4,
        message: "A product can have at most 4 images.",
      },
    },
    /* Regular sizes for non-food products (XS, S, M, L, ...) */
    sizes: { type: [String], default: [] },
    /* Colour options — ignored for food products */
    colors: { type: [String], default: [] },
    /* Weight + ORIGINAL price options for food products */
    foodSizes: { type: [FoodSizeSchema], default: [] },
    reviews: { type: [ReviewSchema], default: [] },
  },
  { timestamps: true }
);

const CATEGORY_LABELS = {
  dog_clothing_accessories: "Dog; Clothing and Accessories",
  food: "Food",
  chews: "Chews",
  feeding: "Feeding",
  bed: "Bed",
  collar_leashes_harnesses: "Collar, Leashes and Harnesses",
  toy: "Toy",
  crates_gates_pens: "Crates, Gates and Pens",
  food_chews_feeding: "Food, Chews and Feeding",
};

ProductSchema.virtual("categoryLabel").get(function categoryLabel() {
  return CATEGORY_LABELS[this.category] || this.category;
});

ProductSchema.virtual("isFood").get(function isFood() {
  return this.category === "food" || this.category === "food_chews_feeding";
});

/* Fallback for old documents that only have `image` set */
ProductSchema.virtual("allImages").get(function allImages() {
  if (Array.isArray(this.images) && this.images.length > 0) return this.images;
  if (this.image) return [this.image];
  return [];
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

const FOOD_CATEGORIES = ["food", "food_chews_feeding"];

/* ----- Document middleware (create / save) — SYNC ----- */
ProductSchema.pre("save", function computeSellingPrice() {
  // Sync images <-> image
  if (Array.isArray(this.images) && this.images.length > 0) {
    this.image = this.images[0];
  } else if (
    this.image &&
    (!Array.isArray(this.images) || this.images.length === 0)
  ) {
    this.images = [this.image];
  }

  const isFood = FOOD_CATEGORIES.includes(this.category);

  if (isFood) {
    // Food: no top-level price fields matter, and no colors
    this.originalPrice = 0;
    this.sellingPrice = 0;
    this.colors = [];

    // Ensure foodSizes are clean
    if (Array.isArray(this.foodSizes) && this.foodSizes.length > 0) {
      this.foodSizes = this.foodSizes.map((fs) => ({
        size: String(fs.size || "").trim(),
        price: Number(fs.price) > 0 ? Number(fs.price) : 0,
      }));
      this.sizes = this.foodSizes.map((fs) => fs.size);
    }
  } else {
    // Non-food: compute the base selling price as before
    this.sellingPrice = computeSelling(
      this.originalPrice,
      this.discountPercent
    );

    // No food sizes for non-food
    this.foodSizes = [];
  }
});

/* ----- Query middleware (findOneAndUpdate) — SYNC ----- */
ProductSchema.pre("findOneAndUpdate", function computeSellingPriceUpdate() {
  const update = this.getUpdate() || {};
  const target = update.$set ? update.$set : update;

  /* Determine the effective category for this update */
  const effectiveCategory = target.category;

  if (effectiveCategory !== undefined) {
    const isFood = FOOD_CATEGORIES.includes(effectiveCategory);

    if (isFood) {
      target.originalPrice = 0;
      target.sellingPrice = 0;
      target.colors = [];

      if (Array.isArray(target.foodSizes)) {
        target.foodSizes = target.foodSizes.map((fs) => ({
          size: String(fs.size || "").trim(),
          price: Number(fs.price) > 0 ? Number(fs.price) : 0,
        }));
        target.sizes = target.foodSizes.map((fs) => fs.size);
      }
    } else {
      const original =
        target.originalPrice !== undefined
          ? Number(target.originalPrice)
          : undefined;
      const discount =
        target.discountPercent !== undefined
          ? Number(target.discountPercent)
          : undefined;

      if (original !== undefined && !Number.isNaN(original)) {
        const safeDiscount =
          discount !== undefined && !Number.isNaN(discount) ? discount : 0;
        target.sellingPrice = computeSelling(original, safeDiscount);
      }

      target.foodSizes = [];
    }
  } else {
    /* No category change — if foodSizes or discount is being updated,
       just make sure they're clean. Do NOT wipe original/selling
       here since the route already handles non-food recalculation. */
    if (Array.isArray(target.foodSizes)) {
      target.foodSizes = target.foodSizes.map((fs) => ({
        size: String(fs.size || "").trim(),
        price: Number(fs.price) > 0 ? Number(fs.price) : 0,
      }));
      target.sizes = target.foodSizes.map((fs) => fs.size);
    }
  }

  this.setUpdate(update);
});

module.exports = mongoose.model("Product", ProductSchema);