import path from "node:path";
import type {
  LauncherParityProjectV1,
  ProjectStateV1,
  ProjectStateV3,
} from "../../../packages/theme-core/src/index.js";

// prettier-ignore
type PersistedProject = ProjectStateV1 | LauncherParityProjectV1 | ProjectStateV3;
// prettier-ignore
export type ProjectFileStore<TProject extends PersistedProject = ProjectStateV1> = {
  open(relativePath: string): Promise<{ state: TProject; orphans: string[] }>;
  save(relativePath: string, state: TProject): Promise<void>;
  saveV3?: (relativePath: string, state: ProjectStateV3) => Promise<void>;
};

type ChooseProjectPath = (mode: "open" | "save") => Promise<string>;
// prettier-ignore
type OpenStore<TProject extends PersistedProject> = (root: string) => Promise<ProjectFileStore<TProject>>;
type PortableMedia = { sha256: string; bytes: Uint8Array };
// prettier-ignore
type OpenV3Store = (root: string) => Promise<{ saveV3(state: ProjectStateV3, media?: readonly PortableMedia[]): Promise<void> }>;

export class ProjectFileSession<TProject extends PersistedProject = ProjectStateV1> {
  private projectPath: string | undefined;

  constructor(
    private readonly chooseProjectPath: ChooseProjectPath,
    private readonly openStore: OpenStore<TProject>,
    private readonly openV3Store?: OpenV3Store,
  ) {}

  async open(): Promise<{ state: TProject; orphans: string[] }> {
    const candidatePath = await this.chooseProjectPath("open");
    const store = await this.openStore(path.dirname(candidatePath));
    const opened = await store.open(path.basename(candidatePath));
    this.projectPath = candidatePath;
    return opened;
  }

  async save(state: TProject, options: { newProject?: boolean } = {}): Promise<void> {
    const candidatePath =
      options.newProject || !this.projectPath ? await this.chooseProjectPath("save") : this.projectPath;
    const store = await this.openStore(path.dirname(candidatePath));
    await store.save(path.basename(candidatePath), state);
    this.projectPath = candidatePath;
  }

  // prettier-ignore
  async saveMigratedCopy(state: ProjectStateV3, media: readonly PortableMedia[] = []): Promise<void> {
    const pending = state.project.requiredRoles.filter((role) => !state.project.confirmedRoles.includes(role));
    if (pending.length) throw new Error(`Role confirmation required: ${pending.join(", ")}`);
    if (state.project.quarantine.some(({ blocking }) => blocking)) throw new Error("Quarantined media cannot be saved.");
    const candidatePath = await this.chooseProjectPath("save");
    if (candidatePath === this.projectPath) throw new Error("Save migrated copy requires a new project path.");
    if (this.openV3Store) {
      await (await this.openV3Store(path.dirname(candidatePath))).saveV3(state, media);
      this.projectPath = candidatePath;
      return;
    }
    const store = await this.openStore(path.dirname(candidatePath));
    if (!store.saveV3) throw new Error("The selected store cannot atomically save a V3 project.");
    await store.saveV3(path.basename(candidatePath), state);
    this.projectPath = candidatePath;
  }
}
