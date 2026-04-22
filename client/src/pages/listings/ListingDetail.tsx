import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, CheckCircle2, MapPin, Package, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: listing, isLoading } = trpc.listings.get.useQuery(
    { id: listingId },
    { enabled: !isNaN(listingId) },
  );

  const markSold = trpc.listings.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Listing marked as sold");
      utils.listings.get.invalidate({ id: listingId });
      utils.listings.mine.invalidate();
      utils.listings.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeListing = trpc.listings.delete.useMutation({
    onSuccess: () => {
      toast.success("Listing removed");
      utils.listings.mine.invalidate();
      utils.listings.list.invalidate();
      setLocation("/listings/mine");
    },
    onError: (err) => toast.error(err.message),
  });

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
  const isOwner = user?.id === listing.sellerId;
  const isSold = listing.status === "sold";

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

      {isSold && (
        <div className="rounded-md border border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400 px-4 py-2 text-sm font-medium">
          This listing is sold.
        </div>
      )}

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

          {isOwner ? (
            <div className="flex flex-col gap-2">
              {!isSold && (
                <Button
                  variant="default"
                  size="lg"
                  disabled={markSold.isPending}
                  onClick={() =>
                    markSold.mutate({ id: listing.id, status: "sold" })
                  }
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Mark as Sold
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="lg">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove Listing
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove this listing?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove the listing and its photos.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => removeListing.mutate({ id: listing.id })}
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : (
            <Button className="w-full" size="lg" disabled={isSold}>
              {isSold ? "Sold" : "Message Seller"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
