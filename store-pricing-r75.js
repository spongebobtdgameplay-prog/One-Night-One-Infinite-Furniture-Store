const Prices = new Map([
  ["Couch_Large1", 899.99],
  ["Couch_L", 749.99],
  ["Chair_2", 179.99],
  ["Table_RoundLarge", 329.99],
  ["Bed_King", 999.99],
  ["Bed_Single", 429.99],
  ["NightStand_2", 129.99],
  ["Shelf_Large", 289.99],
  ["Bookshelf", 249.99],
  ["Kitchen_Cabinet1", 219.99],
  ["Kitchen_Fridge", 1199.99],
  ["Kitchen_Oven", 899.99],
  ["Kitchen_Sink", 349.99],
  ["Bathroom_Sink", 299.99],
  ["Bathroom_Bathtub", 799.99],
  ["Bathroom_Toilet", 269.99],
  ["Light_Floor1", 89.99],
  ["RetailArmchairR79", 249.99],
  ["RetailLivingShelfR79", 219.99],
  ["RetailBedroomCabinetR79", 329.99],
  ["RetailBedroomChairR79", 239.99],
  ["RetailStorageShelfR79", 199.99],
  ["RetailStorageCabinetR79", 279.99],
  ["RetailDisplayCabinetR79", 289.99]
]);

function Hash(Text) {
  let Value = 2166136261 >>> 0;
  for (const Character of String(Text || "")) {
    Value ^= Character.charCodeAt(0);
    Value = Math.imul(Value, 16777619);
  }
  return Value >>> 0;
}

export function FurniturePrice(Name, ChunkIndex = 0, ItemIndex = 0) {
  const Base = Prices.get(Name) ?? 199.99;
  const VariationSeed = Hash(`${Name}:${ChunkIndex}:${ItemIndex}`);
  const Variation = ((VariationSeed % 5) - 2) * 10;
  const Price = Math.max(19.99, Base + Variation);
  return `$${Price.toFixed(2)}`;
}

window.__STORE_PRICING_BUILD__ = "V0.35.37-SINKS";