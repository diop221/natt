"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useDict } from "@/components/I18n";

export function CopyButton({ text, label, absolute }: { text: string; label: string; absolute?: boolean }) {
  const t = useDict();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="link shrink-0"
      onClick={async () => {
        await navigator.clipboard.writeText(absolute ? new URL(text, window.location.origin).href : text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? t.common.copied : label}
    </button>
  );
}
