import {
  CUSTOM_VISUAL_ROLES_V1 as roles,
  type CustomVisualRoleV1,
  type CustomVisualSourceV1,
} from "../../../../packages/dspico-contract/src/custom-v1-3.js";

export function CustomAssetBench({
  sources,
  onAssign,
  disabled = false,
}: {
  sources: Partial<Record<CustomVisualRoleV1, CustomVisualSourceV1>>;
  onAssign(role: CustomVisualRoleV1): void;
  disabled?: boolean;
}) {
  return (
    <section className="custom-asset-bench" aria-labelledby="custom-asset-bench-title">
      <h2 id="custom-asset-bench-title">Fallback source assignments</h2>
      <div className="custom-role-grid" role="list" aria-label="Optional compatibility source roles">
        {roles.map((role) => {
          const source = sources[role];
          return (
            <div className="custom-role-card" data-custom-role={role} key={role} role="listitem">
              <strong>{role}</strong>
              <small>{source ? `source ${source.sourceSha256.slice(0, 12)}` : "unassigned"}</small>
              <button disabled={disabled} onClick={() => onAssign(role)}>
                {source ? `Replace ${role} PNG` : `Assign ${role} PNG`}
              </button>
            </div>
          );
        })}
      </div>
      <span className="custom-palette-lock">locked palette</span>
    </section>
  );
}
