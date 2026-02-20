// src/app/signup/page.tsx
import { Suspense } from "react";
import SignupClient from "./SignupClient";

export default function SignupPage() {
  return (
    <Suspense fallback={<div />}>
      <SignupClient />
    </Suspense>
  );
}