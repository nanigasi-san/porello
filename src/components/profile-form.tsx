"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { updateProfileDisplayName, type ProfileFormState } from "@/app/actions";

const initialState: ProfileFormState = { status: "idle", message: null };

export function ProfileForm({ displayName }: { displayName: string }) {
  const [state, action, isPending] = useActionState(updateProfileDisplayName, initialState);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="displayName" className="text-sm font-semibold text-[#344054]">
          表示名
        </label>
        <input
          id="displayName"
          name="displayName"
          defaultValue={displayName}
          maxLength={80}
          className="h-11 w-full rounded-md border border-[#d8dee9] bg-white px-3 text-sm outline-none transition placeholder:text-[#98a2b3] focus:border-[#0f766e] focus:ring-2 focus:ring-[#b8ded9]"
        />
      </div>
      {state.message ? (
        <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-sm text-[#b42318]" : "text-sm text-[#0f766e]"}>
          {state.message}
        </p>
      ) : null}
      <button
        disabled={isPending}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Save size={16} />
        {isPending ? "保存中" : "保存"}
      </button>
    </form>
  );
}
