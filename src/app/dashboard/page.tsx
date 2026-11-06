"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyDashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/host/dashboard");
  }, [router]);

  return (
    <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
      Redirecting to Host Portal Dashboard...
    </div>
  );
}
