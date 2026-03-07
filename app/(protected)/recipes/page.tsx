"use client";

import React, { useState, useEffect, useCallback } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { Recipe, RecipeIngredient, MealPlan, MealPlanEntry, MealType } from "@/lib/types";

// ─── Recipe List + Detail View ──────────────────────────────

export default function RecipesPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"recipes" | "meal-plan">("recipes");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  // Meal plan state
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [mealPlanLoading, setMealPlanLoading] = useState(false);

  const fetchRecipes = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      const res = await fetch(`/api/recipes?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRecipes(data.recipes || []);
      }
    } catch (err) {
      console.error("Failed to fetch recipes:", err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchRecipes(); }, [fetchRecipes]);

  const fetchRecipeDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/recipes/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedRecipe(data.recipe);
      }
    } catch (err) {
      console.error("Failed to fetch recipe:", err);
    }
  };

  const deleteRecipe = async (id: string) => {
    if (!confirm("Delete this recipe?")) return;
    const res = await fetch(`/api/recipes/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Recipe deleted");
      setSelectedRecipe(null);
      fetchRecipes();
    } else {
      toast.error("Failed to delete recipe");
    }
  };

  const addToShoppingList = async (recipeId: string) => {
    const res = await fetch(`/api/recipes/${recipeId}/to-shopping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const data = await res.json();
      toast.success(`Added ${data.items_added} items to shopping list`);
    } else {
      toast.error("Failed to add to shopping list");
    }
  };

  const importFromUrl = async (url: string) => {
    const res = await fetch("/api/recipes/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || "Import failed");
      return;
    }
    const imported = await res.json();
    // Pre-fill as a new recipe for editing
    setEditingRecipe({
      id: "",
      title: imported.title,
      source_url: imported.source_url,
      servings: imported.servings,
      prep_time_minutes: imported.prep_time_minutes,
      cook_time_minutes: imported.cook_time_minutes,
      instructions: imported.instructions,
      tags: imported.tags || [],
      notes: null,
      created_by: "",
      created_at: "",
      updated_at: "",
      ingredients: (imported.ingredients || []).map((ing: { name: string; quantity: string }, i: number) => ({
        id: `temp-${i}`,
        recipe_id: "",
        name: ing.name,
        quantity: ing.quantity,
        category_id: null,
        is_optional: false,
        sort_order: i,
      })),
    } as Recipe);
    setShowImportModal(false);
    setShowRecipeModal(true);
    toast.success(`Imported "${imported.title}" — review and save`);
  };

  // ─── Meal Plan ──────────────────────────────────────────

  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    d.setDate(diff);
    return d.toISOString().slice(0, 10);
  };

  const [currentWeek, setCurrentWeek] = useState(getWeekStart(new Date()));

  const fetchMealPlan = useCallback(async () => {
    setMealPlanLoading(true);
    try {
      const res = await fetch(`/api/meal-plans?week_start=${currentWeek}`);
      if (res.ok) {
        const data = await res.json();
        setMealPlan(data.meal_plans?.[0] || null);
      }
    } catch (err) {
      console.error("Failed to fetch meal plan:", err);
    } finally {
      setMealPlanLoading(false);
    }
  }, [currentWeek]);

  useEffect(() => {
    if (tab === "meal-plan") fetchMealPlan();
  }, [tab, fetchMealPlan]);

  const createMealPlan = async () => {
    const res = await fetch("/api/meal-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week_start: currentWeek }),
    });
    if (res.ok) {
      toast.success("Meal plan created");
      fetchMealPlan();
    } else {
      const data = await res.json();
      if (data.existing_id) {
        fetchMealPlan();
      } else {
        toast.error("Failed to create meal plan");
      }
    }
  };

  const addMealEntry = async (dayOfWeek: number, mealType: MealType, recipeId?: string, label?: string) => {
    if (!mealPlan) return;
    const res = await fetch(`/api/meal-plans/${mealPlan.id}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        day_of_week: dayOfWeek,
        meal_type: mealType,
        recipe_id: recipeId || undefined,
        label: label || undefined,
      }),
    });
    if (res.ok) {
      fetchMealPlan();
    } else {
      toast.error("Failed to add entry");
    }
  };

  const removeMealEntry = async (entryId: string) => {
    if (!mealPlan) return;
    const res = await fetch(`/api/meal-plans/${mealPlan.id}/entries?entry_id=${entryId}`, { method: "DELETE" });
    if (res.ok) {
      fetchMealPlan();
    }
  };

  const mealPlanToShopping = async () => {
    if (!mealPlan) return;
    const res = await fetch(`/api/meal-plans/${mealPlan.id}/to-shopping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const data = await res.json();
      toast.success(`Added ${data.items_added} items to shopping list`);
    } else {
      toast.error("Failed to generate shopping list");
    }
  };

  const navigateWeek = (offset: number) => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + 7 * offset);
    setCurrentWeek(d.toISOString().slice(0, 10));
  };

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Recipes & Meals</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("recipes")}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === "recipes" ? "bg-crimson-600 text-white" : "bg-dungeon-700 text-slate-300 hover:bg-dungeon-600"
            }`}
          >
            Recipes
          </button>
          <button
            onClick={() => setTab("meal-plan")}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === "meal-plan" ? "bg-crimson-600 text-white" : "bg-dungeon-700 text-slate-300 hover:bg-dungeon-600"
            }`}
          >
            Meal Plan
          </button>
        </div>
      </div>

      {tab === "recipes" && (
        <RecipesTab
          recipes={recipes}
          loading={loading}
          search={search}
          setSearch={setSearch}
          selectedRecipe={selectedRecipe}
          setSelectedRecipe={setSelectedRecipe}
          fetchRecipeDetail={fetchRecipeDetail}
          deleteRecipe={deleteRecipe}
          addToShoppingList={addToShoppingList}
          showRecipeModal={showRecipeModal}
          setShowRecipeModal={setShowRecipeModal}
          editingRecipe={editingRecipe}
          setEditingRecipe={setEditingRecipe}
          fetchRecipes={fetchRecipes}
          toast={toast}
          showImportModal={showImportModal}
          setShowImportModal={setShowImportModal}
          importFromUrl={importFromUrl}
        />
      )}

      {tab === "meal-plan" && (
        <MealPlanTab
          mealPlan={mealPlan}
          loading={mealPlanLoading}
          currentWeek={currentWeek}
          navigateWeek={navigateWeek}
          createMealPlan={createMealPlan}
          addMealEntry={addMealEntry}
          removeMealEntry={removeMealEntry}
          mealPlanToShopping={mealPlanToShopping}
          recipes={recipes}
        />
      )}
    </div>
  );
}

// ─── Recipes Tab ──────────────────────────────────────────

interface RecipesTabProps {
  recipes: Recipe[];
  loading: boolean;
  search: string;
  setSearch: (s: string) => void;
  selectedRecipe: Recipe | null;
  setSelectedRecipe: (r: Recipe | null) => void;
  fetchRecipeDetail: (id: string) => void;
  deleteRecipe: (id: string) => void;
  addToShoppingList: (id: string) => void;
  showRecipeModal: boolean;
  setShowRecipeModal: (v: boolean) => void;
  editingRecipe: Recipe | null;
  setEditingRecipe: (r: Recipe | null) => void;
  fetchRecipes: () => void;
  toast: ReturnType<typeof useToast>;
  showImportModal: boolean;
  setShowImportModal: (v: boolean) => void;
  importFromUrl: (url: string) => Promise<void>;
}

function RecipesTab({
  recipes, loading, search, setSearch, selectedRecipe, setSelectedRecipe,
  fetchRecipeDetail, deleteRecipe, addToShoppingList,
  showRecipeModal, setShowRecipeModal, editingRecipe, setEditingRecipe,
  fetchRecipes, toast, showImportModal, setShowImportModal, importFromUrl,
}: RecipesTabProps) {
  if (loading) return <LoadingSpinner />;

  return (
    <>
      {/* Search + Add */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Search recipes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-dungeon-800 border border-dungeon-600 rounded px-3 py-2 text-sm text-slate-100 placeholder:text-dungeon-500"
        />
        <button
          onClick={() => setShowImportModal(true)}
          className="bg-dungeon-700 hover:bg-dungeon-600 text-slate-200 px-4 py-2 rounded text-sm font-medium"
        >
          Import URL
        </button>
        <button
          onClick={() => { setEditingRecipe(null); setShowRecipeModal(true); }}
          className="bg-crimson-600 hover:bg-crimson-500 text-white px-4 py-2 rounded text-sm font-medium"
        >
          + New Recipe
        </button>
      </div>

      {/* Selected Recipe Detail */}
      {selectedRecipe && (
        <RecipeDetail
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
          onEdit={() => { setEditingRecipe(selectedRecipe); setShowRecipeModal(true); }}
          onDelete={() => deleteRecipe(selectedRecipe.id)}
          onAddToShopping={() => addToShoppingList(selectedRecipe.id)}
        />
      )}

      {/* Recipe Grid */}
      {!selectedRecipe && (
        recipes.length === 0 ? (
          <EmptyState
            title="No recipes yet"
            description="Add your first recipe to get started with meal planning."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recipes.map((recipe) => (
              <button
                key={recipe.id}
                onClick={() => fetchRecipeDetail(recipe.id)}
                className="bg-dungeon-800 border border-dungeon-700 rounded-lg p-4 text-left hover:border-crimson-600 transition-colors"
              >
                <h3 className="font-semibold text-slate-100 mb-1 truncate">{recipe.title}</h3>
                <div className="flex items-center gap-3 text-xs text-dungeon-400 mb-2">
                  {recipe.servings && <span>Serves {recipe.servings}</span>}
                  {recipe.prep_time_minutes && <span>{recipe.prep_time_minutes}m prep</span>}
                  {recipe.cook_time_minutes && <span>{recipe.cook_time_minutes}m cook</span>}
                </div>
                {recipe.tags && recipe.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {recipe.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="px-2 py-0.5 bg-dungeon-700 text-slate-300 rounded-full text-xs">
                        {tag}
                      </span>
                    ))}
                    {recipe.tags.length > 3 && (
                      <span className="text-xs text-dungeon-500">+{recipe.tags.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        )
      )}

      {/* Import URL Modal */}
      {showImportModal && (
        <ImportUrlModal
          onClose={() => setShowImportModal(false)}
          onImport={importFromUrl}
        />
      )}

      {/* Recipe Form Modal */}
      {showRecipeModal && (
        <RecipeFormModal
          recipe={editingRecipe}
          onClose={() => { setShowRecipeModal(false); setEditingRecipe(null); }}
          onSaved={() => {
            setShowRecipeModal(false);
            setEditingRecipe(null);
            setSelectedRecipe(null);
            fetchRecipes();
            toast.success(editingRecipe ? "Recipe updated" : "Recipe created");
          }}
        />
      )}
    </>
  );
}

// ─── Recipe Detail ────────────────────────────────────────

function RecipeDetail({
  recipe, onClose, onEdit, onDelete, onAddToShopping,
}: {
  recipe: Recipe;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddToShopping: () => void;
}) {
  const totalTime = (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0);

  return (
    <div className="bg-dungeon-800 border border-dungeon-700 rounded-lg p-6 mb-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">{recipe.title}</h2>
          <div className="flex items-center gap-4 text-sm text-dungeon-400 mt-1">
            {recipe.servings && <span>Serves {recipe.servings}</span>}
            {recipe.prep_time_minutes && <span>{recipe.prep_time_minutes}m prep</span>}
            {recipe.cook_time_minutes && <span>{recipe.cook_time_minutes}m cook</span>}
            {totalTime > 0 && <span className="text-slate-300">{totalTime}m total</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onAddToShopping} className="text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded">
            + Shopping List
          </button>
          <button onClick={onEdit} className="text-xs bg-dungeon-700 hover:bg-dungeon-600 text-slate-300 px-3 py-1.5 rounded">
            Edit
          </button>
          <button onClick={onDelete} className="text-xs bg-red-600/20 hover:bg-red-600/40 text-red-400 px-3 py-1.5 rounded">
            Delete
          </button>
          <button onClick={onClose} className="text-xs bg-dungeon-700 hover:bg-dungeon-600 text-slate-300 px-2 py-1.5 rounded">
            X
          </button>
        </div>
      </div>

      {recipe.source_url && (
        <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="text-sm text-crimson-400 hover:text-crimson-300 block mb-3">
          Source link
        </a>
      )}

      {recipe.tags && recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {recipe.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 bg-dungeon-700 text-slate-300 rounded-full text-xs">{tag}</span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Ingredients */}
        <div>
          <h3 className="text-sm font-semibold text-slate-300 mb-2">Ingredients</h3>
          {recipe.ingredients && recipe.ingredients.length > 0 ? (
            <ul className="space-y-1">
              {recipe.ingredients.map((ing: RecipeIngredient) => (
                <li key={ing.id} className={`text-sm ${ing.is_optional ? "text-dungeon-500 italic" : "text-slate-200"}`}>
                  {ing.quantity && <span className="text-dungeon-400">{ing.quantity} </span>}
                  {ing.name}
                  {ing.is_optional && <span className="text-dungeon-600"> (optional)</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-dungeon-500">No ingredients listed</p>
          )}
        </div>

        {/* Instructions */}
        <div>
          <h3 className="text-sm font-semibold text-slate-300 mb-2">Instructions</h3>
          {recipe.instructions ? (
            <div className="text-sm text-slate-200 whitespace-pre-wrap">{recipe.instructions}</div>
          ) : (
            <p className="text-sm text-dungeon-500">No instructions</p>
          )}
        </div>
      </div>

      {recipe.notes && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-1">Notes</h3>
          <p className="text-sm text-dungeon-400">{recipe.notes}</p>
        </div>
      )}
    </div>
  );
}

// ─── Recipe Form Modal ────────────────────────────────────

function RecipeFormModal({
  recipe, onClose, onSaved,
}: {
  recipe: Recipe | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(recipe?.title || "");
  const [sourceUrl, setSourceUrl] = useState(recipe?.source_url || "");
  const [servings, setServings] = useState(recipe?.servings?.toString() || "4");
  const [prepTime, setPrepTime] = useState(recipe?.prep_time_minutes?.toString() || "");
  const [cookTime, setCookTime] = useState(recipe?.cook_time_minutes?.toString() || "");
  const [instructions, setInstructions] = useState(recipe?.instructions || "");
  const [tags, setTags] = useState(recipe?.tags?.join(", ") || "");
  const [notes, setNotes] = useState(recipe?.notes || "");
  const [ingredients, setIngredients] = useState<Array<{ name: string; quantity: string; is_optional: boolean }>>(
    recipe?.ingredients?.map((i: RecipeIngredient) => ({
      name: i.name,
      quantity: i.quantity || "",
      is_optional: i.is_optional,
    })) || [{ name: "", quantity: "", is_optional: false }]
  );
  const [saving, setSaving] = useState(false);

  const addIngredient = () => {
    setIngredients([...ingredients, { name: "", quantity: "", is_optional: false }]);
  };

  const removeIngredient = (idx: number) => {
    setIngredients(ingredients.filter((_, i) => i !== idx));
  };

  const updateIngredient = (idx: number, field: string, value: string | boolean) => {
    const updated = [...ingredients];
    updated[idx] = { ...updated[idx], [field]: value };
    setIngredients(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);

    const payload = {
      title: title.trim(),
      source_url: sourceUrl.trim() || undefined,
      servings: parseInt(servings) || 4,
      prep_time_minutes: parseInt(prepTime) || undefined,
      cook_time_minutes: parseInt(cookTime) || undefined,
      instructions: instructions.trim() || undefined,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      notes: notes.trim() || undefined,
      ingredients: ingredients.filter(i => i.name.trim()).map(i => ({
        name: i.name.trim(),
        quantity: i.quantity.trim() || undefined,
        is_optional: i.is_optional,
      })),
    };

    try {
      const url = recipe ? `/api/recipes/${recipe.id}` : "/api/recipes";
      const method = recipe ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={recipe ? "Edit Recipe" : "New Recipe"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Recipe title *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-dungeon-800 border border-dungeon-600 rounded px-3 py-2 text-sm text-slate-100"
          required
        />

        <input
          type="url"
          placeholder="Source URL (optional)"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          className="w-full bg-dungeon-800 border border-dungeon-600 rounded px-3 py-2 text-sm text-slate-100"
        />

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-dungeon-400 block mb-1">Servings</label>
            <input type="number" value={servings} onChange={(e) => setServings(e.target.value)}
              className="w-full bg-dungeon-800 border border-dungeon-600 rounded px-3 py-2 text-sm text-slate-100" min="1" />
          </div>
          <div>
            <label className="text-xs text-dungeon-400 block mb-1">Prep (min)</label>
            <input type="number" value={prepTime} onChange={(e) => setPrepTime(e.target.value)}
              className="w-full bg-dungeon-800 border border-dungeon-600 rounded px-3 py-2 text-sm text-slate-100" min="0" />
          </div>
          <div>
            <label className="text-xs text-dungeon-400 block mb-1">Cook (min)</label>
            <input type="number" value={cookTime} onChange={(e) => setCookTime(e.target.value)}
              className="w-full bg-dungeon-800 border border-dungeon-600 rounded px-3 py-2 text-sm text-slate-100" min="0" />
          </div>
        </div>

        {/* Ingredients */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-300">Ingredients</label>
            <button type="button" onClick={addIngredient} className="text-xs text-crimson-400 hover:text-crimson-300">
              + Add ingredient
            </button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {ingredients.map((ing, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Qty (e.g., 2 cups)"
                  value={ing.quantity}
                  onChange={(e) => updateIngredient(idx, "quantity", e.target.value)}
                  className="w-28 bg-dungeon-800 border border-dungeon-600 rounded px-2 py-1.5 text-sm text-slate-100"
                />
                <input
                  type="text"
                  placeholder="Ingredient name"
                  value={ing.name}
                  onChange={(e) => updateIngredient(idx, "name", e.target.value)}
                  className="flex-1 bg-dungeon-800 border border-dungeon-600 rounded px-2 py-1.5 text-sm text-slate-100"
                />
                <label className="flex items-center gap-1 text-xs text-dungeon-400">
                  <input
                    type="checkbox"
                    checked={ing.is_optional}
                    onChange={(e) => updateIngredient(idx, "is_optional", e.target.checked)}
                    className="rounded"
                  />
                  Opt
                </label>
                {ingredients.length > 1 && (
                  <button type="button" onClick={() => removeIngredient(idx)} className="text-red-400 hover:text-red-300 text-sm px-1">
                    x
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-300 block mb-1">Instructions</label>
          <textarea
            placeholder="Step-by-step instructions..."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={5}
            className="w-full bg-dungeon-800 border border-dungeon-600 rounded px-3 py-2 text-sm text-slate-100"
          />
        </div>

        <input
          type="text"
          placeholder="Tags (comma separated: quick, healthy, kid-friendly)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="w-full bg-dungeon-800 border border-dungeon-600 rounded px-3 py-2 text-sm text-slate-100"
        />

        <textarea
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full bg-dungeon-800 border border-dungeon-600 rounded px-3 py-2 text-sm text-slate-100"
        />

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-dungeon-400 hover:text-slate-200">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="bg-crimson-600 hover:bg-crimson-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
          >
            {saving ? "Saving..." : recipe ? "Save Changes" : "Create Recipe"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Meal Plan Tab ────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABELS: Record<MealType, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

function MealPlanTab({
  mealPlan, loading, currentWeek, navigateWeek, createMealPlan,
  addMealEntry, removeMealEntry, mealPlanToShopping, recipes,
}: {
  mealPlan: MealPlan | null;
  loading: boolean;
  currentWeek: string;
  navigateWeek: (offset: number) => void;
  createMealPlan: () => void;
  addMealEntry: (day: number, type: MealType, recipeId?: string, label?: string) => void;
  removeMealEntry: (entryId: string) => void;
  mealPlanToShopping: () => void;
  recipes: Recipe[];
}) {
  const [addingSlot, setAddingSlot] = useState<{ day: number; type: MealType } | null>(null);
  const [addMode, setAddMode] = useState<"recipe" | "label">("recipe");
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [customLabel, setCustomLabel] = useState("");

  const handleAdd = () => {
    if (!addingSlot) return;
    if (addMode === "recipe" && selectedRecipeId) {
      addMealEntry(addingSlot.day, addingSlot.type, selectedRecipeId);
    } else if (addMode === "label" && customLabel.trim()) {
      addMealEntry(addingSlot.day, addingSlot.type, undefined, customLabel.trim());
    }
    setAddingSlot(null);
    setSelectedRecipeId("");
    setCustomLabel("");
  };

  if (loading) return <LoadingSpinner />;

  const weekDate = new Date(currentWeek + "T00:00:00");
  const weekEnd = new Date(weekDate);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekLabel = `${weekDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div>
      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigateWeek(-1)} className="text-dungeon-400 hover:text-slate-200 px-3 py-1">
          &larr; Prev
        </button>
        <span className="text-sm font-medium text-slate-200">{weekLabel}</span>
        <button onClick={() => navigateWeek(1)} className="text-dungeon-400 hover:text-slate-200 px-3 py-1">
          Next &rarr;
        </button>
      </div>

      {!mealPlan ? (
        <div className="text-center py-12">
          <p className="text-dungeon-400 mb-4">No meal plan for this week</p>
          <button onClick={createMealPlan} className="bg-crimson-600 hover:bg-crimson-500 text-white px-4 py-2 rounded text-sm font-medium">
            Create Meal Plan
          </button>
        </div>
      ) : (
        <>
          <div className="flex justify-end mb-3">
            <button onClick={mealPlanToShopping} className="text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded">
              Generate Shopping List
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Header row */}
              <div className="grid grid-cols-8 gap-1 mb-1">
                <div className="text-xs text-dungeon-500 p-2" />
                {DAYS.map((day, i) => {
                  const d = new Date(weekDate);
                  d.setDate(d.getDate() + i);
                  return (
                    <div key={day} className="text-center p-2">
                      <div className="text-xs font-medium text-slate-300">{day}</div>
                      <div className="text-xs text-dungeon-500">{d.getDate()}</div>
                    </div>
                  );
                })}
              </div>

              {/* Meal rows */}
              {MEAL_TYPES.map((mealType) => (
                <div key={mealType} className="grid grid-cols-8 gap-1 mb-1">
                  <div className="text-xs text-dungeon-400 p-2 flex items-start font-medium">
                    {MEAL_LABELS[mealType]}
                  </div>
                  {DAYS.map((_, dayIdx) => {
                    const entries = (mealPlan.entries || []).filter(
                      (e: MealPlanEntry) => e.day_of_week === dayIdx && e.meal_type === mealType
                    );
                    return (
                      <div key={dayIdx} className="bg-dungeon-800/50 border border-dungeon-700/50 rounded p-1.5 min-h-[60px]">
                        {entries.map((entry: MealPlanEntry) => (
                          <div key={entry.id} className="flex items-start justify-between group mb-1">
                            <span className="text-xs text-slate-200 leading-tight">
                              {entry.recipe?.title || entry.label || "—"}
                            </span>
                            <button
                              onClick={() => removeMealEntry(entry.id)}
                              className="text-red-400/0 group-hover:text-red-400/80 text-xs ml-1 shrink-0"
                            >
                              x
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => setAddingSlot({ day: dayIdx, type: mealType })}
                          className="text-xs text-dungeon-600 hover:text-crimson-400 w-full text-left"
                        >
                          +
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Add Entry Popover */}
          {addingSlot && (
            <Modal isOpen={true} onClose={() => setAddingSlot(null)} title={`Add ${MEAL_LABELS[addingSlot.type]} — ${DAYS[addingSlot.day]}`}>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setAddMode("recipe")}
                    className={`text-xs px-2 py-1 rounded ${addMode === "recipe" ? "bg-crimson-600 text-white" : "bg-dungeon-700 text-slate-300"}`}
                  >
                    From Recipe
                  </button>
                  <button
                    onClick={() => setAddMode("label")}
                    className={`text-xs px-2 py-1 rounded ${addMode === "label" ? "bg-crimson-600 text-white" : "bg-dungeon-700 text-slate-300"}`}
                  >
                    Custom Label
                  </button>
                </div>

                {addMode === "recipe" ? (
                  <select
                    value={selectedRecipeId}
                    onChange={(e) => setSelectedRecipeId(e.target.value)}
                    className="w-full bg-dungeon-800 border border-dungeon-600 rounded px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="">Select a recipe...</option>
                    {recipes.map((r) => (
                      <option key={r.id} value={r.id}>{r.title}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g., Leftovers, Eat out, Order pizza..."
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    className="w-full bg-dungeon-800 border border-dungeon-600 rounded px-3 py-2 text-sm text-slate-100"
                  />
                )}

                <div className="flex justify-end gap-2">
                  <button onClick={() => setAddingSlot(null)} className="text-xs text-dungeon-400 px-3 py-1.5">Cancel</button>
                  <button
                    onClick={handleAdd}
                    disabled={addMode === "recipe" ? !selectedRecipeId : !customLabel.trim()}
                    className="bg-crimson-600 hover:bg-crimson-500 disabled:opacity-50 text-white px-3 py-1.5 rounded text-xs"
                  >
                    Add
                  </button>
                </div>
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}

// ─── Import URL Modal ──────────────────────────────────────

function ImportUrlModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (url: string) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!url.trim()) return;
    setLoading(true);
    try {
      await onImport(url.trim());
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="Import Recipe from URL">
      <div className="space-y-4">
        <p className="text-sm text-dungeon-400">
          Paste a recipe URL to automatically extract ingredients, instructions, and more.
        </p>
        <input
          type="url"
          placeholder="https://www.example.com/recipe/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleImport(); }}
          className="w-full bg-dungeon-800 border border-dungeon-600 rounded px-3 py-2 text-sm text-slate-100 placeholder:text-dungeon-500"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs text-dungeon-400 px-3 py-1.5">Cancel</button>
          <button
            onClick={handleImport}
            disabled={!url.trim() || loading}
            className="bg-crimson-600 hover:bg-crimson-500 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
          >
            {loading ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
