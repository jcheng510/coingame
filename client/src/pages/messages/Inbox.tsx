import { useLocation } from "wouter";
import { Inbox as InboxIcon, MessageSquare, Package } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function formatPrice(price: string | number) {
  const n = typeof price === "string" ? parseFloat(price) : price;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

export default function Inbox() {
  const [, setLocation] = useLocation();
  const { data: threads, isLoading } = trpc.messages.inbox.useQuery();

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <MessageSquare className="h-8 w-8" />
          Messages
        </h1>
        <p className="text-muted-foreground mt-1">
          Conversations about listings you're buying or selling.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-lg bg-muted animate-pulse"
            />
          ))}
        </div>
      ) : !threads || threads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <InboxIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">No messages yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              When you message a seller or someone messages you about a listing,
              it'll show up here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden divide-y">
          {threads.map((t) => {
            const cover = t.listing?.photos[0];
            const isUnread = t.unreadCount > 0;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setLocation(`/messages/${t.id}`)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors",
                  isUnread && "bg-primary/5",
                )}
              >
                <div className="h-14 w-14 rounded bg-muted overflow-hidden flex-shrink-0">
                  {cover ? (
                    <img
                      src={cover.fileUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Package className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("truncate", isUnread && "font-semibold")}>
                      {t.listing?.title ?? "Listing"}
                    </p>
                    {t.lastMessage && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {formatDistanceToNow(new Date(t.lastMessage.createdAt), {
                          addSuffix: false,
                        })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p
                      className={cn(
                        "text-sm truncate",
                        isUnread ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {t.lastMessage?.body ?? "No messages yet"}
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {t.listing && (
                        <span className="text-xs text-muted-foreground">
                          {formatPrice(t.listing.price)}
                        </span>
                      )}
                      <Badge
                        variant={t.role === "seller" ? "default" : "secondary"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {t.role === "seller" ? "Selling" : "Buying"}
                      </Badge>
                      {isUnread && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground">
                          {t.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
