const STORE_HALF_WIDTH = 17;
const CENTRAL_AISLE_HALF_WIDTH = 3.4;
const DISPLAY_INNER_EDGE = 5.25;
const DISPLAY_OUTER_EDGE = 15.45;
const MERCHANDISE_Z_LIMIT = 10.45;
const SLOT_SPACING = 0.28;

const Footprints = Object.freeze({
  Couch_Large1: [2.25, 0.90],
  Couch_L: [2.45, 1.65],
  Chair_2: [0.78, 0.76],
  Table_RoundLarge: [1.38, 1.38],
  Bed_King: [1.90, 2.02],
  Bed_Single: [1.02, 1.96],
  NightStand_2: [0.52, 0.48],
  Shelf_Large: [1.75, 0.50],
  Bookshelf: [1.45, 0.42],
  Kitchen_Cabinet1: [1.05, 0.58],
  Kitchen_Fridge: [0.84, 0.78],
  Kitchen_Oven: [0.82, 0.70],
  Kitchen_Sink: [1.10, 0.66],
  Bathroom_Bathtub: [0.80, 1.72],
  Bathroom_Toilet: [0.62, 0.78],
  Light_Floor1: [0.48, 0.48],
  RetailArmchairR79: [1.35, 1.35],
  RetailLivingShelfR79: [1.25, 0.72],
  RetailBedroomCabinetR79: [1.30, 0.82],
  RetailBedroomChairR79: [1.30, 1.30],
  RetailStorageShelfR79: [1.35, 0.78],
  RetailStorageCabinetR79: [1.25, 0.78],
  RetailDisplayCabinetR79: [1.25, 0.78],
  RetailCoffeeTableR84: [1.70, 1.15],
  RetailSideTableR84: [0.95, 0.95],
  RetailDiningTableR84: [2.30, 1.25],
  RetailBoxShelfR84: [1.55, 0.95],
  RetailCardboardBoxR84: [0.70, 0.62],
  RetailKitchenStoveSingleR90: [1.40, 1.42],
  RetailKitchenStoveMultiR90: [1.42, 1.44],
  RetailKitchenStoveDecoratedR90: [1.46, 1.46],
  RetailKitchenOvenR90: [1.18, 0.68],
  RetailKitchenSinkR90: [1.36, 1.20],
  RetailKitchenSinkBacksplashR90: [1.38, 1.22],
  Cart: [1.20, 1.55],
  Basket: [0.75, 0.75],
  BagShelf: [1.55, 0.95],
  StoreTask: [0.74, 0.58],
  Partition: [0.15, 4.0]
});

function MixSeed32(Value) {
  let Mixed = Value >>> 0;
  Mixed ^= Mixed >>> 16;
  Mixed = Math.imul(Mixed, 0x7feb352d);
  Mixed ^= Mixed >>> 15;
  Mixed = Math.imul(Mixed, 0x846ca68b);
  Mixed ^= Mixed >>> 16;
  return Mixed >>> 0;
}

function HashText(Text) {
  let Hash = 2166136261;
  for (let Index = 0; Index < Text.length; Index += 1) {
    Hash ^= Text.charCodeAt(Index);
    Hash = Math.imul(Hash, 16777619);
  }
  return Hash >>> 0;
}

function SeedRoll(Seed, Key) {
  return MixSeed32((Seed ^ HashText(Key)) >>> 0) / 4294967296;
}

function Slot(SlotName, Model, X, Z, Rotation = 0, Extra = {}) {
  const Footprint = Extra.Footprint || Footprints[Model] || [1, 1];
  const Scale = Number.isFinite(Extra.Scale) ? Math.max(0.72, Math.min(1.18, Number(Extra.Scale))) : 1;
  return {
    Slot: SlotName,
    Model,
    X,
    Z,
    Rotation,
    Scale,
    Width: Footprint[0] * Scale,
    Depth: Footprint[1] * Scale,
    Required: Extra.Required !== false,
    Sellable: Extra.Sellable !== false,
    AssetKey: Extra.AssetKey || "",
    Name: Extra.Name || Model,
    TargetHeight: Extra.TargetHeight,
    MaximumWidth: Extra.MaximumWidth,
    MaximumDepth: Extra.MaximumDepth,
    PriceZOffset: Number(Extra.PriceZOffset) || 0,
    Decorations: Array.isArray(Extra.Decorations) ? Extra.Decorations : [],
    StockStyle: Extra.StockStyle || "",
    Kind: Extra.Kind || "Base",
    Chance: Number.isFinite(Extra.Chance) ? Extra.Chance : 1
  };
}

function Rug(SlotName, X, Z, Width, Depth, Variant = 0) {
  return { Slot: SlotName, X, Z, Width, Depth, Variant, Kind: "Rug" };
}

function Partition(SlotName, X, Z, Length = 4.0) {
  return { Slot: SlotName, X, Z, Length, Width: 0.15, Depth: Length, Kind: "Partition" };
}

function LivingRoomTemplateA() {
  return {
    Name: "LivingRoomTemplateA",
    Base: [
      Slot("Living.Left.Couch", "Couch_Large1", -11.55, 5.55, 0, { Decorations: ["PillowA", "PillowB"] }),
      Slot("Living.Left.Chair", "Chair_2", -7.10, 4.80, 0.10),
      Slot("Living.Left.Lamp", "Light_Floor1", -13.75, 4.20, 0, { Sellable: false }),
      Slot("Living.Right.Couch", "Couch_L", 11.55, -5.45, Math.PI, { Decorations: ["PillowA", "PillowB"] }),
      Slot("Living.Right.Chair", "Chair_2", 7.10, -4.70, -0.10),
      Slot("Living.Right.Lamp", "Light_Floor1", 13.75, -4.05, 0, { Sellable: false })
    ],
    Rugs: [
      Rug("Living.Left.Rug", -10.10, 5.25, 7.00, 4.50, 0),
      Rug("Living.Right.Rug", 10.10, -5.15, 7.00, 4.50, 1)
    ],
    Sale: [
      Slot("Living.Left.CoffeeTable", "RetailCoffeeTableR84", -9.10, 5.55, 0, { Kind: "Sale", AssetKey: "CoffeeTable", Name: "RetailCoffeeTableR84", PriceZOffset: 0.20 }),
      Slot("Living.Right.SideTable", "RetailSideTableR84", 9.10, -5.45, 0, { Kind: "Sale", AssetKey: "SideTable", Name: "RetailSideTableR84", PriceZOffset: -0.20 })
    ],
    Retail: [
      Slot("Living.Left.DisplayShelf", "RetailLivingShelfR79", -14.10, -4.35, Math.PI / 2, { Kind: "Retail", AssetKey: "ShelfSmallDecorated", Name: "RetailLivingShelfR79", TargetHeight: 1.42, MaximumWidth: 1.25, MaximumDepth: 0.72, StockStyle: "Books" }),
      Slot("Living.Right.AccentChair", "RetailArmchairR79", 14.00, 3.95, -Math.PI / 2, { Kind: "Retail", AssetKey: "ArmchairPillows", Name: "RetailArmchairR79", TargetHeight: 0.96, MaximumWidth: 1.35, MaximumDepth: 1.35 })
    ],
    Partitions: [
      Partition("Living.Left.Backdrop", -14.85, 4.20, 4.0),
      Partition("Living.Right.Backdrop", 14.85, -4.20, 4.0)
    ]
  };
}

function LivingRoomTemplateB() {
  const Plan = LivingRoomTemplateA();
  Plan.Name = "LivingRoomTemplateB";
  for (const GroupName of ["Base", "Rugs", "Sale", "Retail", "Partitions"]) {
    for (const Entry of Plan[GroupName]) {
      Entry.Z *= -1;
      if ("Rotation" in Entry) Entry.Rotation = -Entry.Rotation;
    }
  }
  return Plan;
}

function BedroomTemplateA() {
  return {
    Name: "BedroomTemplateA",
    Base: [
      Slot("Bedroom.Left.King", "Bed_King", -11.25, 5.35, 0, { Decorations: ["PillowA", "PillowB"] }),
      Slot("Bedroom.Left.NightstandInner", "NightStand_2", -8.65, 5.35, 0, { Decorations: ["TableLamp"] }),
      Slot("Bedroom.Left.NightstandOuter", "NightStand_2", -13.75, 5.35, 0),
      Slot("Bedroom.Right.King", "Bed_King", 11.25, -5.35, Math.PI, { Decorations: ["PillowA", "PillowB"] }),
      Slot("Bedroom.Right.NightstandInner", "NightStand_2", 8.65, -5.35, 0, { Decorations: ["TableLamp"] }),
      Slot("Bedroom.Right.NightstandOuter", "NightStand_2", 13.75, -5.35, 0),
      Slot("Bedroom.Left.Single", "Bed_Single", -10.25, -4.25, 0, { Decorations: ["PillowB"] })
    ],
    Rugs: [
      Rug("Bedroom.Left.Rug", -11.05, 5.35, 7.10, 4.60, 2),
      Rug("Bedroom.Right.Rug", 11.05, -5.35, 7.10, 4.60, 3)
    ],
    Sale: [],
    Retail: [
      Slot("Bedroom.Left.Cabinet", "RetailBedroomCabinetR79", -14.05, -1.55, Math.PI / 2, { Kind: "Retail", AssetKey: "CabinetSmallDecorated", Name: "RetailBedroomCabinetR79", TargetHeight: 1.32, MaximumWidth: 1.30, MaximumDepth: 0.82, StockStyle: "Books" }),
      Slot("Bedroom.Right.AccentChair", "RetailBedroomChairR79", 13.80, 2.35, -Math.PI / 2, { Kind: "Retail", AssetKey: "ArmchairPillows", Name: "RetailBedroomChairR79", TargetHeight: 0.90, MaximumWidth: 1.30, MaximumDepth: 1.30 })
    ],
    Partitions: [
      Partition("Bedroom.Left.Backdrop", -14.85, 4.10, 4.0),
      Partition("Bedroom.Right.Backdrop", 14.85, -4.10, 4.0)
    ]
  };
}

function BedroomTemplateB() {
  const Plan = BedroomTemplateA();
  Plan.Name = "BedroomTemplateB";
  for (const GroupName of ["Base", "Rugs", "Retail", "Partitions"]) {
    for (const Entry of Plan[GroupName]) Entry.Z *= -1;
  }
  const Single = Plan.Base.find(Entry => Entry.Slot === "Bedroom.Left.Single");
  if (Single) {
    Single.X = 10.25;
    Single.Z = -4.25;
    Single.Slot = "Bedroom.Right.Single";
    Single.Rotation = Math.PI;
  }
  return Plan;
}

function KitchenRetailSlot(SlotName, Model, AssetKey, X, Z, Rotation, TargetHeight, MaximumWidth, MaximumDepth, Extra = {}) {
  return Slot(SlotName, Model, X, Z, Rotation, {
    Kind: "Retail",
    AssetKey,
    Name: Model,
    TargetHeight,
    MaximumWidth,
    MaximumDepth,
    ...Extra
  });
}

function KitchenTemplateA() {
  return {
    Name: "KitchenTemplateA",
    Base: [
      Slot("Kitchen.Left.Fridge", "Kitchen_Fridge", -14.00, 6.75, 0),
      Slot("Kitchen.Left.CabinetA", "Kitchen_Cabinet1", -12.25, 6.35, 0.04),
      Slot("Kitchen.Left.CabinetB", "Kitchen_Cabinet1", -9.35, 7.25, -0.06),
      Slot("Kitchen.Right.Fridge", "Kitchen_Fridge", 14.00, -6.05, Math.PI),
      Slot("Kitchen.Right.CabinetA", "Kitchen_Cabinet1", 12.15, -6.65, Math.PI - 0.04),
      Slot("Kitchen.Right.CabinetB", "Kitchen_Cabinet1", 9.30, -7.20, Math.PI + 0.05)
    ],
    Rugs: [],
    Sale: [
      Slot("Kitchen.Left.Dining", "RetailDiningTableR84", -10.20, -3.85, 0.05, { Kind: "Sale", AssetKey: "DiningTable", Name: "RetailDiningTableR84" }),
      Slot("Kitchen.Right.SideTable", "RetailSideTableR84", 9.55, 4.25, -0.08, { Kind: "Sale", AssetKey: "SideTable", Name: "RetailSideTableR84" })
    ],
    Retail: [
      KitchenRetailSlot("Kitchen.Left.StoveDecorated", "RetailKitchenStoveDecoratedR90", "KitchenStoveDecorated", -6.45, 5.15, 0.12, 0.98, 1.46, 1.46),
      KitchenRetailSlot("Kitchen.Left.Sink", "RetailKitchenSinkR90", "KitchenSink", -10.75, 1.65, -0.08, 1.02, 1.36, 1.20),
      KitchenRetailSlot("Kitchen.Left.Oven", "RetailKitchenOvenR90", "KitchenOven", -6.25, -1.65, 0.04, 1.08, 1.18, 0.68),
      KitchenRetailSlot("Kitchen.Right.StoveMulti", "RetailKitchenStoveMultiR90", "KitchenStoveMulti", 6.35, -4.75, Math.PI - 0.10, 0.92, 1.42, 1.44),
      KitchenRetailSlot("Kitchen.Right.SinkBacksplash", "RetailKitchenSinkBacksplashR90", "KitchenSinkBacksplash", 10.85, -1.25, Math.PI + 0.07, 1.04, 1.38, 1.22),
      KitchenRetailSlot("Kitchen.Right.Oven", "RetailKitchenOvenR90", "KitchenOven", 6.55, 2.65, Math.PI - 0.05, 1.08, 1.18, 0.68),
      Slot("Kitchen.Right.DisplayCabinet", "RetailDisplayCabinetR79", 14.05, 2.75, -Math.PI / 2, { Kind: "Retail", AssetKey: "CabinetSmallDecorated", Name: "RetailDisplayCabinetR79", TargetHeight: 1.22, MaximumWidth: 1.25, MaximumDepth: 0.78, StockStyle: "Books" })
    ],
    Partitions: []
  };
}

function KitchenTemplateB() {
  return {
    Name: "KitchenTemplateB",
    Base: [
      Slot("Kitchen.Left.Fridge", "Kitchen_Fridge", -13.85, -7.15, 0),
      Slot("Kitchen.Left.CabinetA", "Kitchen_Cabinet1", -11.85, -6.45, 0.06),
      Slot("Kitchen.Left.CabinetB", "Kitchen_Cabinet1", -8.95, -7.25, -0.05),
      Slot("Kitchen.Right.Fridge", "Kitchen_Fridge", 13.85, 6.55, Math.PI),
      Slot("Kitchen.Right.CabinetA", "Kitchen_Cabinet1", 11.70, 6.10, Math.PI - 0.06),
      Slot("Kitchen.Right.CabinetB", "Kitchen_Cabinet1", 9.05, 7.15, Math.PI + 0.05)
    ],
    Rugs: [],
    Sale: [
      Slot("Kitchen.Right.Dining", "RetailDiningTableR84", 10.15, -3.60, -0.05, { Kind: "Sale", AssetKey: "DiningTable", Name: "RetailDiningTableR84" }),
      Slot("Kitchen.Left.SideTable", "RetailSideTableR84", -9.45, 4.15, 0.08, { Kind: "Sale", AssetKey: "SideTable", Name: "RetailSideTableR84" })
    ],
    Retail: [
      KitchenRetailSlot("Kitchen.Left.StoveSingle", "RetailKitchenStoveSingleR90", "KitchenStoveSingle", -6.25, -5.55, 0.09, 0.92, 1.40, 1.42),
      KitchenRetailSlot("Kitchen.Left.SinkBacksplash", "RetailKitchenSinkBacksplashR90", "KitchenSinkBacksplash", -10.55, -1.15, -0.07, 1.04, 1.38, 1.22),
      KitchenRetailSlot("Kitchen.Left.StoveMulti", "RetailKitchenStoveMultiR90", "KitchenStoveMulti", -6.75, 2.95, -0.11, 0.92, 1.42, 1.44),
      KitchenRetailSlot("Kitchen.Right.StoveDecorated", "RetailKitchenStoveDecoratedR90", "KitchenStoveDecorated", 6.30, 5.40, Math.PI - 0.12, 0.98, 1.46, 1.46),
      KitchenRetailSlot("Kitchen.Right.Sink", "RetailKitchenSinkR90", "KitchenSink", 10.70, 1.15, Math.PI + 0.06, 1.02, 1.36, 1.20),
      KitchenRetailSlot("Kitchen.Right.Oven", "RetailKitchenOvenR90", "KitchenOven", 6.55, -2.85, Math.PI + 0.04, 1.08, 1.18, 0.68),
      Slot("Kitchen.Left.DisplayCabinet", "RetailDisplayCabinetR79", -14.05, 3.45, Math.PI / 2, { Kind: "Retail", AssetKey: "CabinetSmallDecorated", Name: "RetailDisplayCabinetR79", TargetHeight: 1.22, MaximumWidth: 1.25, MaximumDepth: 0.78, StockStyle: "Books" })
    ],
    Partitions: []
  };
}

function BathroomTemplateA() {
  return {
    Name: "BathroomTemplateA",
    Base: [
      Slot("Bathroom.Left.Tub", "Bathroom_Bathtub", -11.80, 5.50, Math.PI / 2),
      Slot("Bathroom.Left.ToiletA", "Bathroom_Toilet", -8.55, 5.50, 0),
      Slot("Bathroom.Left.ToiletB", "Bathroom_Toilet", -11.30, -4.65, 0),
      Slot("Bathroom.Right.Tub", "Bathroom_Bathtub", 11.80, -5.50, -Math.PI / 2),
      Slot("Bathroom.Right.ToiletA", "Bathroom_Toilet", 8.55, -5.50, Math.PI),
      Slot("Bathroom.Right.ToiletB", "Bathroom_Toilet", 11.30, 4.65, Math.PI)
    ],
    Rugs: [],
    Sale: [],
    Retail: [
      Slot("Bathroom.Left.DisplayCabinet", "RetailDisplayCabinetR79", -14.05, 0.20, Math.PI / 2, { Kind: "Retail", AssetKey: "CabinetSmallDecorated", Name: "RetailDisplayCabinetR79", TargetHeight: 1.22, MaximumWidth: 1.25, MaximumDepth: 0.78, StockStyle: "Books" })
    ],
    Partitions: [
      Partition("Bathroom.Left.Backdrop", -14.85, 4.15, 3.8),
      Partition("Bathroom.Right.Backdrop", 14.85, -4.15, 3.8)
    ]
  };
}

function BathroomTemplateB() {
  const Plan = BathroomTemplateA();
  Plan.Name = "BathroomTemplateB";
  for (const GroupName of ["Base", "Retail", "Partitions"]) {
    for (const Entry of Plan[GroupName]) Entry.Z *= -1;
  }
  return Plan;
}

function WarehouseTemplateA() {
  const Base = [];
  let NumberIndex = 0;
  for (const X of [-12.60, -9.35, 9.35, 12.60]) {
    for (const Z of [-6.20, 0, 6.20]) {
      Base.push(Slot(`Warehouse.Shelf.${NumberIndex}`, "Shelf_Large", X, Z, X < 0 ? 0 : Math.PI, { StockStyle: "Books" }));
      NumberIndex += 1;
    }
  }
  Base.push(Slot("Warehouse.Left.Bookcase", "Bookshelf", -14.35, -8.95, Math.PI / 2, { StockStyle: "Books" }));
  Base.push(Slot("Warehouse.Right.Bookcase", "Bookshelf", 14.35, 8.95, -Math.PI / 2, { StockStyle: "Books" }));
  return {
    Name: "WarehouseTemplateA",
    Base,
    Rugs: [],
    Sale: [],
    Retail: [
      Slot("Warehouse.Left.RetailShelf", "RetailStorageShelfR79", -14.10, 8.50, Math.PI / 2, { Kind: "Retail", AssetKey: "ShelfSmallDecorated", Name: "RetailStorageShelfR79", TargetHeight: 1.52, MaximumWidth: 1.35, MaximumDepth: 0.78, StockStyle: "Books" }),
      Slot("Warehouse.Right.RetailCabinet", "RetailStorageCabinetR79", 14.10, -8.50, -Math.PI / 2, { Kind: "Retail", AssetKey: "CabinetSmallDecorated", Name: "RetailStorageCabinetR79", TargetHeight: 1.18, MaximumWidth: 1.25, MaximumDepth: 0.78, StockStyle: "Books" })
    ],
    Partitions: []
  };
}

function WarehouseTemplateB() {
  const Plan = WarehouseTemplateA();
  Plan.Name = "WarehouseTemplateB";
  for (const Entry of Plan.Base) Entry.Z *= -1;
  for (const Entry of Plan.Retail) Entry.Z *= -1;
  return Plan;
}

function ShowroomTemplateA() {
  return {
    Name: "ShowroomTemplateA",
    Base: [
      Slot("Showroom.Left.Couch", "Couch_Large1", -11.40, 5.25, 0, { Decorations: ["PillowA", "PillowB"] }),
      Slot("Showroom.Left.Chair", "Chair_2", -7.15, 4.50, 0.08),
      Slot("Showroom.Right.Bed", "Bed_Single", 11.45, -5.25, Math.PI, { Decorations: ["PillowB"] }),
      Slot("Showroom.Right.Bookshelf", "Bookshelf", 14.00, 2.80, -Math.PI / 2, { StockStyle: "Books" }),
      Slot("Showroom.Left.Table", "Table_RoundLarge", -9.40, -4.60, 0),
      Slot("Showroom.Left.AccentChair", "Chair_2", -7.10, -4.60, 0)
    ],
    Rugs: [
      Rug("Showroom.Left.Rug", -10.10, 5.00, 7.00, 4.40, 4),
      Rug("Showroom.Right.Rug", 10.80, -5.10, 6.40, 4.30, 5)
    ],
    Sale: [
      Slot("Showroom.Left.CoffeeTable", "RetailCoffeeTableR84", -9.00, 5.25, 0, { Kind: "Sale", AssetKey: "CoffeeTable", Name: "RetailCoffeeTableR84" }),
      Slot("Showroom.Right.SideTable", "RetailSideTableR84", 8.85, -5.25, 0, { Kind: "Sale", AssetKey: "SideTable", Name: "RetailSideTableR84" })
    ],
    Retail: [
      Slot("Showroom.Right.AccentChair", "RetailArmchairR79", 13.80, -0.60, -Math.PI / 2, { Kind: "Retail", AssetKey: "ArmchairPillows", Name: "RetailArmchairR79", TargetHeight: 0.96, MaximumWidth: 1.35, MaximumDepth: 1.35 })
    ],
    Partitions: [
      Partition("Showroom.Left.Backdrop", -14.85, 4.00, 4.0),
      Partition("Showroom.Right.Backdrop", 14.85, -4.00, 4.0)
    ]
  };
}

function ShowroomTemplateB() {
  const Plan = ShowroomTemplateA();
  Plan.Name = "ShowroomTemplateB";
  for (const GroupName of ["Base", "Rugs", "Sale", "Retail", "Partitions"]) {
    for (const Entry of Plan[GroupName]) Entry.Z *= -1;
  }
  return Plan;
}

function ClearanceTemplateA() {
  return {
    Name: "ClearanceTemplateA",
    Base: [
      Slot("Clearance.Left.Couch", "Couch_Large1", -12.00, 6.20, 0, { Decorations: ["PillowA"] }),
      Slot("Clearance.Left.ChairA", "Chair_2", -8.10, 6.20, 0),
      Slot("Clearance.Left.Table", "Table_RoundLarge", -10.10, 0, 0),
      Slot("Clearance.Left.ChairB", "Chair_2", -7.45, 0, 0),
      Slot("Clearance.Right.Bed", "Bed_Single", 12.00, -6.20, Math.PI, { Decorations: ["PillowB"] }),
      Slot("Clearance.Right.ChairA", "Chair_2", 8.10, -6.20, Math.PI),
      Slot("Clearance.Right.Bookshelf", "Bookshelf", 13.85, 0, -Math.PI / 2, { StockStyle: "Books" })
    ],
    Rugs: [
      Rug("Clearance.Left.Rug", -10.20, 6.00, 7.10, 4.00, 6),
      Rug("Clearance.Right.Rug", 10.20, -6.00, 7.10, 4.00, 7)
    ],
    Sale: [
      Slot("Clearance.Left.SideTable", "RetailSideTableR84", -7.50, -5.80, 0, { Kind: "Sale", AssetKey: "SideTable", Name: "RetailSideTableR84" }),
      Slot("Clearance.Right.CoffeeTable", "RetailCoffeeTableR84", 9.50, 5.70, 0, { Kind: "Sale", AssetKey: "CoffeeTable", Name: "RetailCoffeeTableR84" }),
      Slot("Clearance.Right.BoxShelf", "RetailBoxShelfR84", 13.80, 6.00, -Math.PI / 2, { Kind: "Sale", AssetKey: "BoxShelf", Name: "RetailBoxShelfR84" })
    ],
    Retail: [
      Slot("Clearance.Left.DisplayShelf", "RetailLivingShelfR79", -14.05, -1.90, Math.PI / 2, { Kind: "Retail", AssetKey: "ShelfSmallDecorated", Name: "RetailLivingShelfR79", TargetHeight: 1.42, MaximumWidth: 1.25, MaximumDepth: 0.72, StockStyle: "Books" })
    ],
    Partitions: []
  };
}

function ClearanceTemplateB() {
  const Plan = ClearanceTemplateA();
  Plan.Name = "ClearanceTemplateB";
  for (const GroupName of ["Base", "Rugs", "Sale", "Retail"]) {
    for (const Entry of Plan[GroupName]) Entry.Z *= -1;
  }
  return Plan;
}

const Templates = Object.freeze({
  "LIVING ROOM": [LivingRoomTemplateA, LivingRoomTemplateB],
  "BEDROOMS": [BedroomTemplateA, BedroomTemplateB],
  "KITCHENS": [KitchenTemplateA, KitchenTemplateB],
  "BATHROOMS": [BathroomTemplateA, BathroomTemplateB],
  "WAREHOUSE": [WarehouseTemplateA, WarehouseTemplateB],
  "STORAGE": [WarehouseTemplateA, WarehouseTemplateB],
  "SHOWROOM": [ShowroomTemplateA, ShowroomTemplateB],
  "CLEARANCE": [ClearanceTemplateA, ClearanceTemplateB]
});

function RotatedFootprint(Entry) {
  const C = Math.abs(Math.cos(Number(Entry.Rotation) || 0));
  const S = Math.abs(Math.sin(Number(Entry.Rotation) || 0));
  return {
    Width: Entry.Width * C + Entry.Depth * S,
    Depth: Entry.Width * S + Entry.Depth * C
  };
}

function BoundsFor(Entry) {
  const Size = RotatedFootprint(Entry);
  return {
    MinX: Entry.X - Size.Width * 0.5,
    MaxX: Entry.X + Size.Width * 0.5,
    MinZ: Entry.Z - Size.Depth * 0.5,
    MaxZ: Entry.Z + Size.Depth * 0.5
  };
}

function Overlap(A, B, Padding = SLOT_SPACING) {
  return A.MaxX > B.MinX - Padding && A.MinX < B.MaxX + Padding && A.MaxZ > B.MinZ - Padding && A.MinZ < B.MaxZ + Padding;
}

function ValidDisplayBounds(Bounds) {
  if (Bounds.MinX < -DISPLAY_OUTER_EDGE || Bounds.MaxX > DISPLAY_OUTER_EDGE) return false;
  if (Bounds.MinZ < -MERCHANDISE_Z_LIMIT || Bounds.MaxZ > MERCHANDISE_Z_LIMIT) return false;
  if (Bounds.MinX < CENTRAL_AISLE_HALF_WIDTH && Bounds.MaxX > -CENTRAL_AISLE_HALF_WIDTH) return false;
  const FullyLeft = Bounds.MaxX <= -DISPLAY_INNER_EDGE;
  const FullyRight = Bounds.MinX >= DISPLAY_INNER_EDGE;
  return FullyLeft || FullyRight;
}

function IncludeOptional(Seed, Entry) {
  if (Entry.Chance >= 1) return true;
  return SeedRoll(Seed, Entry.Slot) <= Entry.Chance;
}

function AddDenseDepartmentSlots(Layout, Theme, Seed) {
  const ExtraBase = [];
  const ExtraRetail = [];
  const Variant = Math.floor(SeedRoll(Seed, `${Theme}:DensityPattern`) * 3) % 3;
  const Patterns = [
    { LeftNear: -6.60, RightNear: 5.05, LeftMid: 0.85, RightMid: -1.95 },
    { LeftNear: -4.95, RightNear: 6.65, LeftMid: 2.55, RightMid: -0.45 },
    { LeftNear: -7.45, RightNear: 3.85, LeftMid: -0.65, RightMid: 2.10 }
  ];
  const P = Patterns[Variant];

  if (Theme === "LIVING ROOM") {
    ExtraBase.push(
      Slot("Density.Living.Left.Table", "Table_RoundLarge", -9.75, P.LeftNear, 0.08),
      Slot("Density.Living.Left.Chair", "Chair_2", -6.05, P.LeftNear + 0.70, 0.18),
      Slot("Density.Living.Left.Bookshelf", "Bookshelf", -13.75, P.LeftMid, Math.PI / 2, { StockStyle: "Books" }),
      Slot("Density.Living.Right.Table", "Table_RoundLarge", 9.95, P.RightNear, -0.06),
      Slot("Density.Living.Right.Chair", "Chair_2", 5.95, P.RightNear - 0.65, -0.20),
      Slot("Density.Living.Right.Lamp", "Light_Floor1", 12.95, P.RightMid, 0, { Sellable: false })
    );
  } else if (Theme === "BEDROOMS") {
    ExtraBase.push(
      Slot("Density.Bedroom.Left.Stand", "NightStand_2", -6.00, P.LeftNear, 0, { Decorations: ["TableLamp"] }),
      Slot("Density.Bedroom.Left.Chair", "Chair_2", -9.15, P.LeftMid, 0.16),
      Slot("Density.Bedroom.Left.Single", "Bed_Single", -12.10, P.LeftNear + 2.10, 0.08, { Decorations: ["PillowB"] }),
      Slot("Density.Bedroom.Right.Stand", "NightStand_2", 6.10, P.RightNear, 0, { Decorations: ["TableLamp"] }),
      Slot("Density.Bedroom.Right.Chair", "Chair_2", 9.25, P.RightMid, -0.16),
      Slot("Density.Bedroom.Right.Single", "Bed_Single", 12.00, P.RightNear - 2.10, Math.PI - 0.08, { Decorations: ["PillowB"] })
    );
  } else if (Theme === "KITCHENS") {
    const LeftStoveKey = Variant === 0 ? "KitchenStoveSingle" : Variant === 1 ? "KitchenStoveMulti" : "KitchenStoveDecorated";
    const LeftStoveModel = Variant === 0 ? "RetailKitchenStoveSingleR90" : Variant === 1 ? "RetailKitchenStoveMultiR90" : "RetailKitchenStoveDecoratedR90";
    const RightStoveKey = Variant === 2 ? "KitchenStoveSingle" : Variant === 0 ? "KitchenStoveMulti" : "KitchenStoveDecorated";
    const RightStoveModel = Variant === 2 ? "RetailKitchenStoveSingleR90" : Variant === 0 ? "RetailKitchenStoveMultiR90" : "RetailKitchenStoveDecoratedR90";

    ExtraRetail.push(
      KitchenRetailSlot("Density.Kitchen.Left.NearStove", LeftStoveModel, LeftStoveKey, -5.95, P.LeftNear, 0.12, 0.94, 1.46, 1.46),
      KitchenRetailSlot("Density.Kitchen.Left.Oven", "RetailKitchenOvenR90", "KitchenOven", -6.65, P.LeftMid, -0.04, 1.08, 1.18, 0.68),
      KitchenRetailSlot("Density.Kitchen.Left.Sink", "RetailKitchenSinkR90", "KitchenSink", -11.55, P.LeftNear + 2.35, 0.06, 1.02, 1.36, 1.20),
      KitchenRetailSlot("Density.Kitchen.Right.NearStove", RightStoveModel, RightStoveKey, 5.95, P.RightNear, Math.PI - 0.12, 0.94, 1.46, 1.46),
      KitchenRetailSlot("Density.Kitchen.Right.Oven", "RetailKitchenOvenR90", "KitchenOven", 6.65, P.RightMid, Math.PI + 0.04, 1.08, 1.18, 0.68),
      KitchenRetailSlot("Density.Kitchen.Right.Sink", "RetailKitchenSinkBacksplashR90", "KitchenSinkBacksplash", 11.55, P.RightNear - 2.35, Math.PI - 0.06, 1.04, 1.38, 1.22)
    );
  } else if (Theme === "BATHROOMS") {
    ExtraBase.push(
      Slot("Density.Bathroom.Left.ToiletNear", "Bathroom_Toilet", -5.85, P.LeftNear, 0.12),
      Slot("Density.Bathroom.Left.Tub", "Bathroom_Bathtub", -9.65, P.LeftMid, Math.PI / 2 + 0.08),
      Slot("Density.Bathroom.Left.ToiletOuter", "Bathroom_Toilet", -13.10, P.LeftNear + 2.60, -0.08),
      Slot("Density.Bathroom.Right.ToiletNear", "Bathroom_Toilet", 5.95, P.RightNear, Math.PI - 0.12),
      Slot("Density.Bathroom.Right.Tub", "Bathroom_Bathtub", 9.70, P.RightMid, -Math.PI / 2 - 0.08),
      Slot("Density.Bathroom.Right.ToiletOuter", "Bathroom_Toilet", 13.05, P.RightNear - 2.55, Math.PI + 0.08)
    );
  } else if (Theme === "WAREHOUSE" || Theme === "STORAGE") {
    ExtraBase.push(
      Slot("Density.Warehouse.Left.ShelfNear", "Shelf_Large", -5.95, P.LeftNear, 0.08, { StockStyle: "Books" }),
      Slot("Density.Warehouse.Left.Bookcase", "Bookshelf", -7.20, P.LeftMid, -0.06, { StockStyle: "Books" }),
      Slot("Density.Warehouse.Right.ShelfNear", "Shelf_Large", 5.95, P.RightNear, Math.PI - 0.08, { StockStyle: "Books" }),
      Slot("Density.Warehouse.Right.Bookcase", "Bookshelf", 7.20, P.RightMid, Math.PI + 0.06, { StockStyle: "Books" })
    );
    ExtraRetail.push(
      Slot("Density.Warehouse.Left.RetailShelf", "RetailStorageShelfR79", -12.95, P.LeftNear + 1.85, Math.PI / 2 - 0.06, { Kind: "Retail", AssetKey: "ShelfSmallDecorated", Name: "RetailStorageShelfR79", TargetHeight: 1.52, MaximumWidth: 1.35, MaximumDepth: 0.78, StockStyle: "Books" }),
      Slot("Density.Warehouse.Right.RetailCabinet", "RetailStorageCabinetR79", 12.95, P.RightNear - 1.85, -Math.PI / 2 + 0.06, { Kind: "Retail", AssetKey: "CabinetSmallDecorated", Name: "RetailStorageCabinetR79", TargetHeight: 1.18, MaximumWidth: 1.25, MaximumDepth: 0.78, StockStyle: "Books" })
    );
  } else if (Theme === "SHOWROOM") {
    ExtraBase.push(
      Slot("Density.Showroom.Left.Table", "Table_RoundLarge", -9.80, P.LeftNear, 0.08),
      Slot("Density.Showroom.Left.Chair", "Chair_2", -5.95, P.LeftNear + 0.75, 0.18),
      Slot("Density.Showroom.Left.Bookshelf", "Bookshelf", -13.85, P.LeftMid, Math.PI / 2, { StockStyle: "Books" }),
      Slot("Density.Showroom.Right.Couch", "Couch_Large1", 11.15, P.RightNear, Math.PI - 0.05, { Decorations: ["PillowA", "PillowB"] }),
      Slot("Density.Showroom.Right.Chair", "Chair_2", 5.95, P.RightMid, -0.18),
      Slot("Density.Showroom.Right.Table", "Table_RoundLarge", 9.55, P.RightNear - 2.10, -0.08)
    );
  } else if (Theme === "CLEARANCE") {
    ExtraBase.push(
      Slot("Density.Clearance.Left.Bookshelf", "Bookshelf", -13.75, P.LeftNear, Math.PI / 2, { StockStyle: "Books" }),
      Slot("Density.Clearance.Left.Chair", "Chair_2", -5.95, P.LeftNear + 1.15, 0.20),
      Slot("Density.Clearance.Left.Nightstand", "NightStand_2", -8.60, P.LeftMid, -0.08),
      Slot("Density.Clearance.Right.Table", "Table_RoundLarge", 9.75, P.RightNear, -0.08),
      Slot("Density.Clearance.Right.Chair", "Chair_2", 5.95, P.RightNear - 1.10, -0.20),
      Slot("Density.Clearance.Right.Bookshelf", "Bookshelf", 13.75, P.RightMid, -Math.PI / 2, { StockStyle: "Books" })
    );
  }

  for (const Entry of ExtraBase) Entry.Required = false;
  for (const Entry of ExtraRetail) Entry.Required = false;
  Layout.Base.push(...ExtraBase);
  Layout.Retail.push(...ExtraRetail);
}

function AddCardboardBoxAisle(Layout, Theme, Index, Seed) {
  const DenseStorage = Theme === "WAREHOUSE" || Theme === "STORAGE";
  const Side = SeedRoll(Seed, "CardboardAisleSide") < 0.5 ? -1 : 1;
  const BaseX = DenseStorage ? 5.90 : 5.85;
  const ZPositions = DenseStorage
    ? [-9.00, -7.20, -5.40, -3.60, -1.80, 0, 1.80, 3.60, 5.40, 7.20, 9.00]
    : [-8.80, -6.60, -4.40, -2.20, 0, 2.20, 4.40, 6.60, 8.80];
  const TargetCount = DenseStorage ? 10 : (Theme === "SHOWROOM" || Theme === "CLEARANCE" ? 7 : 5);
  const RotationChoices = [-0.14, -0.08, -0.02, 0.04, 0.10, 0.15];
  const ScaleChoices = [0.86, 0.93, 1.00, 1.06, 1.12];
  const LaneOffsets = [0, 0.52, 0.18, 0.66, 0.08, 0.42];
  const ZJitter = [-0.22, 0.12, -0.08, 0.24, 0.04, -0.16];
  const Start = Math.floor(SeedRoll(Seed, "CardboardAisleStart") * ZPositions.length) % ZPositions.length;
  let Added = 0;

  for (let Offset = 0; Offset < ZPositions.length && Added < TargetCount; Offset += 1) {
    const BaseZ = ZPositions[(Start + Offset) % ZPositions.length];
    const JitterIndex = Math.floor(SeedRoll(Seed, `CardboardAisleJitter:${Offset}`) * ZJitter.length) % ZJitter.length;
    const Z = BaseZ + ZJitter[JitterIndex];
    if (Index === 0 && Z > 5.20) continue;

    const RotationIndex = Math.floor(SeedRoll(Seed, `CardboardAisleRotation:${Offset}`) * RotationChoices.length) % RotationChoices.length;
    const ScaleIndex = Math.floor(SeedRoll(Seed, `CardboardAisleScale:${Offset}`) * ScaleChoices.length) % ScaleChoices.length;
    const LaneIndex = Math.floor(SeedRoll(Seed, `CardboardAisleLane:${Offset}`) * LaneOffsets.length) % LaneOffsets.length;
    const X = Side * (BaseX + LaneOffsets[LaneIndex]);

    Layout.Sale.push(Slot(
      `CardboardAisle.${Added}`,
      "RetailCardboardBoxR84",
      X,
      Z,
      RotationChoices[RotationIndex] * Side,
      {
        Kind: "Sale",
        AssetKey: "CardboardBox",
        Name: "RetailCardboardBoxR84",
        Sellable: true,
        Required: false,
        Footprint: [0.70, 0.62],
        Scale: ScaleChoices[ScaleIndex]
      }
    ));
    Added += 1;
  }
}

function AddRetailZone(Layout, Index, Seed) {
  if (Index !== 0) return;
  const Side = SeedRoll(Seed, "EntranceRetailZoneSide") < 0.5 ? -1 : 1;
  const Facing = Side < 0 ? Math.PI / 2 : -Math.PI / 2;
  Layout.Zones.push(
    Slot("Entrance.Cart.0", "Cart", Side * 14.25, 6.80, Facing, { Kind: "Zone", Sellable: false }),
    Slot("Entrance.Cart.1", "Cart", Side * 14.25, 8.30, Facing, { Kind: "Zone", Sellable: false }),
    Slot("Entrance.Cart.2", "Cart", Side * 14.25, 9.80, Facing, { Kind: "Zone", Sellable: false }),
    Slot("Entrance.BagShelf", "BagShelf", -Side * 14.15, 8.30, -Facing, { Kind: "Zone", Sellable: false }),
    Slot("Entrance.Basket.0", "Basket", -Side * 12.75, 6.90, -Facing, { Kind: "Zone", Sellable: false }),
    Slot("Entrance.Basket.1", "Basket", -Side * 12.75, 8.30, -Facing, { Kind: "Zone", Sellable: false }),
    Slot("Entrance.Basket.2", "Basket", -Side * 12.75, 9.70, -Facing, { Kind: "Zone", Sellable: false })
  );
  Layout.ZoneHeaders.push(
    { Slot: "Entrance.CartHeader", Text: "CART RETURN", X: Side * 16.84, Z: 8.55, Rotation: Facing, WallMounted: true },
    { Slot: "Entrance.BagHeader", Text: "BAGS + BASKETS", X: -Side * 16.84, Z: 8.60, Rotation: -Facing, WallMounted: true }
  );
}

function ReserveEntranceTransition(Layout, Index) {
  if (Index !== 0) return;
  const FrontLimit = 5.65;
  const KeepSlot = Entry => BoundsFor(Entry).MaxZ <= FrontLimit;
  Layout.Base = (Layout.Base || []).filter(KeepSlot);
  Layout.Retail = (Layout.Retail || []).filter(KeepSlot);
  Layout.Sale = (Layout.Sale || []).filter(KeepSlot);
  Layout.Partitions = (Layout.Partitions || []).filter(Entry => Entry.Z + Entry.Length * 0.5 <= FrontLimit);
  Layout.Rugs = (Layout.Rugs || []).filter(Entry => Entry.Z + Entry.Depth * 0.5 <= FrontLimit);
}

function AddTask(Layout, Index, Seed) {
  if (Index <= 0) return;
  const TypeRoll = Math.floor(SeedRoll(Seed, "TaskType") * 3);
  const Type = TypeRoll === 0 ? "breaker" : TypeRoll === 1 ? "manifest" : "scanner";
  const Side = SeedRoll(Seed, "TaskSide") < 0.5 ? -1 : 1;
  Layout.Task = {
    Slot: "Task.Terminal",
    Type,
    X: Side * 15.05,
    Z: SeedRoll(Seed, "TaskZ") < 0.5 ? -0.80 : 0.80,
    Rotation: Side < 0 ? Math.PI / 2 : -Math.PI / 2,
    Width: Footprints.StoreTask[0],
    Depth: Footprints.StoreTask[1],
    Kind: "Task"
  };
}

function FinalizeLayout(Layout, Seed, CenterZ) {
  const Accepted = [];
  const ReservationEntries = [];
  const All = [
    ...Layout.Base,
    ...Layout.Retail,
    ...Layout.Sale,
    ...Layout.Zones,
    ...(Layout.Task ? [Layout.Task] : [])
  ];

  Layout.ValidationErrors = [];
  Layout.Slots = Object.create(null);
  Layout.PriceAnchors = Object.create(null);
  Layout.Decorations = Object.create(null);

  for (const Entry of All) {
    if (!IncludeOptional(Seed, Entry)) continue;
    const Bounds = BoundsFor(Entry);
    if (!ValidDisplayBounds(Bounds)) {
      if (Entry.Required !== false) Layout.ValidationErrors.push(`${Entry.Slot}: outside approved display zones`);
      continue;
    }
    const Conflict = Accepted.find(Item => Overlap(Bounds, Item.Bounds));
    if (Conflict) {
      if (Entry.Required !== false) Layout.ValidationErrors.push(`${Entry.Slot}: overlaps ${Conflict.Entry.Slot}`);
      continue;
    }
    Accepted.push({ Entry, Bounds });
    ReservationEntries.push({ Slot: Entry.Slot, Bounds, Kind: Entry.Kind });
    Layout.Slots[Entry.Slot] = Entry;
    if (Entry.Decorations.length) Layout.Decorations[Entry.Slot] = [...Entry.Decorations];
    if (Entry.Sellable) {
      const Side = Entry.X < 0 ? -1 : 1;
      const AnchorX = Side < 0 ? Bounds.MaxX + 0.42 : Bounds.MinX - 0.42;
      Layout.PriceAnchors[Entry.Slot] = {
        X: AnchorX,
        Z: Entry.Z + Entry.PriceZOffset
      };
    }
  }

  const FilterGroup = Group => Group.filter(Entry => Layout.Slots[Entry.Slot]);
  Layout.Base = FilterGroup(Layout.Base);
  Layout.Retail = FilterGroup(Layout.Retail);
  Layout.Sale = FilterGroup(Layout.Sale);
  const CardboardBoxes = Layout.Sale.filter(Entry => Entry.AssetKey === "CardboardBox");
  for (let Index = 0; Index < CardboardBoxes.length; Index += 1) {
    const Entry = CardboardBoxes[Index];
    Entry.Sellable = Index === 0;
    if (Index > 0) delete Layout.PriceAnchors[Entry.Slot];
  }
  Layout.Zones = FilterGroup(Layout.Zones);
  if (Layout.Task && !Layout.Slots[Layout.Task.Slot]) Layout.Task = null;

  for (const Entry of Layout.Partitions) {
    const Bounds = BoundsFor({ ...Entry, Rotation: 0 });
    const Conflicts = Accepted.some(Item => Overlap(Bounds, Item.Bounds, 0.20));
    if (Conflicts) {
      Layout.ValidationErrors.push(`${Entry.Slot}: partition conflicts with merchandise`);
      continue;
    }
    ReservationEntries.push({ Slot: Entry.Slot, Bounds, Kind: "Partition" });
    Layout.Slots[Entry.Slot] = Entry;
  }
  Layout.Partitions = Layout.Partitions.filter(Entry => Layout.Slots[Entry.Slot]);

  Layout.Rugs = Layout.Rugs.filter(Entry => {
    const Bounds = {
      MinX: Entry.X - Entry.Width * 0.5,
      MaxX: Entry.X + Entry.Width * 0.5,
      MinZ: Entry.Z - Entry.Depth * 0.5,
      MaxZ: Entry.Z + Entry.Depth * 0.5
    };
    const ClearAisle = Bounds.MaxX <= -CENTRAL_AISLE_HALF_WIDTH || Bounds.MinX >= CENTRAL_AISLE_HALF_WIDTH;
    const Inside = Bounds.MinX >= -DISPLAY_OUTER_EDGE && Bounds.MaxX <= DISPLAY_OUTER_EDGE && Bounds.MinZ >= -MERCHANDISE_Z_LIMIT && Bounds.MaxZ <= MERCHANDISE_Z_LIMIT;
    if (!ClearAisle || !Inside) Layout.ValidationErrors.push(`${Entry.Slot}: rug crosses protected walking space`);
    return ClearAisle && Inside;
  });

  Layout.Reservations = [
    {
      Slot: "Protected.CentralAisle",
      Kind: "Protected",
      Bounds: {
        MinX: -CENTRAL_AISLE_HALF_WIDTH,
        MaxX: CENTRAL_AISLE_HALF_WIDTH,
        MinZ: -12.0,
        MaxZ: 12.0
      }
    },
    ...ReservationEntries
  ].map(Reservation => ({
    ...Reservation,
    Bounds: {
      MinX: Reservation.Bounds.MinX,
      MaxX: Reservation.Bounds.MaxX,
      MinZ: Reservation.Bounds.MinZ + CenterZ,
      MaxZ: Reservation.Bounds.MaxZ + CenterZ
    }
  }));

  for (const GroupName of ["Base", "Rugs", "Retail", "Sale", "Zones", "Partitions"]) {
    for (const Entry of Layout[GroupName]) Entry.Z += CenterZ;
  }
  for (const Header of Layout.ZoneHeaders) Header.Z += CenterZ;
  if (Layout.Task) Layout.Task.Z += CenterZ;
  for (const Anchor of Object.values(Layout.PriceAnchors)) Anchor.Z += CenterZ;

  Layout.CenterAisle = {
    MinX: -CENTRAL_AISLE_HALF_WIDTH,
    MaxX: CENTRAL_AISLE_HALF_WIDTH,
    MinZ: CenterZ - 12.0,
    MaxZ: CenterZ + 12.0
  };
  Layout.LeftShowroom = { MinX: -DISPLAY_OUTER_EDGE, MaxX: -DISPLAY_INNER_EDGE, MinZ: CenterZ - MERCHANDISE_Z_LIMIT, MaxZ: CenterZ + MERCHANDISE_Z_LIMIT };
  Layout.RightShowroom = { MinX: DISPLAY_INNER_EDGE, MaxX: DISPLAY_OUTER_EDGE, MinZ: CenterZ - MERCHANDISE_Z_LIMIT, MaxZ: CenterZ + MERCHANDISE_Z_LIMIT };
  Layout.Transition = {
    Front: { MinZ: CenterZ + MERCHANDISE_Z_LIMIT, MaxZ: CenterZ + 15 },
    Back: { MinZ: CenterZ - 15, MaxZ: CenterZ - MERCHANDISE_Z_LIMIT }
  };

  return Layout;
}

export function CreateChunkLayout({ Index, Seed, Theme, CenterZ }) {
  const ThemeName = String(Theme || "SHOWROOM").toUpperCase();
  const Options = Templates[ThemeName] || Templates.SHOWROOM;
  const VariantIndex = Math.floor(SeedRoll(Seed, `${ThemeName}:Template`) * Options.length) % Options.length;
  const Template = Options[VariantIndex]();
  const Layout = {
    Authority: "StoreLayoutV1",
    Theme: ThemeName,
    Template: Template.Name,
    Seed: Seed >>> 0,
    Index,
    Base: Template.Base || [],
    Rugs: Template.Rugs || [],
    Retail: Template.Retail || [],
    Sale: Template.Sale || [],
    Zones: [],
    ZoneHeaders: [],
    Partitions: Template.Partitions || [],
    Task: null
  };

  AddDenseDepartmentSlots(Layout, ThemeName, Seed);
  ReserveEntranceTransition(Layout, Index);
  AddCardboardBoxAisle(Layout, ThemeName, Index, Seed);
  AddRetailZone(Layout, Index, Seed);
  AddTask(Layout, Index, Seed);

  return FinalizeLayout(Layout, Seed, CenterZ);
}

export function GetLayoutSlot(Layout, SlotName) {
  return Layout?.Slots?.[String(SlotName || "")] || null;
}

export function GetPriceAnchor(Layout, SlotName) {
  return Layout?.PriceAnchors?.[String(SlotName || "")] || null;
}

export function GetDecorationKeys(Layout, SlotName) {
  return Layout?.Decorations?.[String(SlotName || "")] || [];
}

export const StoreLayoutRules = Object.freeze({
  StoreHalfWidth: STORE_HALF_WIDTH,
  CentralAisleHalfWidth: CENTRAL_AISLE_HALF_WIDTH,
  DisplayInnerEdge: DISPLAY_INNER_EDGE,
  DisplayOuterEdge: DISPLAY_OUTER_EDGE,
  MerchandiseZLimit: MERCHANDISE_Z_LIMIT,
  SlotSpacing: SLOT_SPACING
});

window.__STORE_LAYOUT_BUILD__ = "V0.27.7";
