import logoUrl from "./assets/pico-theme-creator.svg";

export function BrandMark({ label, size = 36 }: { label?: string; size?: number }) {
  return <img className="brand-logo" src={logoUrl} width={size} height={size} alt={label ?? ""} />;
}
