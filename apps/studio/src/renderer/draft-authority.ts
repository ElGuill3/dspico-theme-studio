import type { OperationV1 } from "../../../../packages/theme-core/src/index.js";

export type DraftEdit<Operation = OperationV1> = { operation: Operation; revision: number; mode: string };

type PendingEdit<Operation> = DraftEdit<Operation> & { timer?: ReturnType<typeof setTimeout> };
type Options<Operation> = {
  persist(field: string, edit: DraftEdit<Operation>): Promise<boolean | void>;
  onDraftChange(): void;
  onDraftStateChange?(dirty: boolean): void;
  onInvalid(fields: readonly string[]): void;
  onSuccess?(field: string, edit: DraftEdit<Operation>, isLatest: boolean): void;
  onFailure(field: string, edit: DraftEdit<Operation>, error: unknown, isLatest: boolean): void;
};

export const createDraftStateAggregator = (onChange: (dirty: boolean) => void) => {
  const sources = new Map<string, boolean>();
  let published = false;
  return (source: string, dirty: boolean): void => {
    sources.set(source, dirty);
    const next = [...sources.values()].some(Boolean);
    if (next === published) return;
    published = next;
    onChange(next);
  };
};

export class DraftAuthority<Operation = OperationV1> {
  private readonly revisions = new Map<string, number>();
  private readonly pending = new Map<string, PendingEdit<Operation>>();
  private readonly inFlight = new Set<Promise<boolean>>();
  private readonly invalid = new Set<string>();
  private draftState = false;

  constructor(
    private readonly options: Options<Operation>,
    private readonly delay: number | null = 350,
  ) {}

  schedule(field: string, operation: Operation, mode: string, valueIsValid = true): number {
    this.options.onDraftChange();
    const previous = this.pending.get(field),
      revision = this.delay === null && previous ? previous.revision : (this.revisions.get(field) ?? 0) + 1;
    this.revisions.set(field, revision);
    if (previous?.timer !== undefined) clearTimeout(previous.timer);
    this.pending.delete(field);
    if (!valueIsValid) {
      this.invalid.add(field);
      this.notifyDraftState();
      return revision;
    }
    this.invalid.delete(field);
    const edit = { operation, revision, mode };
    const timer = this.delay === null ? undefined : setTimeout(() => void this.commit(field, edit), this.delay);
    this.pending.set(field, { ...edit, ...(timer === undefined ? {} : { timer }) });
    this.notifyDraftState();
    return revision;
  }

  invalidFields(): readonly string[] {
    return [...this.invalid];
  }

  hasDrafts(): boolean {
    return this.pending.size > 0 || this.inFlight.size > 0 || this.invalid.size > 0;
  }

  flush(): Promise<boolean> {
    return this.flushAll();
  }

  async flushField(field: string): Promise<boolean> {
    const edit = this.pending.get(field);
    return edit ? this.commit(field, edit) : true;
  }

  discardField(field: string): void {
    const edit = this.pending.get(field);
    if (edit?.timer !== undefined) clearTimeout(edit.timer);
    this.pending.delete(field);
    this.invalid.delete(field);
    if (edit && this.revisions.get(field) === edit.revision) this.revisions.set(field, Math.max(0, edit.revision - 1));
    this.notifyDraftState();
  }

  async run<T>(action: () => Promise<T>): Promise<{ ran: false } | { ran: true; value: T }> {
    if (!(await this.flushAll())) return { ran: false };
    return { ran: true, value: await action() };
  }

  reset(): void {
    for (const { timer } of this.pending.values()) if (timer !== undefined) clearTimeout(timer);
    this.pending.clear();
    this.invalid.clear();
    this.revisions.clear();
    this.notifyDraftState();
  }

  dispose(): void {
    this.reset();
  }

  private async flushAll(): Promise<boolean> {
    while (true) {
      const invalid = this.invalidFields();
      if (invalid.length > 0) {
        this.options.onInvalid(invalid);
        return false;
      }
      const pending = [...this.pending.entries()].map(([field, edit]) => this.commit(field, edit));
      const work = [...this.inFlight, ...pending];
      if (work.length === 0) return true;
      if ((await Promise.all(work)).some((succeeded) => !succeeded)) return false;
    }
  }

  private commit(field: string, edit: DraftEdit<Operation>): Promise<boolean> {
    const current = this.pending.get(field);
    if (current?.revision === edit.revision) {
      if (current.timer !== undefined) clearTimeout(current.timer);
      this.pending.delete(field);
    } else if (current) {
      return Promise.resolve(true);
    }
    const persistence = this.options.persist(field, edit).then(
      (succeeded) => {
        const isLatest = this.revisions.get(field) === edit.revision;
        if (succeeded === false) {
          this.options.onFailure(field, edit, new Error("Persistence was rejected."), isLatest);
          return false;
        }
        this.options.onSuccess?.(field, edit, isLatest);
        return true;
      },
      (error: unknown) => {
        this.options.onFailure(field, edit, error, this.revisions.get(field) === edit.revision);
        return false;
      },
    );
    this.inFlight.add(persistence);
    this.notifyDraftState();
    void persistence.finally(() => {
      this.inFlight.delete(persistence);
      this.notifyDraftState();
    });
    return persistence;
  }

  private notifyDraftState(): void {
    const dirty = this.hasDrafts();
    if (dirty === this.draftState) return;
    this.draftState = dirty;
    this.options.onDraftStateChange?.(dirty);
  }
}
