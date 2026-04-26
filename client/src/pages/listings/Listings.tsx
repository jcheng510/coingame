import { useState } from "react";
import { useLocation } from "wouter";
import { Plus, Search, Tag, Package } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LISTING_CATEGORIES } from "./constants";

function formatPrice(price: string | number) {
  const n = typeof price === "string" ? parseFloat(price) : price;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

export default function Listings() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const { data: listings, isLoading } = trpc.listings.list.useQuery({
    search: submittedSearch || undefined,
    category: category ?? undefined,
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Tag className="h-8 w-8" />
            Marketplace
          </h1>
          <p className="text-muted-foreground mt-1">
            Buy and sell with people nearby.
          </p>
        </div>
        <Button onClick={() => setLocation("/listings/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Post Listing
        </Button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmittedSearch(search.trim());
        }}
        className="relative max-w-xl"
      >
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search listings..."
          className="pl-9"
        />
      </form>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategory(null)}
          className={cn(
            "px-3 py-1.5 rounded-full text-sm border transition-colors",
            category === null
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background hover:bg-muted",
          )}
        >
          All
        </button>
        {LISTING_CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategory(c.value)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm border transition-colors",
              category === c.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-lg bg-muted animate-pulse"
            />
          ))}
        </div>
      ) : !listings || listings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">
              {category || submittedSearch
                ? "No listings match your filters"
                : "No listings yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {category || submittedSearch
                ? "Try clearing the search or selecting a different category."
                : "Be the first to post an item for sale."}
            </p>
            {category || submittedSearch ? (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setCategory(null);
                  setSearch("");
                  setSubmittedSearch("");
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button
                className="mt-4"
                onClick={() => setLocation("/listings/new")}
              >
                <Plus className="h-4 w-4 mr-2" />
                Post Listing
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {listings.map((l) => {
            const cover = l.photos[0];
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setLocation(`/listings/${l.id}`)}
                className="group block text-left"
              >
                <div
                  className={cn(
                    "aspect-square rounded-lg overflow-hidden bg-muted",
                    "transition-transform group-hover:-translate-y-0.5",
                  )}
                >
                  {cover ? (
                    <img
                      src={cover.fileUrl}
                      alt={l.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Package className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <div className="pt-2 space-y-0.5">
                  <div className="flex items-baseline gap-2">
                    <p className="font-semibold">{formatPrice(l.price)}</p>
                    {l.isFirmOnPrice && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Firm
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm truncate">{l.title}</p>
                  {l.locationLabel && (
                    <p className="text-xs text-muted-foreground truncate">
                      {l.locationLabel}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
