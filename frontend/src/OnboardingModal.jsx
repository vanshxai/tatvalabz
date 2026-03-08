import { useMemo, useState } from "react";

const STEP_COUNT = 3;

export default function OnboardingModal({ isOpen, initialData, userEmail, onComplete }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => ({
    fullName: initialData?.fullName || "",
    organization: initialData?.organization || "",
    role: initialData?.role || "",
    useCase: initialData?.useCase || "",
    storagePlan: initialData?.storagePlan || "local-first",
  }));

  const stepTitle = useMemo(() => {
    if (step === 1) return "Profile Basics";
    if (step === 2) return "Usage Context";
    return "Storage Preference";
  }, [step]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (step === STEP_COUNT) {
      onComplete({ ...form, completedAt: new Date().toISOString() });
      return;
    }
    setStep((prev) => Math.min(STEP_COUNT, prev + 1));
  };

  const handleBack = () => setStep((prev) => Math.max(1, prev - 1));

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" style={{ background: "rgba(2, 6, 23, 0.72)" }}>
      <div
        className="w-full max-w-2xl rounded-sm overflow-hidden"
        style={{
          background: "var(--bg-base)",
          border: "1px solid var(--border-technical)",
          boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
        }}
      >
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-technical)", background: "var(--bg-card)" }}>
          <p className="text-[10px] uppercase tracking-[0.22em] mb-1" style={{ color: "#6b7fa0" }}>Onboarding</p>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold" style={{ color: "#e2e8f0" }}>{stepTitle}</h2>
            <span className="text-xs font-mono" style={{ color: "#94a3b8" }}>Step {step} / {STEP_COUNT}</span>
          </div>
          <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>{userEmail}</p>
        </div>

        <div className="p-5 space-y-4">
          {step === 1 && (
            <>
              <label className="block text-xs" style={{ color: "#94a3b8" }}>
                Full Name
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-sm text-sm"
                  style={{ background: "#020617", border: "1px solid rgba(100,160,220,0.2)", color: "#e2e8f0" }}
                />
              </label>
              <label className="block text-xs" style={{ color: "#94a3b8" }}>
                Organization
                <input
                  type="text"
                  value={form.organization}
                  onChange={(e) => setForm((prev) => ({ ...prev, organization: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-sm text-sm"
                  style={{ background: "#020617", border: "1px solid rgba(100,160,220,0.2)", color: "#e2e8f0" }}
                />
              </label>
            </>
          )}

          {step === 2 && (
            <>
              <label className="block text-xs" style={{ color: "#94a3b8" }}>
                Role
                <input
                  type="text"
                  placeholder="e.g. Design Engineer"
                  value={form.role}
                  onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-sm text-sm"
                  style={{ background: "#020617", border: "1px solid rgba(100,160,220,0.2)", color: "#e2e8f0" }}
                />
              </label>
              <label className="block text-xs" style={{ color: "#94a3b8" }}>
                Primary Use Case
                <textarea
                  value={form.useCase}
                  onChange={(e) => setForm((prev) => ({ ...prev, useCase: e.target.value }))}
                  rows={3}
                  placeholder="What do you want to model in TatvaLabz?"
                  className="mt-1 w-full px-3 py-2 rounded-sm text-sm"
                  style={{ background: "#020617", border: "1px solid rgba(100,160,220,0.2)", color: "#e2e8f0", resize: "vertical" }}
                />
              </label>
            </>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: "#cbd5e1" }}>
                Choose your storage mode. You can change this later in settings.
              </p>
              {[
                {
                  key: "local-first",
                  title: "Local First (Free)",
                  desc: "Workflow stays on this device browser storage.",
                },
                {
                  key: "cloud-pro",
                  title: "Cloud Sync (Pro)",
                  desc: "Store workflow in cloud for backup and team access.",
                },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, storagePlan: option.key }))}
                  className="w-full text-left p-3 rounded-sm"
                  style={{
                    background: form.storagePlan === option.key ? "rgba(37,99,235,0.16)" : "rgba(15,23,42,0.6)",
                    border: form.storagePlan === option.key
                      ? "1px solid rgba(59,130,246,0.6)"
                      : "1px solid rgba(100,160,220,0.18)",
                  }}
                >
                  <p className="text-sm font-bold" style={{ color: "#e2e8f0" }}>{option.title}</p>
                  <p className="text-xs" style={{ color: "#94a3b8" }}>{option.desc}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-4 flex items-center justify-between" style={{ borderTop: "1px solid var(--border-technical)" }}>
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 1}
            className="px-4 py-2 text-xs font-bold rounded-sm"
            style={{
              background: "transparent",
              border: "1px solid rgba(100,160,220,0.22)",
              color: step === 1 ? "#475569" : "#94a3b8",
              cursor: step === 1 ? "not-allowed" : "pointer",
            }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="px-4 py-2 text-xs font-bold rounded-sm"
            style={{ background: "rgba(37, 99, 235, 0.9)", color: "#fff" }}
          >
            {step === STEP_COUNT ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
