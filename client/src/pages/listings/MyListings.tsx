import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Package, Plus, Tag } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Status = "active" | "sold" | "removed";

function formatPrice(price: string | number) {
  const n = typeof price === "string" ? parseFloat(price) : price;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

export default function MyListings() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Status>("active");

  const { data, isLoading } = trpc.listings.mine.useQuery();

  const grouped = useMemo(() => {
    const buckets: Record<Status, NonNullable<typeof data>> = {
      active: [],
      sold: [],
      removed: [],
    };
    for (const l of data ?? []) {
      if (l.status === "active" || l.status === "sold" || l.status === "removed") {
        buckets[l.status].push(l);
      }
    }
    return buckets;
  }, [data]);

  const renderGrid = (status: Status) => {
    const items = grouped[status];
    if (items.length === 0) {
      return (
        <Card>
          <CardContent className="py-10 text-center">
            <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">
              {status === "active"
                ? "No active listings"
                : status === "sold"
                  ? "No sold listings yet"
                  : "No removed listings"}
            </p>
            {status === "active" && (
              <Button
                className="mt-4"
                onClick={() => setLocation("/listings/new")}
              >
                <Plus className="h-4 w-4 mr-2" />
                Post your first listing
              </Button>
            )}
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.map((l) => {
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
                  "aspect-square rounded-lg overflow-hidden bg-muted relative",
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
                {l.status === "sold" && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="bg-white text-black font-bold px-3 py-1 rounded text-sm">
                      SOLD
                    </span>
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
                <p className="text-xs text-muted-foreground">
                  {new Date(l.createdAt).toLocaleDateString()}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Tag className="h-8 w-8" />
            My Listings
          </h1>
          <p className="text-muted-foreground mt-1">
            Items you've posted for sale.
          </p>
        </div>
        <Button onClick={() => setLocation("/listings/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Post Listing
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-lg bg-muted animate-pulse"
            />
          ))}
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as Status)}>
          <TabsList>
            <TabsTrigger value="active">
              Active ({grouped.active.length})
            </TabsTrigger>
            <TabsTrigger value="sold">
              Sold ({grouped.sold.length})
            </TabsTrigger>
            <TabsTrigger value="removed">
              Removed ({grouped.removed.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-4">
            {renderGrid("active")}
          </TabsContent>
          <TabsContent value="sold" className="mt-4">
            {renderGrid("sold")}
          </TabsContent>
          <TabsContent value="removed" className="mt-4">
            {renderGrid("removed")}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
