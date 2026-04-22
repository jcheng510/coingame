export const LISTING_CATEGORIES: {
  value: string;
  label: string;
  subcategories: string[];
}[] = [
  { value: "electronics", label: "Electronics", subcategories: ["Phones", "Laptops", "TVs & Monitors", "Audio", "Cameras", "Gaming"] },
  { value: "furniture", label: "Furniture", subcategories: ["Sofas", "Tables", "Chairs", "Beds", "Storage", "Outdoor"] },
  { value: "clothing", label: "Clothing & Shoes", subcategories: ["Men", "Women", "Kids", "Shoes", "Accessories"] },
  { value: "home", label: "Home & Garden", subcategories: ["Kitchen", "Decor", "Appliances", "Tools", "Garden"] },
  { value: "vehicles", label: "Cars & Vehicles", subcategories: ["Cars", "Motorcycles", "Bicycles", "Parts"] },
  { value: "sports", label: "Sports & Outdoors", subcategories: ["Fitness", "Camping", "Bikes", "Team Sports"] },
  { value: "toys", label: "Toys & Games", subcategories: ["Board Games", "Video Games", "Kids Toys", "Collectibles"] },
  { value: "baby", label: "Baby & Kids", subcategories: ["Strollers", "Car Seats", "Clothing", "Toys"] },
  { value: "coins", label: "Coins & Collectibles", subcategories: ["US Coins", "World Coins", "Bullion", "Paper Money"] },
  { value: "other", label: "Other", subcategories: [] },
];

export const LISTING_CONDITIONS: {
  value: "new" | "like_new" | "good" | "fair" | "poor";
  label: string;
  helper: string;
}[] = [
  { value: "new", label: "New", helper: "Never used, in original packaging" },
  { value: "like_new", label: "Like New", helper: "Used once or twice, no signs of wear" },
  { value: "good", label: "Good", helper: "Lightly used, works perfectly" },
  { value: "fair", label: "Fair", helper: "Visible wear, still functional" },
  { value: "poor", label: "For Parts / Not Working", helper: "Broken or needs repair" },
];

export type ListingCondition = typeof LISTING_CONDITIONS[number]["value"];
