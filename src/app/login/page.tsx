// app/login/page.tsx
import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-4">Loading...</div>}>
      <LoginClient />
    </Suspense>
  );
}