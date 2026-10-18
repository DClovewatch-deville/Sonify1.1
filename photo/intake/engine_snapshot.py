"""Import Photo modules from immutable source bytes, preserving original asset paths."""
import hashlib
import importlib.abc
import importlib.util
import sys
from pathlib import Path

class EngineSnapshot(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    def __init__(self, root):
        self.root = Path(root)
        for _ in range(3):
            files = sorted(self.root.glob('*.py')) + sorted((self.root / 'ui').glob('*'))
            self.content = {p.relative_to(self.root).as_posix(): p.read_bytes() for p in files if p.is_file()}
            if all((self.root / name).read_bytes() == content for name, content in self.content.items()):
                break
        else:
            raise RuntimeError('主线正在保存，请稍后重试。')
        self.hashes = {name: hashlib.sha256(content).hexdigest() for name, content in self.content.items()}

    def install(self):
        sys.meta_path.insert(0, self)
        return self

    def find_spec(self, fullname, path=None, target=None):
        if '.' not in fullname and fullname + '.py' in self.content:
            return importlib.util.spec_from_loader(fullname, self, origin=str(self.root / (fullname + '.py')))

    def create_module(self, spec):
        return None

    def exec_module(self, module):
        filename = str(self.root / (module.__name__ + '.py'))
        module.__file__ = filename
        exec(compile(self.content[module.__name__ + '.py'], filename, 'exec'), module.__dict__)

