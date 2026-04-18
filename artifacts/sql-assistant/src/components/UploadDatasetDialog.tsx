import React, { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Table2,
  Sparkles,
} from "lucide-react";

interface UploadResult {
  tableName: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
  message: string;
  sql: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (tableName: string) => void;
}

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function UploadDatasetDialog({ open, onOpenChange, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [tableName, setTableName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setTableName("");
    setUploading(false);
    setProgress(0);
    setResult(null);
    setError(null);
    setDragging(false);
  };

  const handleClose = (v: boolean) => {
    if (!uploading) {
      onOpenChange(v);
      if (!v) reset();
    }
  };

  const acceptFile = (f: File) => {
    const lower = f.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
      setError("Please select a CSV or Excel (.xlsx / .xls) file.");
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError("File must be smaller than 50 MB.");
      return;
    }
    setFile(f);
    setError(null);
    setResult(null);
    const auto = f.name.replace(/\.(csv|xlsx|xls)$/i, "").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
    setTableName(auto || "");
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setProgress(10);

    const formData = new FormData();
    formData.append("file", file);
    if (tableName.trim()) formData.append("tableName", tableName.trim());

    try {
      setProgress(40);
      const res = await fetch(`${BASE_URL}/api/sql/upload`, {
        method: "POST",
        body: formData,
      });

      setProgress(85);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        setUploading(false);
        setProgress(0);
        return;
      }

      setProgress(100);
      setResult(data as UploadResult);
      queryClient.invalidateQueries({ queryKey: ["getSchema"] });
      queryClient.invalidateQueries({ queryKey: ["getSampleQuestions"] });
    } catch (err) {
      setError("Network error — please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleQueryNow = () => {
    if (result) {
      onSuccess?.(result.tableName);
      onOpenChange(false);
      reset();
    }
  };

  const fileSizeLabel = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Upload Dataset
          </DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file from Kaggle or anywhere — it becomes a queryable database table instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Success state */}
          {result ? (
            <div className="space-y-4">
              <Alert className="border-green-500/30 bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700 font-medium">{result.message}</AlertDescription>
              </Alert>

              <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-primary" />
                  <span className="font-mono font-semibold text-sm">{result.tableName}</span>
                </div>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>{result.rowCount.toLocaleString()} rows</span>
                  <span>{result.columnCount} columns</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.columns.slice(0, 12).map((col) => (
                    <Badge key={col} variant="outline" className="font-mono text-xs">{col}</Badge>
                  ))}
                  {result.columns.length > 12 && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      +{result.columns.length - 12} more
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleQueryNow} className="flex-1 gap-2">
                  <Sparkles className="h-4 w-4" />
                  Query This Dataset Now
                </Button>
                <Button variant="outline" onClick={reset}>Upload Another</Button>
              </div>
            </div>
          ) : (
            <>
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => !file && fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer
                  ${dragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border/60 hover:border-primary/40 hover:bg-muted/30"}
                  ${file ? "cursor-default" : ""}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={onFileChange}
                  className="hidden"
                />

                {file ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileSpreadsheet className="h-8 w-8 text-green-500 shrink-0" />
                      <div className="text-left min-w-0">
                        <p className="font-medium text-sm truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{fileSizeLabel(file.size)}</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFile(null); setTableName(""); setError(null); }}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      disabled={uploading}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-10 w-10 text-muted-foreground/50 mx-auto" />
                    <div>
                      <p className="font-medium text-sm">Drop your file here, or <span className="text-primary">browse</span></p>
                      <p className="text-xs text-muted-foreground mt-1">Supports CSV, XLSX, XLS — up to 50 MB</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Table name override */}
              {file && (
                <div className="space-y-1.5">
                  <Label htmlFor="upload-table-name" className="text-xs text-muted-foreground">
                    Table Name <span className="text-muted-foreground/60">(auto-filled from filename)</span>
                  </Label>
                  <Input
                    id="upload-table-name"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    placeholder="e.g. netflix_titles"
                    className="font-mono"
                    disabled={uploading}
                  />
                </div>
              )}

              {/* Progress */}
              {uploading && (
                <div className="space-y-2">
                  <Progress value={progress} className="h-2" />
                  <p className="text-xs text-center text-muted-foreground animate-pulse">
                    {progress < 50 ? "Reading file…" : progress < 90 ? "Importing rows…" : "Finalizing…"}
                  </p>
                </div>
              )}

              {/* Error */}
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Tips */}
              {!file && (
                <div className="rounded-lg bg-muted/30 border border-border/40 p-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Tips for best results:</p>
                  <ul className="text-xs text-muted-foreground/80 space-y-0.5 list-disc list-inside">
                    <li>First row should be column headers</li>
                    <li>Works great with Kaggle CSV exports</li>
                    <li>Numbers and decimals are auto-detected</li>
                    <li>Up to 100,000 rows are imported</li>
                  </ul>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={() => handleClose(false)} disabled={uploading} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className="flex-1 gap-2"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {uploading ? "Uploading…" : "Upload & Import"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
