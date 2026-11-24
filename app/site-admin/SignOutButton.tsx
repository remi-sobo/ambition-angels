"use client";

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/site-admin/signout", { method: "POST" }).catch(() => undefined);
        window.location.href = "/admin";
      }}
      className="hover:text-orange"
    >
      Sign out
    </button>
  );
}
