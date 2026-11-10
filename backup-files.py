"""Create or restore a portable Coach snapshot using only the Python standard library."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import sys
import tempfile
import zipfile


def digest(stream):
    checksum = hashlib.sha256()
    while chunk := stream.read(1024 * 1024):
        checksum.update(chunk)
    return checksum.hexdigest()


def create(source, output):
    source = Path(source).resolve()
    files = sorted(p for p in source.rglob('*') if p.is_file())
    manifest = {'format': 'draft-coach-backup', 'version': 1, 'files': []}
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_STORED, allowZip64=True) as bundle:
        for file in files:
            if file.is_symlink():
                raise ValueError('Symbolic links are not allowed in a backup')
            name = file.relative_to(source).as_posix()
            if not allowed(name):
                raise ValueError('Unexpected file in backup snapshot: ' + name)
            with file.open('rb') as stream:
                checksum = digest(stream)
            bundle.write(file, name)
            manifest['files'].append({'path': name, 'size': file.stat().st_size, 'sha256': checksum})
        bundle.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))


def allowed(name):
    parts = PurePosixPath(name).parts
    if not parts or name.startswith('/') or '\\' in name or ':' in name or '..' in parts:
        return False
    if name == 'Draft-Coach.sqlite3':
        return True
    if len(parts) < 2 or parts[0] != 'runtime':
        return False
    if len(parts) == 2:
        return parts[1] in {'sammlung-aktiv.json', 'taktikregeln.json', 'feld-lernstand.json',
                           'log-reset.json', 'loss-guard.json', 'partien.jsonl', 'antippen.jsonl', 'continuum.jsonl'}
    return len(parts) == 3 and parts[1] in {'referenzen', 'vorbereitung', 'reports'} and Path(parts[2]).suffix in {'.json', '.png'}


def restore(archive, target):
    target = Path(target).resolve()
    if target.exists():
        raise ValueError('Restore into a new directory; existing data will not be overwritten')
    target.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.draft-coach-restore-', dir=target.parent)).resolve()
    try:
        with zipfile.ZipFile(archive) as bundle:
            entries = bundle.infolist()
            names = [entry.filename for entry in entries]
            if len(names) != len(set(names)) or 'manifest.json' not in names:
                raise ValueError('Invalid or duplicate backup entries')
            manifest = json.loads(bundle.read('manifest.json'))
            if manifest.get('format') != 'draft-coach-backup' or manifest.get('version') != 1:
                raise ValueError('Unsupported backup format')
            records = manifest['files']
            if set(names) != {'manifest.json'} | {item['path'] for item in records}:
                raise ValueError('Manifest does not match archive')
            for item in records:
                name = item['path']
                if not allowed(name):
                    raise ValueError('Unexpected file in backup: ' + name)
                entry = bundle.getinfo(name)
                if stat.S_ISLNK(entry.external_attr >> 16) or entry.file_size != item['size']:
                    raise ValueError('Invalid file metadata')
                dest = (staging / name).resolve()
                if not dest.is_relative_to(staging):
                    raise ValueError('Unsafe file path')
                dest.parent.mkdir(parents=True, exist_ok=True)
                with bundle.open(entry) as stream, dest.open('wb') as output:
                    shutil.copyfileobj(stream, output, length=1024 * 1024)
                with dest.open('rb') as stream:
                    if digest(stream) != item['sha256']:
                        raise ValueError('Checksum mismatch: ' + name)
        staging.rename(target)
    finally:
        if staging.exists() and staging.parent == target.parent and staging.name.startswith('.draft-coach-restore-'):
            shutil.rmtree(staging)


if __name__ == '__main__':
    if len(sys.argv) != 4 or sys.argv[1] not in {'create', 'restore'}:
        raise SystemExit('Usage: python backup-files.py create SNAPSHOT_DIR OUTPUT.zip | restore BACKUP.zip NEW_DIR')
    try:
        (create if sys.argv[1] == 'create' else restore)(sys.argv[2], sys.argv[3])
    except Exception as error:
        raise SystemExit(str(error))
