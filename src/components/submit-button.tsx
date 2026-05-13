"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className,
  pendingLabel = "保存中",
}: {
  children: React.ReactNode;
  className: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
