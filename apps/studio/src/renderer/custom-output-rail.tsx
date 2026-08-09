import {
  CUSTOM_VISUAL_SLOTS_V1,
  type CustomVisualPackageV1,
} from "../../../../packages/dspico-contract/src/custom-v1-3.js";
import { CUSTOM_PREVIEW_LABELS } from "./workspace/workspace-model.js";

export function CustomOutputRail({ visualPackage }: { visualPackage?: CustomVisualPackageV1 }) {
  const outputs = visualPackage?.outputs ?? [];
  return (
    <section
      className="custom-output-rail"
      data-complete={outputs.length === CUSTOM_VISUAL_SLOTS_V1.length}
      data-total-bytes={visualPackage?.totalBytes ?? 0}
      data-testid="custom-output-rail"
      aria-labelledby="custom-output-rail-title"
    >
      <h2 id="custom-output-rail-title">12-file output rail</h2>
      <p>
        <span>{CUSTOM_PREVIEW_LABELS.postCodec}</span> · <span>{CUSTOM_PREVIEW_LABELS.fidelity}</span> ·{" "}
        <span>{CUSTOM_PREVIEW_LABELS.limitation}</span>
      </p>
      <ol className="custom-output-list" aria-label="Compiled custom visual outputs">
        {CUSTOM_VISUAL_SLOTS_V1.map((slot) => {
          const output = outputs.find(({ path }) => path === slot.path);
          return (
            <li data-custom-output={slot.path} data-output-hash={output?.sha256 ?? ""} key={slot.path}>
              <code>{slot.path}</code>
              <span>{output ? `${output.length.toLocaleString()} bytes` : "waiting for source"}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
