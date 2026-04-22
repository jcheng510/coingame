import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, MapPin, Package, Star } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const CONDITION_LABEL: Record<string, string> = {
  new: "New",
  like_new: "Like New",
  good: "Good",
  fair: "Fair",
  poor: "For Parts / Not Working",
};

function formatPrice(price: string | number) {
  const n = typeof price === "string" ? parseFloat(price) : price;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const listingId = Number(id);
  const [selectedPhoto, setSelectedPhoto] = useState(0);

  const { data: listing, isLoading } = trpc.listings.get.useQuery(
    { id: listingId },
    { enabled: !isNaN(listingId) },
  );

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto animate-pulse">
        <div className="aspect-video bg-muted rounded-lg" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="max-w-5xl mx-auto text-center py-16">
        <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
        <p className="font-medium">Listing not found</p>
        <Button className="mt-4" onClick={() => setLocation("/listings")}>
          Back to marketplace
        </Button>
      </div>
    );
  }

  const cover = listing.photos[selectedPhoto] ?? listing.photos[0];

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <button
        type="button"
        onClick={() => setLocation("/listings")}
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to marketplace
      </button>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="aspect-square rounded-lg overflow-hidden bg-muted">
            {cover ? (
              <img
                src={cover.fileUrl}
                alt={listing.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <Package className="h-12 w-12" />
              </div>
            )}
          </div>
          {listing.photos.length > 1 && (
            <div className="grid grid-cols-6 gap-2">
              {listing.photos.map((photo, i) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setSelectedPhoto(i)}
                  className={cn(
                    "aspect-square rounded overflow-hidden bg-muted border-2",
                    selectedPhoto === i
                      ? "border-primary"
                      : "border-transparent",
                  )}
                >
                  <img
                    src={photo.fileUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <div className="flex items-baseline gap-3">
              <p className="text-3xl font-bold">{formatPrice(listing.price)}</p>
              {listing.isFirmOnPrice && (
                <Badge variant="secondary">Firm</Badge>
              )}
            </div>
            <h1 className="text-xl font-semibold mt-1">{listing.title}</h1>
            {listing.locationLabel && (
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {listing.locationLabel}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="capitalize">
              {listing.category}
              {listing.subcategory ? ` • ${listing.subcategory}` : ""}
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <Star className="h-3 w-3" />
              {CONDITION_LABEL[listing.condition] ?? listing.condition}
            </Badge>
          </div>

          {listing.description && (
            <Card>
              <CardContent className="py-4 whitespace-pre-wrap text-sm">
                {listing.description}
              </CardContent>
            </Card>
          )}

          <Button className="w-full" size="lg">
            Message Seller
          </Button>
        </div>
      </div>
    </div>
  );
}
