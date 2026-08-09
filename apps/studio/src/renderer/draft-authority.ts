import type { OperationV1 } from "../../../../packages/theme-core/src/index.js";

export type DraftEdit = { operation: OperationV1; revision: number; mode: string };

type PendingEdit = DraftEdit & { timer: ReturnType<typeof setTimeout> };
type Options = {
  persist(field: string, edit: DraftEdit): Promise<void>;
  onDraftChange(): void;
  onInvalid(fields: readonly string[]): void;
  onFailure(field: string, edit: DraftEdit, error: unknown, isLatest: boolean): void;
};

export class DraftAuthority {
  private readonly revisions = new Map<string, number>();
  private readonly pending = new Map<string, PendingEdit>();
  private readonly inFlight = new Set<Promise<boolean>>();
  private readonly invalid = new Set<string>();

  constructor(
    private readonly options: Options,
    private readonly delay = 350,
  ) {}

  schedule(field: string, operation: OperationV1, mode: string, valueIsValid = true): void {
    this.options.onDraftChange();
    const revision = (this.revisions.get(field) ?? 0) + 1;
    this.revisions.set(field, revision);
    const previous = this.pending.get(field);
    if (previous) clearTimeout(previous.timer);
    this.pending.delete(field);
    if (!valueIsValid) {
      this.invalid.add(field);
      return;
    }
    this.invalid.delete(field);
    const edit = { operation, revision, mode };
    const timer = setTimeout(() => void this.commit(field, edit), this.delay);
    this.pending.set(field, { ...edit, timer });
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

  async run<T>(action: () => Promise<T>): Promise<{ ran: false } | { ran: true; value: T }> {
    if (!(await this.flushAll())) return { ran: false };
    return { ran: true, value: await action() };
  }

  reset(): void {
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.invalid.clear();
    this.revisions.clear();
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

  private commit(field: string, edit: DraftEdit): Promise<boolean> {
    const current = this.pending.get(field);
    if (current?.revision === edit.revision) {
      clearTimeout(current.timer);
      this.pending.delete(field);
    } else if (current) {
      return Promise.resolve(true);
    }
    const persistence = this.options.persist(field, edit).then(
      () => true,
      (error: unknown) => {
        this.options.onFailure(field, edit, error, this.revisions.get(field) === edit.revision);
        return false;
      },
    );
    this.inFlight.add(persistence);
    void persistence.finally(() => this.inFlight.delete(persistence));
    return persistence;
  }
}
