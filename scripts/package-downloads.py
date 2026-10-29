"""Create the README's standalone downloads from the current web sources."""
from pathlib import Path
import shutil
import subprocess
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
subprocess.run(['node', str(root / 'scripts/build.cjs')], cwd=root, check=True)
downloads = root / 'downloads'
downloads.mkdir(exist_ok=True)
html = downloads / 'SoloCFO_v3_Offline.html'
shutil.copyfile(root / 'dist' / html.name, html)
guide = '''SOLOCFO 3.0 – KURZANLEITUNG

1. ZIP vollständig entpacken.
2. SoloCFO_v3_Offline.html im selben Ordner per Doppelklick in einem
   aktuellen Browser öffnen. Keine Installation und kein API-Schlüssel nötig.
3. Unter Unternehmenswert die DCF-Bewertung ausprobieren, unter Stundensatz
   die Team-/Kostenplanung. Eingaben wirken nach Verlassen des Felds.
4. Szenarien benennen und speichern; im Maßnahmenplan vergleichen.
5. Bericht als PDF drucken; JSON-Backup unter Daten & Import exportieren.

Die Demo beginnt mit fiktiven Daten. Auf iPhone/iPad kann die Dateivorschau
das Ausführen verhindern. Bei eingeschränkter Dateispeicherung die lokale
Web-Version aus dem vollständigen Quellcode verwenden.

Entwicklungsstand, keine kommerzielle Freigabe. Die Bewertungs- und
Stundenmodelle benötigen eigene, geprüfte Annahmen. Browser-Speicher und
JSON-Backups sind unverschlüsselt. Zunächst mit fiktiven Daten testen.

Quellcode und ausführliche Anleitung:
https://github.com/jo1996-sketch/SoloCFO
'''
archive = downloads / 'SoloCFO_v3_Demo.zip'
with ZipFile(archive, 'w', ZIP_DEFLATED) as z:
    z.write(html, html.name)
    z.writestr('KURZANLEITUNG.txt', guide)
with ZipFile(archive) as z:
    assert z.testzip() is None
    assert z.read(html.name) == html.read_bytes()
print('Download-Dateien erstellt und geprüft:', html.name, archive.name)
