/**
 * Auto-categorize shopping items based on ingredient name keywords.
 * Used by recipe→shopping and meal-plan→shopping conversions.
 */

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Produce: ["lettuce", "tomato", "onion", "garlic", "pepper", "carrot", "potato", "celery", "broccoli", "spinach", "kale", "cucumber", "avocado", "lemon", "lime", "orange", "apple", "banana", "berry", "berries", "mushroom", "zucchini", "squash", "corn", "peas", "herbs", "basil", "cilantro", "parsley", "mint", "ginger", "jalapeño", "cabbage", "cauliflower", "asparagus", "eggplant", "radish", "beet", "turnip", "sweet potato", "green onion", "scallion", "shallot", "leek", "arugula", "romaine", "fruit", "vegetable"],
  Meat: ["chicken", "beef", "pork", "turkey", "lamb", "steak", "ground beef", "bacon", "sausage", "ham", "ribs", "brisket", "tenderloin", "thigh", "breast", "wing", "drumstick", "meatball", "ground turkey", "salmon", "shrimp", "fish", "tuna", "cod", "tilapia", "crab", "lobster", "scallop", "prawn"],
  Dairy: ["milk", "cheese", "butter", "cream", "yogurt", "sour cream", "cream cheese", "mozzarella", "cheddar", "parmesan", "feta", "ricotta", "whipping cream", "half and half", "cottage cheese", "egg", "eggs"],
  Bakery: ["bread", "buns", "rolls", "tortilla", "pita", "bagel", "croissant", "muffin", "baguette", "naan", "flatbread", "english muffin"],
  Frozen: ["frozen", "ice cream", "pizza rolls", "frozen vegetables", "frozen fruit"],
  Pantry: ["flour", "sugar", "salt", "oil", "olive oil", "vinegar", "soy sauce", "pasta", "rice", "noodles", "can", "canned", "broth", "stock", "sauce", "ketchup", "mustard", "mayo", "mayonnaise", "honey", "maple syrup", "peanut butter", "jam", "jelly", "cereal", "oats", "oatmeal", "granola", "nuts", "almonds", "walnuts", "pecans", "chips", "crackers", "breadcrumbs", "panko", "baking", "baking powder", "baking soda", "yeast", "vanilla", "cocoa", "chocolate", "spice", "cumin", "paprika", "oregano", "thyme", "cinnamon", "nutmeg", "turmeric", "chili", "cayenne", "cornstarch", "tomato paste", "tomato sauce", "coconut milk", "lentils", "quinoa"],
  Beverages: ["water", "juice", "soda", "coffee", "tea", "beer", "wine", "sparkling", "kombucha", "lemonade"],
  Cleaning: ["soap", "detergent", "bleach", "sponge", "trash bags", "paper towels", "wipes", "cleaner"],
  "Personal Care": ["shampoo", "conditioner", "toothpaste", "deodorant", "lotion", "razor", "floss", "sunscreen"],
};

export function buildCategoryLookup(categories: { id: string; name: string }[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const cat of categories) {
    const keywords = CATEGORY_KEYWORDS[cat.name];
    if (keywords) {
      for (const kw of keywords) {
        lookup.set(kw, cat.id);
      }
    }
  }
  return lookup;
}

export function autoCategorize(name: string, lookup: Map<string, string>): string | null {
  const lower = name.toLowerCase().trim();
  // Direct match
  if (lookup.has(lower)) return lookup.get(lower)!;
  // Partial match — check if any keyword is contained in the name
  for (const [keyword, catId] of lookup) {
    if (lower.includes(keyword)) return catId;
  }
  return null;
}
