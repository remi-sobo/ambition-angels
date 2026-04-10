"use client";

import { useState, useEffect, useCallback } from "react";

type Submission = {
  id: string;
  created_at: string;
  email: string | null;
  teen_name: string | null;
  audience: string | null;
  age: string | null;
  location: string | null;
  flow_state: string | null;
  career_matches: { title: string; salary: string }[] | null;
};

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/submissions");
    if (res.ok) {
      const data = await res.json();
      setSubmissions(data.submissions || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authed) fetchSubmissions();
  }, [authed, fetchSubmissions]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setAuthed(true);
      setLoginError("");
    } else {
      setLoginError("Wrong password.");
    }
  };

  const filtered = submissions.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.email?.toLowerCase().includes(q) ||
      s.teen_name?.toLowerCase().includes(q) ||
      s.location?.toLowerCase().includes(q) ||
      s.career_matches?.[0]?.title?.toLowerCase().includes(q)
    );
  });

  const withEmail = submissions.filter((s) => s.email).length;
  const teens = submissions.filter((s) => s.audience === "teen").length;
  const adults = submissions.filter((s) => s.audience === "adult").length;

  const exportCSV = () => {
    const headers = ["Date", "Name", "Email", "Audience", "Age", "Location", "Flow State", "Top Career", "Top Salary"];
    const rows = filtered.map((s) => [
      new Date(s.created_at).toLocaleDateString(),
      s.teen_name || "",
      s.email || "",
      s.audience || "",
      s.age || "",
      s.location || "",
      s.flow_state || "",
      s.career_matches?.[0]?.title || "",
      s.career_matches?.[0]?.salary || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quiz-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center px-4"
        style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
      >
        <div className="bg-[#1a1d27] border border-white/10 rounded-card-lg p-10 w-full max-w-sm shadow-2xl">
          <div className="font-display font-black text-3xl text-cream mb-1 tracking-tight uppercase">Admin</div>
          <div className="text-gray-mid text-sm mb-8">Ambition Angels</div>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-cream text-sm placeholder-gray-mid focus:outline-none focus:border-orange/50"
              autoFocus
            />
            {loginError && <p className="text-red-400 text-xs">{loginError}</p>}
            <button
              type="submit"
              className="bg-orange hover:bg-orange-dark text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-light">
      {/* Header */}
      <div className="bg-ink border-b border-white/10 px-8 py-5 flex items-center justify-between">
        <div>
          <span className="font-heading font-bold text-cream text-lg">Ambition Angels</span>
          <span className="text-gray-mid text-sm ml-3">/ Admin</span>
        </div>
        <button onClick={exportCSV} className="text-xs font-semibold text-orange bg-orange/10 border border-orange/30 px-4 py-2 rounded-full hover:bg-orange/20 transition-colors">
          Export CSV
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {[
            { label: "Total Submissions", value: submissions.length },
            { label: "Emails Captured", value: withEmail },
            { label: "Teen-Submitted", value: teens },
            { label: "Adult-Submitted", value: adults },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-light rounded-card p-6 shadow-sm">
              <div className="font-display font-black text-4xl text-orange tracking-tight leading-none mb-1">{s.value}</div>
              <div className="text-gray-warm text-sm">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-4 mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, location, or career..."
            className="flex-1 bg-white border border-gray-light rounded-xl px-5 py-3 text-sm text-ink placeholder-gray-mid focus:outline-none focus:border-orange/40 shadow-sm"
          />
          <span className="text-sm text-gray-warm whitespace-nowrap">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-20 text-gray-warm">Loading...</div>
        ) : (
          <div className="bg-white border border-gray-light rounded-card-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-light border-b border-gray-mid/20">
                    {["Date", "Name", "Email", "Audience", "Age", "Location", "Flow State", "Top Match"].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-warm uppercase tracking-widest px-5 py-4 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-16 text-gray-warm">No submissions yet.</td>
                    </tr>
                  ) : (
                    filtered.map((s) => (
                      <tr key={s.id} className="border-b border-gray-light last:border-0 hover:bg-orange-light/30 transition-colors">
                        <td className="px-5 py-4 text-gray-warm whitespace-nowrap">{new Date(s.created_at).toLocaleDateString()}</td>
                        <td className="px-5 py-4 font-medium text-ink whitespace-nowrap">{s.teen_name || <span className="text-gray-mid">—</span>}</td>
                        <td className="px-5 py-4 text-charcoal">{s.email || <span className="text-gray-mid">—</span>}</td>
                        <td className="px-5 py-4">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.audience === "teen" ? "bg-orange-light text-orange" : "bg-gray-light text-charcoal"}`}>
                            {s.audience || "—"}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-gray-warm">{s.age || "—"}</td>
                        <td className="px-5 py-4 text-gray-warm whitespace-nowrap">{s.location || "—"}</td>
                        <td className="px-5 py-4 text-charcoal max-w-[180px] truncate">{s.flow_state || "—"}</td>
                        <td className="px-5 py-4">
                          {s.career_matches?.[0] ? (
                            <div>
                              <div className="font-medium text-ink">{s.career_matches[0].title}</div>
                              <div className="text-xs text-gray-warm">{s.career_matches[0].salary}</div>
                            </div>
                          ) : <span className="text-gray-mid">—</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
