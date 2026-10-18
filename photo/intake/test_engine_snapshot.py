import importlib
from pathlib import Path
import sys
import tempfile
import unittest
from engine_snapshot import EngineSnapshot

class EngineSnapshotTests(unittest.TestCase):
    def test_imports_and_ui_survive_concurrent_source_edit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'ui').mkdir()
            source=root/'sonify_snapshot_fixture.py'
            source.write_text('VALUE="before"\nASSET=__file__',encoding='utf-8')
            (root/'ui'/'studio.js').write_text('before',encoding='utf-8')
            snapshot=EngineSnapshot(root).install()
            source.write_text('raise RuntimeError("concurrent edit")',encoding='utf-8')
            (root/'ui'/'studio.js').write_text('after',encoding='utf-8')
            try:
                module=importlib.import_module('sonify_snapshot_fixture')
                self.assertEqual(module.VALUE,'before')
                self.assertEqual(module.ASSET,str(source))
                self.assertEqual(snapshot.content['ui/studio.js'],b'before')
            finally:
                sys.meta_path.remove(snapshot)
                sys.modules.pop('sonify_snapshot_fixture',None)
