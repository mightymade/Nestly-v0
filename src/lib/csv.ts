/** Downloads rows as a CSV file. The first row is the header. */
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const text = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
