import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Loader2, Package, Send } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatPrice(price: string | number) {
  const n = typeof price === "string" ? parseFloat(price) : price;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

function formatTimestamp(d: Date) {
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
  return format(d, "MMM d, h:mm a");
}

export default function Thread() {
  const { id } = useParams<{ id: string }>();
  const threadId = Number(id);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();

  const { data: thread, isLoading, error } = trpc.messages.thread.useQuery(
    { id: threadId },
    { enabled: !isNaN(threadId), refetchInterval: 5_000 },
  );

  const send = trpc.messages.send.useMutation({
    onSuccess: () => {
      setDraft("");
      utils.messages.thread.invalidate({ id: threadId });
      utils.messages.inbox.invalidate();
      utils.messages.unreadCount.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const markRead = trpc.messages.markRead.useMutation({
    onSuccess: () => {
      utils.messages.inbox.invalidate();
      utils.messages.unreadCount.invalidate();
    },
  });

  // Mark read when the thread loads with unread inbound messages
  useEffect(() => {
    if (!thread || !user) return;
    const hasUnreadInbound = thread.messages.some(
      (m) => m.senderId !== user.id && m.readAt === null,
    );
    if (hasUnreadInbound) {
      markRead.mutate({ threadId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.messages.length, user?.id, threadId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [thread?.messages.length]);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-10 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  if (error || !thread) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center">
        <p className="font-medium">Thread not found</p>
        <Button className="mt-4" onClick={() => setLocation("/messages")}>
          Back to inbox
        </Button>
      </div>
    );
  }

  const otherParty = thread.role === "buyer" ? "Seller" : "Buyer";

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate({ threadId, body });
  };

  return (
    <div className="max-w-3xl mx-auto h-[calc(100vh-7rem)] flex flex-col animate-fade-in">
      <button
        type="button"
        onClick={() => setLocation("/messages")}
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start mb-3"
      >
        <ArrowLeft className="h-4 w-4" />
        Inbox
      </button>

      {thread.listing && (
        <button
          type="button"
          onClick={() => setLocation(`/listings/${thread.listing!.id}`)}
          className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors text-left"
        >
          <div className="h-12 w-12 rounded bg-muted overflow-hidden flex-shrink-0">
            {thread.listing.photos[0] ? (
              <img
                src={thread.listing.photos[0].fileUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <Package className="h-5 w-5" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{thread.listing.title}</p>
            <p className="text-sm text-muted-foreground">
              {formatPrice(thread.listing.price)}
              {thread.listing.status === "sold" && " • Sold"}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {thread.role === "seller" ? "You're selling" : `Talking to ${otherParty}`}
          </span>
        </button>
      )}

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto py-4 space-y-3"
      >
        {thread.messages.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            Send the first message to get the conversation started.
          </div>
        ) : (
          thread.messages.map((m) => {
            const mine = m.senderId === user?.id;
            return (
              <div
                key={m.id}
                className={cn(
                  "flex flex-col max-w-[80%]",
                  mine ? "ml-auto items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 whitespace-pre-wrap break-words",
                    mine
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                  )}
                >
                  {m.body}
                </div>
                <span className="text-[11px] text-muted-foreground mt-1 px-1">
                  {formatTimestamp(new Date(m.createdAt))}
                </span>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={handleSend}
        className="border-t pt-3 flex gap-2 items-end"
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message..."
          rows={1}
          maxLength={2000}
          className="resize-none min-h-[40px]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e as unknown as React.FormEvent);
            }
          }}
        />
        <Button
          type="submit"
          disabled={!draft.trim() || send.isPending}
          size="icon"
        >
          {send.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
