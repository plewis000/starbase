/**
 * Extract recipe data from a URL using schema.org JSON-LD.
 * Falls back to Open Graph / meta tags for basic info.
 */

import * as cheerio from "cheerio";
import { parse as parseDuration } from "tinyduration";

export interface ImportedRecipe {
  title: string;
  source_url: string;
  servings: number | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  instructions: string | null;
  tags: string[];
  ingredients: { name: string; quantity: string }[];
  image_url: string | null;
}

/**
 * Fetch a URL and extract recipe data from JSON-LD structured data.
 */
export async function importRecipeFromUrl(url: string): Promise<ImportedRecipe> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; StarbaseRecipeBot/1.0)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch URL: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Try JSON-LD first
  const recipe = extractJsonLd($);
  if (recipe) return { ...recipe, source_url: url };

  // Fallback: basic meta tag extraction
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text().trim() ||
    "Imported Recipe";

  return {
    title,
    source_url: url,
    servings: null,
    prep_time_minutes: null,
    cook_time_minutes: null,
    instructions: null,
    tags: [],
    ingredients: [],
    image_url: $('meta[property="og:image"]').attr("content") || null,
  };
}

function extractJsonLd($: cheerio.CheerioAPI): Omit<ImportedRecipe, "source_url"> | null {
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    const text = $(scripts[i]).html();
    if (!text) continue;

    try {
      const data = JSON.parse(text);
      const recipeNode = findRecipeNode(data);
      if (recipeNode) return parseRecipeNode(recipeNode);
    } catch {
      // Invalid JSON, skip
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findRecipeNode(data: any): any {
  if (!data) return null;

  // Direct Recipe object
  const type = data["@type"];
  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) {
    return data;
  }

  // @graph array (WordPress/Yoast pattern)
  if (data["@graph"] && Array.isArray(data["@graph"])) {
    for (const node of data["@graph"]) {
      const found = findRecipeNode(node);
      if (found) return found;
    }
  }

  // Top-level array
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseRecipeNode(node: any): Omit<ImportedRecipe, "source_url"> {
  const title = node.name || "Imported Recipe";

  // Servings: recipeYield can be string, number, or array
  let servings: number | null = null;
  if (node.recipeYield) {
    const yieldVal = Array.isArray(node.recipeYield) ? node.recipeYield[0] : node.recipeYield;
    const parsed = parseInt(String(yieldVal), 10);
    if (!isNaN(parsed)) servings = parsed;
  }

  // Durations
  const prep_time_minutes = isoDurationToMinutes(node.prepTime);
  const cook_time_minutes = isoDurationToMinutes(node.cookTime);

  // Instructions: can be string, array of strings, or array of HowToStep objects
  let instructions: string | null = null;
  if (node.recipeInstructions) {
    if (typeof node.recipeInstructions === "string") {
      instructions = node.recipeInstructions;
    } else if (Array.isArray(node.recipeInstructions)) {
      instructions = node.recipeInstructions
        .map((step: string | { text?: string; "@type"?: string }, i: number) => {
          const text = typeof step === "string" ? step : step.text || "";
          return `${i + 1}. ${text.trim()}`;
        })
        .filter((s: string) => s.length > 3)
        .join("\n");
    }
  }

  // Ingredients
  const ingredients: { name: string; quantity: string }[] = [];
  if (node.recipeIngredient && Array.isArray(node.recipeIngredient)) {
    for (const ing of node.recipeIngredient) {
      if (typeof ing === "string" && ing.trim()) {
        ingredients.push({ name: ing.trim(), quantity: "" });
      }
    }
  }

  // Tags: recipeCategory + recipeCuisine + keywords
  const tags: string[] = [];
  for (const field of ["recipeCategory", "recipeCuisine"]) {
    const val = node[field];
    if (typeof val === "string") tags.push(val);
    else if (Array.isArray(val)) tags.push(...val.filter((v: unknown) => typeof v === "string"));
  }
  if (node.keywords) {
    if (typeof node.keywords === "string") {
      tags.push(...node.keywords.split(",").map((k: string) => k.trim()).filter(Boolean));
    } else if (Array.isArray(node.keywords)) {
      tags.push(...node.keywords.filter((v: unknown) => typeof v === "string"));
    }
  }

  // Image
  let image_url: string | null = null;
  if (node.image) {
    if (typeof node.image === "string") image_url = node.image;
    else if (Array.isArray(node.image)) image_url = node.image[0];
    else if (node.image.url) image_url = node.image.url;
  }

  return {
    title,
    servings,
    prep_time_minutes,
    cook_time_minutes,
    instructions,
    tags: [...new Set(tags)], // dedupe
    ingredients,
    image_url,
  };
}

function isoDurationToMinutes(duration: unknown): number | null {
  if (!duration || typeof duration !== "string") return null;
  try {
    const parsed = parseDuration(duration);
    return (parsed.hours || 0) * 60 + (parsed.minutes || 0);
  } catch {
    return null;
  }
}
