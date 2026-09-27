import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Settings, Save, Loader2, Store, CreditCard, Wallet, Cpu } from "lucide-react";
import { api } from "../convex/_generated/api";
import {
  PageHeader,
  LoadingState,
  errorMessage,
  AlertBanner,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, Badge } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

const GROUP_ICONS: Record<string, any> = {
  Toko: Store,
  Struk: CreditCard,
  Inventory: Cpu,
  Wallet: Wallet,
  Identifikasi: Cpu,
  Jastip: Settings,
  PPOB: Cpu,
  Sistem: Settings,
};

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string | number | boolean> | null>(null);

  const settings = useQuery(api.settings.getAll, {});
  const meta = useQuery(api.settings.getMeta, {});
  const update = useMutation(api.settings.update);

  if (settings === undefined) return <LoadingState label="Memuat pengaturan…" />;
  if ("error" in settings) {
    return <AlertBanner variant="ERROR" title="Gagal memuat pengaturan">{String(settings.error)}</AlertBanner>;
  }

  const values: Record<string, string | number | boolean> = draft ?? (settings as unknown as Record<string, string | number | boolean>);
  const metaList = (meta && !("error" in meta) ? meta : []) as any[];

  const groups = Array.from(new Set(metaList.map((m) => m.group)));
  const dirty = draft !== null;

  function set(key: string, value: string | number | boolean) {
    setSaved(false);
    setDraft({ ...values, [key]: value });
  }

  async function save() {
    const original = settings as unknown as Record<string, unknown>;
    const changed = Object.entries(draft ?? {}).filter(
      ([k, v]) => original[k] !== v,
    );
    if (changed.length === 0) {
      setSaved(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await update({
        settings: changed.map(([key, value]) => ({
          key,
          value: value as string | number | boolean,
        })),
      });
      setDraft(null);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pengaturan"
        description="Konfigurasi toko, struk, wallet, dan integrasi. Perubahan dicatat di audit log."
        action={
          <div className="flex items-center gap-2">
            {saved && <Badge variant="success">Tersimpan</Badge>}
            {dirty && <Badge variant="warning">Belum disimpan</Badge>}
            <Button onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan
            </Button>
          </div>
        }
      />

      {error && <AlertBanner variant="ERROR" title="Gagal menyimpan">{error}</AlertBanner>}

      {groups.map((group) => {
        const Icon = GROUP_ICONS[group] ?? Settings;
        return (
          <Card key={group}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Icon className="h-4 w-4 text-primary" /> {group}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {metaList
                .filter((m) => m.group === group)
                .map((m) => (
                  <SettingField
                    key={m.key}
                    label={m.label}
                    type={m.type}
                    value={values[m.key] ?? m.defaultValue}
                    onChange={(v) => set(m.key, v)}
                  />
                ))}
            </CardContent>
          </Card>
        );
      })}

      {dirty && (
        <div className="sticky bottom-4 flex justify-end">
          <Button size="lg" onClick={save} disabled={busy} className="shadow-lg">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Perubahan
          </Button>
        </div>
      )}
    </div>
  );
}

function SettingField({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: "STRING" | "NUMBER" | "BOOLEAN";
  value: string | number | boolean;
  onChange: (v: string | number | boolean) => void;
}) {
  if (type === "BOOLEAN") {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
        <span className="text-sm">{label}</span>
        <Switch checked={!!value} onCheckedChange={onChange} />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={String(value ?? "")}
        inputMode={type === "NUMBER" ? "numeric" : undefined}
        onChange={(e) =>
          onChange(type === "NUMBER" ? Number(e.target.value) || 0 : e.target.value)
        }
      />
    </div>
  );
}
