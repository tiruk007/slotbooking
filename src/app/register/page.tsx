"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyRegisterPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/host/signup");
  }, [router]);

  return (
    <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
      Redirecting to Host Portal Sign Up...
    </div>
  );
}
