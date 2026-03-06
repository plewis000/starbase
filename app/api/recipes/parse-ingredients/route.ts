import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { parseIngredient } from "parse-ingredient";

// POST /api/recipes/parse-ingredients — Parse raw ingredient strings into structured data
export const POST = withAuth(async (request: NextRequest) => {
  const body = await request.json();
  const { ingredients } = body;

  if (!Array.isArray(ingredients)) {
    return NextResponse.json({ error: "ingredients must be an array of strings" }, { status: 400 });
  }

  const parsed = ingredients
    .filter((s: unknown) => typeof s === "string" && s.trim())
    .map((raw: string) => {
      const results = parseIngredient(raw.trim());
      if (results.length > 0 && results[0].description) {
        const p = results[0];
        const qtyParts: string[] = [];
        if (p.quantity != null) qtyParts.push(String(p.quantity));
        if (p.quantity2 != null) qtyParts.push(`-${p.quantity2}`);
        if (p.unitOfMeasure) qtyParts.push(` ${p.unitOfMeasure}`);
        return {
          name: p.description,
          quantity: qtyParts.join("").trim(),
          raw,
        };
      }
      return { name: raw.trim(), quantity: "", raw };
    });

  return NextResponse.json({ ingredients: parsed });
});
