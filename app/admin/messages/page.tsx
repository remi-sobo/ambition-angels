import { getOrgContext } from "@/lib/admin/auth";
import { getMyDisplayName, nameFromEmail } from "@/lib/admin/profile";
import {
  getMessages,
  listOrgPeople,
  listThreads,
  type ChatMessage,
  type ThreadSummary,
} from "@/lib/messaging/threads";
import MessagesView from "./_components/MessagesView";

// Team messaging. Server-rendered (RLS/service-role scoped to the org); the
// client view layers polling + optimistic send on top. ?t=<threadId> selects
// the open conversation so threads are linkable (e.g. from an Inbox pointer).
export const dynamic = "force-dynamic";

export const metadata = { title: "Messages" };

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-ink">{children}</div>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[900px] px-4 lg:px-8 py-8">
      <h1 className="font-heading font-bold text-2xl text-ink-1 mb-2">Messages</h1>
      {children}
    </div>
  );
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: { t?: string };
}) {
  const ctx = await getOrgContext();
  if (!ctx) {
    return (
      <Shell>
        <Centered>
          <p className="text-ink-2 text-sm">Sign in to message your team.</p>
        </Centered>
      </Shell>
    );
  }

  let threads: ThreadSummary[] = [];
  let people: { userId: string; name: string }[] = [];
  let initialMessages: ChatMessage[] = [];
  let activeThreadId: string | null = null;

  try {
    [threads, people] = await Promise.all([listThreads(ctx), listOrgPeople(ctx)]);
    const t = typeof searchParams?.t === "string" ? searchParams.t : null;
    if (t) {
      const msgs = await getMessages(ctx, t, null);
      if (msgs !== null) {
        activeThreadId = t;
        initialMessages = msgs;
      }
    }
  } catch (e) {
    console.error("[messages] load failed:", e);
    return (
      <Shell>
        <Centered>
          <div className="bg-tile shadow-tile border border-orange/30 rounded-card-lg p-6 max-w-xl text-sm text-ink-2 leading-relaxed">
            The messaging tables aren&apos;t in this database yet. Apply{" "}
            <code className="text-orange">create_messaging.sql</code>, then reload.
          </div>
        </Centered>
      </Shell>
    );
  }

  const myName = (await getMyDisplayName()) ?? nameFromEmail(ctx.email);

  return (
    <Shell>
      <MessagesView
        me={{ userId: ctx.userId, name: myName }}
        threads={threads}
        people={people}
        activeThreadId={activeThreadId}
        initialMessages={initialMessages}
      />
    </Shell>
  );
}
