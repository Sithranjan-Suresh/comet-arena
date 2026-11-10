"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Select, useToast } from "@/components/ui";
import { ACCOUNT_TYPES } from "@/lib/admin/org-handles";

export interface OrgRow {
  id: string;
  name: string;
  ig_handle: string | null;
  ig_account_type: string;
}

export function OrgHandleRow({ org }: { org: OrgRow }) {
  const router = useRouter();
  const toast = useToast();
  const [handle, setHandle] = useState(org.ig_handle ?? "");
  const [type, setType] = useState(org.ig_account_type);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/orgs/${org.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ig_handle: handle.trim() === "" ? null : handle,
          ig_account_type: type,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) toast.show(body.message ?? "Could not save.", "error");
      else {
        toast.show(`Saved ${org.name}`, "success");
        router.refresh();
      }
    } catch {
      toast.show("Network problem. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="border-b border-current/10 py-3">
      <form
        onSubmit={save}
        aria-label={`Instagram handle for ${org.name}`}
        className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_12rem_auto]"
      >
        <p className="font-semibold">{org.name}</p>
        <Input
          label="Instagram handle"
          hideLabel
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="@handle or instagram.com/handle"
        />
        <Select
          label="Account type"
          hideLabel
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" loading={busy}>
          Save
        </Button>
      </form>
    </li>
  );
}
