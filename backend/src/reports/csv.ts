type CsvCell = string | number | boolean | null;

/** Quote every cell, preserve null explicitly and neutralize spreadsheet formulas. */
export function csvCell(value: CsvCell): string {
  let text = value === null ? 'null' : String(value);
  // Numbers remain numeric, including negative temperatures. Only untrusted text
  // is prefixed; quoting alone does not prevent Excel/LibreOffice evaluation.
  if (typeof value === 'string') {
    let start = 0;
    while (start < text.length && (text.charCodeAt(start) <= 32 || /\s/u.test(text[start])))
      start++;
    if (['=', '+', '@', '-'].includes(text[start] ?? '') || ['\t', '\r', '\n'].includes(text[0]))
      text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

export function csvDocument(headers: string[], rows: CsvCell[][]): string {
  return (
    '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
  );
}
