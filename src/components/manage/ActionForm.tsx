"use client";
import { useActionState, type ReactNode } from "react";
export type ActionState = { message: string };
export type FormAction = (state: ActionState, form: FormData) => Promise<ActionState>;
export function ActionForm({ action, children, submit = "Save" }: { action: FormAction; children: ReactNode; submit?: string }) {
  const [state, formAction, pending] = useActionState(action, { message: "" });
  return <form action={formAction} className="staff-form space-y-4">
    <fieldset disabled={pending} className="min-w-0 space-y-4">{children}<button className="staff-button" type="submit">{pending ? "Saving..." : submit}</button></fieldset>
    <p key={state.message} className="animate-quote-in text-sm motion-reduce:animate-none" role="status">{state.message}</p>
  </form>;
}
