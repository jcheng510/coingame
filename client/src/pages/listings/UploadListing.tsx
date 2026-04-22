import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
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
import {
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  type ListingCondition,
} from "./constants";

const MAX_PHOTOS = 12;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per image

type PhotoSlot =
  | { kind: "existing"; id: string; listingPhotoId: number; previewUrl: string }
  | { kind: "new"; id: string; file: File; previewUrl: string };

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
  const params = useParams<{ id?: string }>();
  const editId = params.id ? Number(params.id) : undefined;
  const isEditMode = editId !== undefined && !isNaN(editId);

  const [, setLocation] = useLocation();
  const [photos, setPhotos] = useState<PhotoSlot[]>([]);
  const [title, setTitle] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [isFirm, setIsFirm] = useState(false);
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [condition, setCondition] = useState<ListingCondition | "">("");
  const [description, setDescription] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hasSeeded, setHasSeeded] = useState(false);

  const activeCategory = LISTING_CATEGORIES.find((c) => c.value === category);

  const utils = trpc.useUtils();

  const existingQuery = trpc.listings.get.useQuery(
    { id: editId as number },
    { enabled: isEditMode },
  );

  useEffect(() => {
    if (!isEditMode || hasSeeded || !existingQuery.data) return;
    const l = existingQuery.data;
    setTitle(l.title);
    setPriceInput(parseFloat(l.price).toString());
    setIsFirm(l.isFirmOnPrice);
    setCategory(l.category);
    setSubcategory(l.subcategory ?? "");
    setCondition(l.condition as ListingCondition);
    setDescription(l.description ?? "");
    setLocationLabel(l.locationLabel ?? "");
    setPhotos(
      l.photos.map((p) => ({
        kind: "existing" as const,
        id: `existing-${p.id}`,
        listingPhotoId: p.id,
        previewUrl: p.fileUrl,
      })),
    );
    setHasSeeded(true);
  }, [isEditMode, hasSeeded, existingQuery.data]);

  const createListing = trpc.listings.create.useMutation({
    onSuccess: ({ id }) => {
      toast.success("Listing posted");
      setLocation(`/listings/${id}`);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to post listing");
    },
  });

  const updateListing = trpc.listings.update.useMutation({
    onSuccess: () => {
      toast.success("Listing updated");
      if (editId !== undefined) {
        utils.listings.get.invalidate({ id: editId });
      }
      utils.listings.mine.invalidate();
      utils.listings.list.invalidate();
      if (editId !== undefined) setLocation(`/listings/${editId}`);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update listing");
    },
  });

  const isPending = createListing.isPending || updateListing.isPending;

  const addFiles = (files: File[]) => {
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      toast.error(`You can add up to ${MAX_PHOTOS} photos`);
      return;
    }
    const accepted: PhotoSlot[] = [];
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
        kind: "new",
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    setPhotos((prev) => [...prev, ...accepted]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [] },
    multiple: true,
    noClick: photos.length > 0,
    noKeyboard: photos.length > 0,
    onDrop: addFiles,
  });

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const p = prev.find((x) => x.id === id);
      if (p && p.kind === "new") URL.revokeObjectURL(p.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  };

  const movePhoto = (from: number, to: number) => {
    if (from === to) return;
    setPhotos((prev) => {
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
    !isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      if (isEditMode && editId !== undefined) {
        const existingPhotoIds = photos
          .filter((p): p is Extract<PhotoSlot, { kind: "existing" }> => p.kind === "existing")
          .map((p) => p.listingPhotoId);
        const newPhotoFiles = photos.filter(
          (p): p is Extract<PhotoSlot, { kind: "new" }> => p.kind === "new",
        );
        const newPhotos = await Promise.all(
          newPhotoFiles.map(async (p) => ({
            fileData: await readFileAsBase64(p.file),
            mimeType: p.file.type,
            fileName: p.file.name,
          })),
        );

        updateListing.mutate({
          id: editId,
          title: title.trim(),
          price,
          isFirmOnPrice: isFirm,
          category,
          subcategory: subcategory || null,
          condition: condition as ListingCondition,
          description: description.trim() || null,
          locationLabel: locationLabel.trim() || null,
          existingPhotoIds,
          newPhotos,
        });
      } else {
        const newPhotoFiles = photos.filter(
          (p): p is Extract<PhotoSlot, { kind: "new" }> => p.kind === "new",
        );
        const encoded = await Promise.all(
          newPhotoFiles.map(async (p) => ({
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
          condition: condition as ListingCondition,
          description: description.trim() || undefined,
          locationLabel: locationLabel.trim() || undefined,
          photos: encoded,
        });
      }
    } catch (err) {
      toast.error("Failed to read one of the photos");
    }
  };

  if (isEditMode && existingQuery.isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-10 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  if (isEditMode && !existingQuery.isLoading && !existingQuery.data) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center">
        <p className="font-medium">Listing not found</p>
        <Button className="mt-4" onClick={() => setLocation("/listings")}>
          Back to marketplace
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in pb-16">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {isEditMode ? "Edit Listing" : "Post Your Item"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isEditMode
            ? "Update photos and details for your listing."
            : "Add photos and details to list your item for sale."}
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

        {/* Details */}
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
                    {LISTING_CATEGORIES.map((c) => (
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

            <div className="space-y-2">
              <Label htmlFor="condition" className="flex items-center gap-1">
                <Box className="h-4 w-4" />
                Condition
              </Label>
              <Select
                value={condition}
                onValueChange={(v) => setCondition(v as ListingCondition)}
              >
                <SelectTrigger id="condition">
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  {LISTING_CONDITIONS.map((c) => (
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

        <div className="flex items-center justify-end gap-3 sticky bottom-0 bg-background py-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setLocation(isEditMode ? `/listings/${editId}` : "/listings")
            }
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit} size="lg">
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditMode ? "Save Changes" : "Post Listing"}
          </Button>
        </div>
      </form>
    </div>
  );
}
