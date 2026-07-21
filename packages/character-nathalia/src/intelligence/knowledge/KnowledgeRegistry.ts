/**
 * KnowledgeRegistry — an in-memory, registrable collection of knowledge
 * documents. Pure and side-effect free; the host can extend it at startup with
 * more documents without touching the search logic.
 */
import type { NathaliaContextKey } from "../../nathaliaTypes";
import type { KnowledgeDocument } from "./types";

export class KnowledgeRegistry {
  private readonly docs = new Map<string, KnowledgeDocument>();

  constructor(initial: KnowledgeDocument[] = []) {
    this.addMany(initial);
  }

  /** Add (or replace by id) a single document. Returns the registry for chaining. */
  add(doc: KnowledgeDocument): this {
    this.docs.set(doc.id, doc);
    return this;
  }

  /** Add many documents at once. */
  addMany(docs: KnowledgeDocument[]): this {
    for (const d of docs) this.add(d);
    return this;
  }

  /** Look up a document by id. */
  get(id: string): KnowledgeDocument | undefined {
    return this.docs.get(id);
  }

  /** All documents, stable insertion order. */
  list(): KnowledgeDocument[] {
    return [...this.docs.values()];
  }

  /** Documents belonging to a context (plus `general` is always relevant). */
  byContext(context: NathaliaContextKey): KnowledgeDocument[] {
    return this.list().filter(
      (d) => d.context === context || d.context === "general",
    );
  }

  /** Number of registered documents. */
  get size(): number {
    return this.docs.size;
  }
}
