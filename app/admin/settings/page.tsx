import { getOrgContext } from "@/lib/admin/auth";
import PageHeader from "../_components/PageHeader";
import { ChangePasswordForm, SignOutAllButton } from "./_components/AccountControls";

// BloomOS account settings. Centerpiece is a password change that requires the
// current password; plus account info and session controls an admin expects.
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
  finance: "Finance",
  board_viewer: "Board viewer",
};

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface border-[1.5px] border-outline rounded-card-lg p-5 lg:p-6">
      <h2 className="font-heading font-semibold text-ink-1">{title}</h2>
      {description && <p className="text-xs text-ink-2 mt-1 mb-4">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  const ctx = await getOrgContext();
  if (!ctx) return <div className="px-4 lg:px-8 py-6 text-sm text-ink-2">Not authorized.</div>;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[760px]">
      <PageHeader title="Settings" subtitle="Your BloomOS account and security" />

      <div className="space-y-5">
        <Card title="Account">
          <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-2">Email</dt>
            <dd className="text-ink-1 break-all">{ctx.email || "—"}</dd>
            <dt className="text-ink-2">Role</dt>
            <dd className="text-ink-1">{ROLE_LABEL[ctx.role] ?? ctx.role}</dd>
          </dl>
        </Card>

        <Card
          title="Change password"
          description="Enter your current password to confirm, then set a new one (8+ characters)."
        >
          <ChangePasswordForm />
        </Card>

        <Card
          title="Sessions"
          description="Signed in on a shared or lost device? Sign out everywhere and back in with your password."
        >
          <SignOutAllButton />
        </Card>
      </div>
    </div>
  );
}
