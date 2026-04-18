import React, { useState } from "react";
import { useRunNaturalLanguageQuery, useGetSampleQuestions, useGetSchema, useExplainSqlQuery } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Terminal, Database, Loader2, AlertCircle, Play, Info } from "lucide-react";

export default function Home() {
  const [question, setQuestion] = useState("");
  const { data: sampleQuestionsData } = useGetSampleQuestions();
  const { data: schemaData } = useGetSchema();
  
  const queryMutation = useRunNaturalLanguageQuery();
  const explainMutation = useExplainSqlQuery();

  const handleQuery = () => {
    if (!question.trim()) return;
    queryMutation.mutate({ data: { question } });
    explainMutation.reset();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleQuery();
    }
  };

  const handleExplain = () => {
    if (queryMutation.data?.sql) {
      explainMutation.mutate({ data: { sql: queryMutation.data.sql } });
    }
  };

  const setSampleQuestion = (q: string) => {
    setQuestion(q);
    queryMutation.mutate({ data: { question: q } });
    explainMutation.reset();
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b bg-card border-border px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <Terminal className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">SQL Assistant</h1>
            <p className="text-xs text-muted-foreground">Natural Language to PostgreSQL</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8 space-y-6 flex flex-col">
        {/* Input Section */}
        <section className="space-y-4">
          <div className="relative group">
            <div className="absolute inset-0 bg-primary/5 rounded-lg -m-1 transition-all group-hover:bg-primary/10"></div>
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your data... (e.g. Show me top 10 customers by revenue)"
              className="min-h-[120px] text-base resize-none relative z-10 font-medium font-sans border-muted-foreground/20 focus-visible:ring-primary/30"
              disabled={queryMutation.isPending}
            />
            <div className="absolute bottom-4 right-4 z-20">
              <Button 
                onClick={handleQuery} 
                disabled={queryMutation.isPending || !question.trim()}
                className="shadow-md transition-all hover:scale-105"
              >
                {queryMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Run Query
              </Button>
            </div>
          </div>

          {/* Sample Questions */}
          {sampleQuestionsData?.questions && sampleQuestionsData.questions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              <span className="text-sm text-muted-foreground py-1 mr-1">Examples:</span>
              {sampleQuestionsData.questions.map((q, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  onClick={() => setSampleQuestion(q)}
                  disabled={queryMutation.isPending}
                  className="rounded-full text-xs font-normal border-border/50 hover:bg-primary/5 hover:text-primary"
                >
                  {q}
                </Button>
              ))}
            </div>
          )}
        </section>

        {/* Results Section */}
        {queryMutation.isError && (
          <Alert variant="destructive" className="animate-in fade-in slide-in-from-bottom-2">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {queryMutation.error?.error || "An unexpected error occurred while executing the query."}
            </AlertDescription>
          </Alert>
        )}

        {queryMutation.data && !queryMutation.isError && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 flex-1 flex flex-col min-h-0">
            
            {/* SQL Output */}
            <Card className="border-border/50 overflow-hidden shadow-sm">
              <div className="bg-muted/50 border-b border-border/50 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Generated SQL</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 text-xs" 
                  onClick={handleExplain}
                  disabled={explainMutation.isPending}
                >
                  {explainMutation.isPending ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Info className="h-3 w-3 mr-2" />}
                  Explain
                </Button>
              </div>
              <CardContent className="p-0 bg-[#0f172a] text-slate-50">
                <ScrollArea className="w-full">
                  <pre className="p-4 text-sm font-mono leading-relaxed overflow-x-auto">
                    <code>{queryMutation.data.sql}</code>
                  </pre>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Explanation */}
            {explainMutation.data && (
              <Card className="bg-primary/5 border-primary/20 animate-in fade-in">
                <CardContent className="p-4 flex items-start gap-3">
                  <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div className="text-sm leading-relaxed text-foreground/90">
                    {explainMutation.data.explanation}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Data Table */}
            <Card className="flex-1 flex flex-col overflow-hidden border-border/50 shadow-sm">
              <div className="bg-muted/30 border-b border-border/50 px-4 py-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Results</h3>
                <div className="flex items-center gap-3">
                  {queryMutation.data.warning && (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20">
                      {queryMutation.data.warning}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="font-mono tabular-nums">
                    {queryMutation.data.rowCount} row{queryMutation.data.rowCount !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </div>
              
              <div className="flex-1 min-h-[300px] overflow-hidden relative">
                {queryMutation.data.rows && queryMutation.data.rows.length > 0 ? (
                  <ScrollArea className="h-[400px] w-full border-t-0 rounded-b-lg">
                    <Table>
                      <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                        <TableRow className="hover:bg-transparent">
                          {queryMutation.data.columns.map((col, i) => (
                            <TableHead key={i} className="font-semibold text-foreground/80 h-10 py-2">
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {queryMutation.data.rows.map((row, rowIndex) => (
                          <TableRow key={rowIndex} className="border-border/30 hover:bg-muted/20">
                            {row.map((cell, colIndex) => (
                              <TableCell key={colIndex} className="py-2 text-sm text-muted-foreground">
                                {cell === null ? (
                                  <span className="text-muted-foreground/40 italic">null</span>
                                ) : (
                                  cell
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm p-8 text-center bg-muted/5">
                    No results returned for this query.
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* Schema Viewer */}
      {schemaData && schemaData.tables && (
        <div className="border-t bg-card border-border mt-auto">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="schema" className="border-b-0">
              <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-muted/20 text-sm font-medium">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Database className="h-4 w-4" />
                  Database Schema Explorer
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6 pt-2 bg-muted/10">
                <div className="text-xs text-muted-foreground mb-4">
                  {schemaData.schema}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {schemaData.tables.map((table) => (
                    <Card key={table.name} className="shadow-none border-border/50 bg-background/50">
                      <CardHeader className="py-3 px-4 bg-muted/30 border-b border-border/50">
                        <CardTitle className="text-sm font-mono flex items-center gap-2">
                          {table.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <ScrollArea className="h-[200px]">
                          <table className="w-full text-xs">
                            <tbody>
                              {table.columns.map((col) => (
                                <tr key={col.name} className="border-b border-border/30 last:border-0 hover:bg-muted/20">
                                  <td className="py-2 px-4 font-mono text-foreground/80">{col.name}</td>
                                  <td className="py-2 px-4 text-muted-foreground font-mono text-[10px] text-right">
                                    {col.type} {col.nullable ? "" : <span className="text-destructive/80 ml-1">NOT NULL</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </div>
  );
}
