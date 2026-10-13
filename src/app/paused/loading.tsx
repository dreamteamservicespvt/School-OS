import { AuthFrame } from "@/components/auth/auth-frame";

export default function Loading() {
  return (
    <AuthFrame eyebrow="School OS" title="Loading…">
      <div className="flex flex-col gap-3" aria-hidden="true">
        <div className="h-16 rounded-xl bg-sunken animate-pulse" />
        <div className="h-12 rounded-xl bg-sunken animate-pulse" />
      </div>
    </AuthFrame>
  );
}
