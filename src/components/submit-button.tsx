"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className,
  pendingLabel = "保存中",
  ...props
}: {
  children: React.ReactNode;
  className: string;
  pendingLabel?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "disabled">) {
  const { pending } = useFormStatus();

  return (
    <button {...props} className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
