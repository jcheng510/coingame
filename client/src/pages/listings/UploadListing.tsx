import { useState } from "react";
import { useLocation } from "wouter";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import {
  Camera, ImagePlus, Loader2, MapPin, Star, X, Tag, DollarSign, Box,
} from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 12;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per image

const CATEGORIES: { value: string; label: string; subcategories: string[] }[] = [
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

const CONDITIONS: { value: "new" | "like_new" | "good" | "fair" | "poor"; label: string; helper: string }[] = [
  { value: "new", label: "New", helper: "Never used, in original packaging" },
  { value: "like_new", label: "Like New", helper: "Used once or twice, no signs of wear" },
  { value: "good", label: "Good", helper: "Lightly used, works perfectly" },
  { value: "fair", label: "Fair", helper: "Visible wear, still functional" },
  { value: "poor", label: "For Parts / Not Working", helper: "Broken or needs repair" },
];

type PendingPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function UploadListing() {
  const [, setLocation] = useLocation();
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [title, setTitle] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [isFirm, setIsFirm] = useState(false);
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [condition, setCondition] = useState<typeof CONDITIONS[number]["value"] | "">("");
  const [description, setDescription] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const activeCategory = CATEGORIES.find(c => c.value === category);

  const createListing = trpc.listings.create.useMutation({
    onSuccess: ({ id }) => {
      toast.success("Listing posted");
      setLocation(`/listings/${id}`);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to post listing");
    },
  });

  const addFiles = (files: File[]) => {
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      toast.error(`You can add up to ${MAX_PHOTOS} photos`);
      return;
    }
    const accepted: PendingPhoto[] = [];
    for (const file of files.slice(0, remaining)) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name}: not an image`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: exceeds 10MB`);
        continue;
      }
      accepted.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    setPhotos(prev => [...prev, ...accepted]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [] },
    multiple: true,
    noClick: photos.length > 0,
    noKeyboard: photos.length > 0,
    onDrop: addFiles,
  });

  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const p = prev.find(x => x.id === id);
      if (p) URL.revokeObjectURL(p.previewUrl);
      return prev.filter(x => x.id !== id);
    });
  };

  const movePhoto = (from: number, to: number) => {
    if (from === to) return;
    setPhotos(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const price = parseFloat(priceInput);
  const canSubmit =
    photos.length > 0 &&
    title.trim().length >= 3 &&
    !isNaN(price) &&
    price >= 0 &&
    category !== "" &&
    condition !== "" &&
    !createListing.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      const encoded = await Promise.all(
        photos.map(async (p) => ({
          fileData: await readFileAsBase64(p.file),
          mimeType: p.file.type,
          fileName: p.file.name,
        })),
      );

      createListing.mutate({
        title: title.trim(),
        price,
        isFirmOnPrice: isFirm,
        category,
        subcategory: subcategory || undefined,
        condition: condition as typeof CONDITIONS[number]["value"],
        description: description.trim() || undefined,
        locationLabel: locationLabel.trim() || undefined,
        photos: encoded,
      });
    } catch (err) {
      toast.error("Failed to read one of the photos");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in pb-16">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Post Your Item</h1>
        <p className="text-muted-foreground mt-1">
          Add photos and details to list your item for sale.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Photos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Camera className="h-5 w-5" />
              Photos
              <span className="text-sm font-normal text-muted-foreground ml-2">
                {photos.length} / {MAX_PHOTOS}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {photos.length === 0 ? (
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors",
                  isDragActive
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/30 hover:border-primary/50",
                )}
              >
                <input {...getInputProps()} />
                <ImagePlus className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium">
                  {isDragActive ? "Drop photos here" : "Add photos"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Drag &amp; drop or click to browse. The first photo will be the cover.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {photos.map((photo, index) => (
                    <div
                      key={photo.id}
                      draggable
                      onDragStart={() => setDragIndex(index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIndex !== null) movePhoto(dragIndex, index);
                        setDragIndex(null);
                      }}
                      className={cn(
                        "relative aspect-square rounded-lg overflow-hidden bg-muted group cursor-move border",
                        index === 0 && "ring-2 ring-primary",
                      )}
                    >
                      <img
                        src={photo.previewUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      {index === 0 && (
                        <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded px-1.5 py-0.5 text-xs font-medium flex items-center gap-1">
                          <Star className="h-3 w-3" />
                          Cover
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove photo"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  {photos.length < MAX_PHOTOS && (
                    <div
                      {...getRootProps()}
                      className={cn(
                        "aspect-square rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors",
                        isDragActive
                          ? "border-primary bg-primary/5"
                          : "border-muted-foreground/30 hover:border-primary/50",
                      )}
                    >
                      <input {...getInputProps()} />
                      <ImagePlus className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Drag photos to reorder. The first photo is your cover.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Title */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Tag className="h-5 w-5" />
              Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What are you selling?"
                maxLength={120}
                required
              />
              <p className="text-xs text-muted-foreground text-right">
                {title.length} / 120
              </p>
            </div>

            {/* Price */}
            <div className="space-y-2">
              <Label htmlFor="price" className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                Price
              </Label>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="price"
                    inputMode="decimal"
                    value={priceInput}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d.]/g, "");
                      setPriceInput(v);
                    }}
                    placeholder="0.00"
                    className="pl-7"
                    required
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="firm"
                    checked={isFirm}
                    onCheckedChange={setIsFirm}
                  />
                  <Label htmlFor="firm" className="cursor-pointer">
                    Firm on price
                  </Label>
                </div>
              </div>
            </div>

            {/* Category */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={category}
                  onValueChange={(v) => {
                    setCategory(v);
                    setSubcategory("");
                  }}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {activeCategory && activeCategory.subcategories.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="subcategory">Subcategory</Label>
                  <Select value={subcategory} onValueChange={setSubcategory}>
                    <SelectTrigger id="subcategory">
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeCategory.subcategories.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Condition */}
            <div className="space-y-2">
              <Label htmlFor="condition" className="flex items-center gap-1">
                <Box className="h-4 w-4" />
                Condition
              </Label>
              <Select
                value={condition}
                onValueChange={(v) => setCondition(v as any)}
              >
                <SelectTrigger id="condition">
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex flex-col">
                        <span>{c.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {c.helper}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Share brand, size, condition details, reason for selling..."
                rows={5}
                maxLength={4000}
              />
              <p className="text-xs text-muted-foreground text-right">
                {description.length} / 4000
              </p>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="location" className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                Location
              </Label>
              <Input
                id="location"
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                placeholder="City, ZIP, or neighborhood"
                maxLength={255}
              />
              <p className="text-xs text-muted-foreground">
                Buyers near you will see this listing first.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 sticky bottom-0 bg-background py-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation("/listings")}
            disabled={createListing.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit} size="lg">
            {createListing.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Post Listing
          </Button>
        </div>
      </form>
    </div>
  );
}
