import readXlsxFile from 'read-excel-file/node';

/** Convertit chaque feuille en lignes de texte (cellules séparées par « | ») pour la recherche. */
export async function extractXlsx(buffer: Buffer): Promise<string> {
  const sheets = await readXlsxFile(buffer);
  return sheets.map(({ sheet, data }) => {
    const rows = data
      .map((row) => row.map((cell) => (cell === null || cell === undefined ? '' : cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell))).join(' | ').trim())
      .filter((line) => line.replace(/[|\s]/g, '').length > 0);
    return [`# Feuille « ${sheet} »`, ...rows].join('\n');
  }).join('\n\n');
}
