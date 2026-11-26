import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { copyVerifiedBackup, externalCopyOptions } from './backup-copy-core.mjs';

try {
  const options = externalCopyOptions(process.argv.slice(2));
  if (process.env.NODE_ENV === 'production') throw new Error('Solo desarrollo local');
  if (process.platform === 'win32') {
    const drive = /^([a-z]):[\\/]/i.exec(options.destination)?.[1]?.toUpperCase();
    if (!drive) throw new Error('Se requiere una unidad local');
    // Only the validated single drive letter enters this fixed diagnostic.
    // Reject network-mapped and optical drives, not just UNC paths.
    const check = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$d = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID = '${drive}:'"; if ($null -eq $d -or $d.DriveType -notin @(2,3)) { exit 1 }`,
      ],
      { timeout: 10000, stdio: 'ignore', windowsHide: true },
    );
    if (check.error || check.status !== 0) throw new Error('Unidad local no disponible');
  }
  const result = await copyVerifiedBackup({
    root: fileURLToPath(new URL('../', import.meta.url)),
    ...options,
  });
  console.log(
    `Segunda copia verificada: ${result.directory} (${result.files} archivos idénticos). No se restauró la base.`,
  );
} catch {
  console.error(
    'No se completó la segunda copia. Revisa origen verificado, destino local fuera del proyecto, espacio y que no exista. No se sobrescriben copias; un intento fallido no lleva copy-check.json.',
  );
  process.exitCode = 1;
}
