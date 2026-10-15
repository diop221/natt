export function SyncError({ message }: { message: string | null }) {
  return message ? <p className="rounded-lg bg-warn-soft p-3 text-sm text-warn">{message}</p> : null;
}
