import React, { useState } from "react";
import { useCreateTable, useDropTable, useGetSchema } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Loader2, CheckCircle2, AlertCircle, Table2 } from "lucide-react";

const SQL_TYPES = ["TEXT", "INTEGER", "NUMERIC", "BOOLEAN", "DATE", "TIMESTAMP", "SERIAL", "BIGINT", "REAL", "UUID", "JSONB"];

interface ColumnDef {
  id: string;
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
}

function makeId() {
  return Math.random().toString(36).slice(2, 8);
}

function defaultColumn(): ColumnDef {
  return { id: makeId(), name: "", type: "TEXT", nullable: true, primaryKey: false, unique: false };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateTableDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [tableName, setTableName] = useState("");
  const [columns, setColumns] = useState<ColumnDef[]>([
    { id: makeId(), name: "id", type: "SERIAL", nullable: false, primaryKey: true, unique: false },
  ]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: schemaData } = useGetSchema();

  const createMutation = useCreateTable({
    mutation: {
      onSuccess: (data) => {
        setSuccessMsg(data.message);
        setErrorMsg(null);
        queryClient.invalidateQueries({ queryKey: ["getSchema"] });
        queryClient.invalidateQueries({ queryKey: ["getSampleQuestions"] });
        setTableName("");
        setColumns([
          { id: makeId(), name: "id", type: "SERIAL", nullable: false, primaryKey: true, unique: false },
        ]);
      },
      onError: (err: { error?: string }) => {
        setErrorMsg(err?.error ?? "Failed to create table.");
        setSuccessMsg(null);
      },
    },
  });

  const dropMutation = useDropTable({
    mutation: {
      onSuccess: (data) => {
        setSuccessMsg(data.message);
        setErrorMsg(null);
        queryClient.invalidateQueries({ queryKey: ["getSchema"] });
        queryClient.invalidateQueries({ queryKey: ["getSampleQuestions"] });
      },
      onError: (err: { error?: string }) => {
        setErrorMsg(err?.error ?? "Failed to drop table.");
        setSuccessMsg(null);
      },
    },
  });

  const addColumn = () => setColumns((c) => [...c, defaultColumn()]);

  const removeColumn = (id: string) => setColumns((c) => c.filter((col) => col.id !== id));

  const updateColumn = (id: string, updates: Partial<ColumnDef>) => {
    setColumns((c) => c.map((col) => (col.id === id ? { ...col, ...updates } : col)));
  };

  const handleCreate = () => {
    setSuccessMsg(null);
    setErrorMsg(null);
    if (!tableName.trim()) { setErrorMsg("Table name is required."); return; }
    if (columns.some((c) => !c.name.trim())) { setErrorMsg("All columns must have a name."); return; }
    createMutation.mutate({
      data: {
        tableName: tableName.trim(),
        columns: columns.map(({ name, type, nullable, primaryKey, unique }) => ({
          name, type, nullable, primaryKey, unique,
        })),
      },
    });
  };

  const isPending = createMutation.isPending || dropMutation.isPending;
  const existingTables = schemaData?.tables ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setSuccessMsg(null); setErrorMsg(null); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Table2 className="h-5 w-5 text-primary" />
            Table Manager
          </DialogTitle>
          <DialogDescription>Create new tables or delete existing ones from your database.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto pr-1">
          <div className="space-y-6 py-1">
            {/* Status messages */}
            {successMsg && (
              <Alert className="border-green-500/30 bg-green-500/10 text-green-700">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>{successMsg}</AlertDescription>
              </Alert>
            )}
            {errorMsg && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}

            {/* Existing tables */}
            {existingTables.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground/80">Existing Tables</Label>
                <div className="flex flex-wrap gap-2">
                  {existingTables.map((t) => (
                    <div key={t.name} className="flex items-center gap-1.5 bg-muted/50 rounded-md px-3 py-1.5 border border-border/50">
                      <span className="font-mono text-sm">{t.name}</span>
                      <span className="text-xs text-muted-foreground">({t.columns.length} cols)</span>
                      <button
                        onClick={() => {
                          if (confirm(`Delete table "${t.name}"? This cannot be undone.`)) {
                            dropMutation.mutate({ tableName: t.name });
                          }
                        }}
                        disabled={isPending}
                        className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                        title={`Delete ${t.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Create Table Form */}
            <div className="space-y-4">
              <Label className="text-sm font-semibold text-foreground/80">Create New Table</Label>

              <div className="space-y-1.5">
                <Label htmlFor="tableName" className="text-xs text-muted-foreground">Table Name</Label>
                <Input
                  id="tableName"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="e.g. blog_posts"
                  className="font-mono"
                  disabled={isPending}
                />
              </div>

              {/* Columns */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Columns</Label>
                  <Button variant="outline" size="sm" onClick={addColumn} disabled={isPending} className="h-7 text-xs gap-1">
                    <Plus className="h-3.5 w-3.5" />
                    Add Column
                  </Button>
                </div>

                <div className="rounded-md border border-border/50 overflow-hidden">
                  {/* Header row */}
                  <div className="grid grid-cols-[2fr_1.5fr_auto_auto_auto_auto] gap-2 px-3 py-2 bg-muted/40 border-b border-border/50 text-xs font-medium text-muted-foreground">
                    <span>Column Name</span>
                    <span>Type</span>
                    <span className="text-center">PK</span>
                    <span className="text-center">Not Null</span>
                    <span className="text-center">Unique</span>
                    <span></span>
                  </div>

                  {columns.map((col, idx) => (
                    <div key={col.id} className={`grid grid-cols-[2fr_1.5fr_auto_auto_auto_auto] gap-2 px-3 py-2 items-center ${idx % 2 === 0 ? "bg-background" : "bg-muted/10"} border-b border-border/30 last:border-0`}>
                      <Input
                        value={col.name}
                        onChange={(e) => updateColumn(col.id, { name: e.target.value })}
                        placeholder="column_name"
                        className="font-mono h-8 text-sm"
                        disabled={isPending}
                      />
                      <Select value={col.type} onValueChange={(v) => updateColumn(col.id, { type: v })} disabled={isPending}>
                        <SelectTrigger className="h-8 text-sm font-mono">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SQL_TYPES.map((t) => (
                            <SelectItem key={t} value={t} className="font-mono text-sm">{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex justify-center">
                        <Checkbox
                          checked={col.primaryKey}
                          onCheckedChange={(v) => updateColumn(col.id, { primaryKey: !!v, nullable: v ? false : col.nullable })}
                          disabled={isPending}
                        />
                      </div>
                      <div className="flex justify-center">
                        <Checkbox
                          checked={!col.nullable}
                          onCheckedChange={(v) => updateColumn(col.id, { nullable: !v })}
                          disabled={isPending || col.primaryKey}
                        />
                      </div>
                      <div className="flex justify-center">
                        <Checkbox
                          checked={col.unique}
                          onCheckedChange={(v) => updateColumn(col.id, { unique: !!v })}
                          disabled={isPending || col.primaryKey}
                        />
                      </div>
                      <button
                        onClick={() => removeColumn(col.id)}
                        disabled={isPending || columns.length === 1}
                        className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 flex justify-center"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {columns.filter((c) => c.name).map((c) => (
                    <Badge key={c.id} variant="outline" className="font-mono text-xs">
                      {c.name}: {c.type}
                      {c.primaryKey && " PK"}
                      {!c.nullable && !c.primaryKey && " NN"}
                      {c.unique && !c.primaryKey && " UQ"}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t border-border/50 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button onClick={handleCreate} disabled={isPending || !tableName.trim()}>
            {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create Table
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
