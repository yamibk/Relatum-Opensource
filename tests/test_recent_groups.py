import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import app as target


class RecentGroupsTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.data_dir = self.root / "data"
        self.canvases_dir = self.root / "canvases"
        self.data_dir.mkdir()
        self.canvases_dir.mkdir()
        self.recent_file = self.data_dir / "recent.json"
        self.backup_file = self.data_dir / "recent.backup.json"
        self.patchers = [
            mock.patch.object(target, "DATA", self.data_dir),
            mock.patch.object(target, "CANVASES", self.canvases_dir),
            mock.patch.object(target, "RECENT_FILE", self.recent_file),
            mock.patch.object(target, "RECENT_BACKUP_FILE", self.backup_file),
        ]
        for patcher in self.patchers:
            patcher.start()

    def tearDown(self):
        for patcher in reversed(self.patchers):
            patcher.stop()
        self.temp_dir.cleanup()

    def write_recent(self, payload):
        self.recent_file.write_text(
            json.dumps(payload, ensure_ascii=False), encoding="utf-8",
        )

    def test_v2_migrates_to_v3_with_stable_ids_and_independent_ranks(self):
        first = str(self.canvases_dir / "第一张.canvas")
        second = str(self.canvases_dir / "第二张.canvas")
        self.write_recent({
            "version": 2,
            "groups": [{"id": "g_work", "name": "工作"}],
            "files": [
                {
                    "path": first,
                    "title": "第一张",
                    "lastOpenedAt": "2026-07-18T10:00:00",
                    "group": "g_work",
                    "favorite": True,
                },
                {
                    "path": second,
                    "title": "第二张",
                    "lastOpenedAt": "2026-07-18T11:00:00",
                },
            ],
        })

        migrated = target.load_recent()
        first_id = migrated["files"][0]["id"]

        self.assertEqual(migrated["version"], 3)
        self.assertEqual(migrated["files"][0]["groupId"], "g_work")
        self.assertIn("groupRank", migrated["files"][0])
        self.assertIn("favoriteRank", migrated["files"][0])
        self.assertEqual(migrated["files"][1]["groupId"], "")
        self.assertTrue(first_id.startswith("cf_"))
        self.assertEqual(target.load_recent()["files"][0]["id"], first_id)
        self.assertTrue(self.backup_file.is_file())

    def test_group_and_favorite_reorders_do_not_overwrite_each_other(self):
        paths = [str(self.canvases_dir / f"{name}.canvas") for name in ("a", "b")]
        self.write_recent({
            "version": 3,
            "groups": [{"id": "g1", "name": "研究"}],
            "files": [
                {
                    "id": "cf_a", "path": paths[0], "title": "a",
                    "lastOpenedAt": "2026-07-18T10:00:00", "groupId": "g1",
                    "groupRank": 0, "favorite": True, "favoriteRank": 1024,
                },
                {
                    "id": "cf_b", "path": paths[1], "title": "b",
                    "lastOpenedAt": "2026-07-18T11:00:00", "groupId": "g1",
                    "groupRank": 1024, "favorite": True, "favoriteRank": 0,
                },
            ],
        })

        target.reorder_files(list(reversed(paths)), "g1")
        after_group = {item["id"]: item for item in target.load_recent()["files"]}
        self.assertLess(after_group["cf_b"]["groupRank"], after_group["cf_a"]["groupRank"])
        self.assertEqual(after_group["cf_a"]["favoriteRank"], 1024)
        self.assertEqual(after_group["cf_b"]["favoriteRank"], 0)

        target.reorder_files(paths, "__favorites__")
        after_favorite = {item["id"]: item for item in target.load_recent()["files"]}
        self.assertLess(
            after_favorite["cf_a"]["favoriteRank"],
            after_favorite["cf_b"]["favoriteRank"],
        )
        self.assertEqual(
            after_favorite["cf_b"]["groupRank"],
            after_group["cf_b"]["groupRank"],
        )

    def test_reserved_group_id_is_remapped_without_orphaning_files(self):
        path = str(self.canvases_dir / "保留分组.canvas")
        self.write_recent({
            "version": 2,
            "groups": [{"id": "__favorites__", "name": "收藏\u202e组"}],
            "files": [{
                "path": path, "title": "保留分组",
                "lastOpenedAt": "2026-07-18T10:00:00",
                "group": "__favorites__",
            }],
        })

        migrated = target.load_recent()

        new_id = migrated["groups"][0]["id"]
        self.assertTrue(new_id.startswith("g_"))
        self.assertNotEqual(new_id, "__favorites__")
        self.assertEqual(migrated["files"][0]["groupId"], new_id)
        self.assertEqual(migrated["groups"][0]["name"], "收藏组")

    def test_deleting_group_moves_files_to_inbox_without_losing_favorite(self):
        path = str(self.canvases_dir / "保留.canvas")
        self.write_recent({
            "version": 3,
            "groups": [{"id": "g1", "name": "稍后"}],
            "files": [{
                "id": "cf_keep", "path": path, "title": "保留",
                "lastOpenedAt": "2026-07-18T10:00:00", "groupId": "g1",
                "groupRank": 0, "favorite": True, "favoriteRank": 0,
            }],
        })

        target.group_delete("g1")
        result = target.load_recent()

        self.assertEqual(result["groups"], [])
        self.assertEqual(result["files"][0]["groupId"], "")
        self.assertTrue(result["files"][0]["favorite"])

    def test_favorite_set_is_idempotent(self):
        path = str(self.canvases_dir / "收藏.canvas")
        self.write_recent({
            "version": 3,
            "groups": [],
            "files": [{
                "id": "cf_fav", "path": path, "title": "收藏",
                "lastOpenedAt": "2026-07-18T10:00:00", "groupId": "",
                "groupRank": 0,
            }],
        })

        target.file_set_favorite(path, True)
        first = target.load_recent()["files"][0]
        first_rank = first["favoriteRank"]
        target.file_set_favorite(path, True)
        second = target.load_recent()["files"][0]

        self.assertTrue(second["favorite"])
        self.assertEqual(second["favoriteRank"], first_rank)

    def test_reopening_file_preserves_group_and_manual_ranks(self):
        path = self.canvases_dir / "重开.canvas"
        path.write_text('{"nodes":[]}', encoding="utf-8")
        self.write_recent({
            "version": 3,
            "groups": [{"id": "g1", "name": "长期"}],
            "files": [{
                "id": "cf_reopen", "path": str(path), "title": "旧标题",
                "lastOpenedAt": "2026-07-18T10:00:00", "groupId": "g1",
                "groupRank": 4096, "favorite": True, "favoriteRank": 2048,
            }],
        })

        target.register_recent(path, "新标题")
        reopened = target.load_recent()["files"][0]

        self.assertEqual(reopened["id"], "cf_reopen")
        self.assertEqual(reopened["title"], "新标题")
        self.assertEqual(reopened["groupId"], "g1")
        self.assertEqual(reopened["groupRank"], 4096)
        self.assertEqual(reopened["favoriteRank"], 2048)
        self.assertIn(".", reopened["lastOpenedAt"])

    def test_corrupt_primary_recovers_backup_and_preserves_corrupt_copy(self):
        path = str(self.canvases_dir / "恢复.canvas")
        original = {
            "version": 3,
            "groups": [],
            "files": [{
                "id": "cf_restore", "path": path, "title": "恢复",
                "lastOpenedAt": "2026-07-18T10:00:00", "groupId": "",
                "groupRank": 0,
            }],
        }
        target.save_recent(original)
        changed = target.load_recent()
        changed["files"][0]["title"] = "新标题"
        target.save_recent(changed)
        self.recent_file.write_text("{not json", encoding="utf-8")

        recovered = target.load_recent()

        self.assertEqual(recovered["files"][0]["title"], "恢复")
        self.assertTrue(list(self.data_dir.glob("recent.corrupt-*.json")))
        self.assertEqual(json.loads(self.recent_file.read_text(encoding="utf-8"))["version"], 3)

    def test_file_stats_only_accept_registered_paths(self):
        tracked = self.canvases_dir / "已登记.canvas"
        untracked = self.canvases_dir / "未登记.canvas"
        tracked.write_text('{"nodes":[{},{}]}', encoding="utf-8")
        untracked.write_text('{"nodes":[{}]}', encoding="utf-8")
        self.write_recent({
            "version": 3,
            "groups": [],
            "files": [{
                "id": "cf_stats", "path": str(tracked), "title": "已登记",
                "lastOpenedAt": "2026-07-18T10:00:00", "groupId": "",
                "groupRank": 0,
            }],
        })

        result = target.recent_file_stats([str(tracked), str(untracked)])

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["nodeCount"], 2)
        self.assertTrue(result[0]["exists"])


if __name__ == "__main__":
    unittest.main()
