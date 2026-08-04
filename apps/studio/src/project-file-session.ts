import path from "node:path";
import type { ProjectStateV1 } from "../../../packages/theme-core/src/index.js";

export type ProjectFileStore = {
  open(relativePath: string): Promise<{ state: ProjectStateV1; orphans: string[] }>;
  save(relativePath: string, state: ProjectStateV1): Promise<void>;
};

type ChooseProjectPath = (mode: "open" | "save") => Promise<string>;
type OpenStore = (root: string) => Promise<ProjectFileStore>;

export class ProjectFileSession {
  private projectPath: string | undefined;

  constructor(
    private readonly chooseProjectPath: ChooseProjectPath,
    private readonly openStore: OpenStore,
  ) {}

  async open(): Promise<{ state: ProjectStateV1; orphans: string[] }> {
    const candidatePath = await this.chooseProjectPath("open");
    const store = await this.openStore(path.dirname(candidatePath));
    const opened = await store.open(path.basename(candidatePath));
    this.projectPath = candidatePath;
    return opened;
  }

  async save(state: ProjectStateV1, options: { newProject?: boolean } = {}): Promise<void> {
    const candidatePath =
      options.newProject || !this.projectPath ? await this.chooseProjectPath("save") : this.projectPath;
    const store = await this.openStore(path.dirname(candidatePath));
    await store.save(path.basename(candidatePath), state);
    this.projectPath = candidatePath;
  }
}
