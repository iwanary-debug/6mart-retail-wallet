import { useRef, useState } from "react";
import { Download, FileUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertBanner, errorMessage } from "@/components/common";

export interface CsvTemplate {
  filename: string;
  header: string;
  example: string;
  /** Nama kolom yang wajib diisi. */
  required: string[];
}

export interface ImportReport {
  total: number;
  created: number;
  failed: number;
  errors: { row: number; message: string }[];
}

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  template: CsvTemplate;
  onImport: (rows: Record<string, string>[]) => Promise<ImportReport>;
}

/**
 * Pemecah CSV minimal.
 *
 * Mendukung pemisah koma atau titik koma, tanda kutip untuk nilai yang
 * mengandung pemisah, dan baris kosong yang dilewati. sengaja tidak memakai
 * pustaka eksternal supaya bundel frontend tetap ringan.
 */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    current.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    const isBlank = current.every((c) => c.trim() === "");
    if (!isBlank) rows.push(current);
    current = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === "," || ch === ";") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || current.length > 0) pushRow();

  if (rows.length < 2) return [];
  const header = rows[0].map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+(.)/g, (_, c: string) => c.toUpperCase())
      .replace(/^./, (c) => c.toLowerCase()),
  );
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => {
      obj[h] = (r[i] ?? "").trim();
    });
    return obj;
  });
}

function downloadTemplate(t: CsvTemplate) {
  const csv = `${t.header}\n${t.example}\n`;
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = t.filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CsvImportDialog({
  open,
  onOpenChange,
  title,
  template,
  onImport,
}: CsvImportDialogProps) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setText("");
    setRows(null);
    setError(null);
    setReport(null);
  };

  const handleFile = async (file: File) => {
    setError(null);
    setReport(null);
    const content = await file.text();
    setText(content);
    const parsed = parseCsv(content);
    if (parsed.length === 0) {
      setRows(null);
      setError(
        "File tidak terbaca. Pastikan baris pertama berisi nama kolom dan ada minimal satu baris data.",
      );
    } else {
      setRows(parsed);
    }
  };

  const submit = async () => {
    if (!rows) return;
    setBusy(true);
    setError(null);
    try {
      setReport(await onImport(rows));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Unggah file CSV atau tempel datanya. Baris yang bermasalah tidak
            menghentikan proses — semuanya dilaporkan per baris.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadTemplate(template)}
            >
              <Download className="h-4 w-4" /> Unduh Template
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              <FileUp className="h-4 w-4" /> Pilih File CSV
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
          </div>

          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs">
            <p className="font-medium">Kolom yang dipakai</p>
            <p className="mt-1 font-mono text-[11px] break-all text-muted-foreground">
              {template.header}
            </p>
            <p className="mt-1 text-muted-foreground">
              Wajib: {template.required.join(", ")}.{" "}
              {text.length > 0 && "Pemisah koma atau titik koma."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="csv-paste">Tempel data CSV</Label>
            <textarea
              id="csv-paste"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setReport(null);
                const parsed = parseCsv(e.target.value);
                setRows(parsed.length > 0 ? parsed : null);
              }}
              rows={5}
              placeholder={template.example}
              className="w-full rounded-lg border border-input bg-background p-2 font-mono text-xs"
            />
          </div>

          {rows && (
            <p className="text-sm">
              <strong>{rows.length}</strong> baris data siap diimpor.
            </p>
          )}

          {error && <AlertBanner variant="ERROR" title="Impor gagal">{error}</AlertBanner>}

          {report && (
            <AlertBanner
              variant={report.failed > 0 ? "WARNING" : "SUCCESS"}
              title={
                report.failed > 0
                  ? `${report.created} berhasil, ${report.failed} gagal`
                  : `${report.created} data berhasil diimpor`
              }
            >
              {report.failed > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs">
                  {report.errors.slice(0, 8).map((e) => (
                    <li key={e.row}>
                      Baris {e.row}: {e.message}
                    </li>
                  ))}
                  {report.errors.length > 8 && (
                    <li>…dan {report.errors.length - 8} baris lain.</li>
                  )}
                </ul>
              )}
            </AlertBanner>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Tutup
          </Button>
          <Button disabled={busy || !rows || rows.length === 0} onClick={submit}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Mengimpor…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" /> Impor {rows ? rows.length : 0} Baris
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
