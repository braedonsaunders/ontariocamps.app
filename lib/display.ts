export function displayOperatorName(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\bCA\b/g, "Conservation")
    .replace(/\s+/g, " ")
    .trim();
}
