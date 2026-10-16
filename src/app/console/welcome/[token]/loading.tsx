import { ConsoleFrame } from "@/components/console/console-frame";

export default function Loading() {
  return (
    <ConsoleFrame>
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
        <div className="h-4 w-40 rounded bg-sunken animate-pulse" />
        <div className="h-9 w-64 rounded-lg bg-sunken animate-pulse" />
        <div className="h-14 rounded-xl bg-sunken animate-pulse mt-4" />
        <div className="h-12 rounded-xl bg-sunken animate-pulse" />
      </div>
    </ConsoleFrame>
  );
}
