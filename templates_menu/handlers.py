"""
Templates menu API: list templates and create notebook from template.
Served under /templates-menu/ (see __init__.py for mount).
"""
import json
import os
import shutil
from tornado import web

from jupyter_server.base.handlers import APIHandler

# Default directory with .ipynb templates (overridable via env)
TEMPLATES_DIR = os.environ.get("JUPYTER_TEMPLATES_DIR", "/opt/notebook-templates")


def _list_templates():
    """Return list of {id, label} for each .ipynb under TEMPLATES_DIR."""
    out = []
    if not os.path.isdir(TEMPLATES_DIR):
        return out
    for root, _dirs, files in os.walk(TEMPLATES_DIR):
        for f in files:
            if f.endswith(".ipynb"):
                rel = os.path.relpath(os.path.join(root, f), TEMPLATES_DIR)
                id_ = rel.replace(os.sep, "/")
                label = os.path.splitext(os.path.basename(f))[0].replace("_", " ").replace("-", " ").title()
                out.append({"id": id_, "label": label})
    return sorted(out, key=lambda x: x["label"])


class TemplatesListHandler(APIHandler):
    """GET /templates-menu/templates -> list of {id, label}."""

    @web.authenticated
    def get(self):
        self.finish(json.dumps(_list_templates()))


class TemplatesCreateHandler(APIHandler):
    """POST /templates-menu/create with JSON {template_id} -> copy to cwd and return path."""

    @web.authenticated
    def post(self):
        try:
            body = json.loads(self.request.body or "{}")
            template_id = body.get("template_id")
            if not template_id or ".." in template_id:
                self.set_status(400)
                self.finish(json.dumps({"error": "invalid template_id"}))
                return
            src = os.path.join(TEMPLATES_DIR, template_id)
            if not os.path.isfile(src):
                self.set_status(404)
                self.finish(json.dumps({"error": "template not found"}))
                return
            root_dir = getattr(
                getattr(self, "contents_manager", None), "root_dir", None
            ) or self.settings.get("server_root_dir") or os.path.expanduser("~")
            cwd_arg = self.get_query_argument("cwd", "").strip().lstrip("/") or "."
            cwd = os.path.normpath(os.path.join(root_dir, cwd_arg))
            if not os.path.isdir(cwd):
                cwd = root_dir
            dest_name = os.path.basename(template_id)
            dest = os.path.join(cwd, dest_name)
            base, ext = os.path.splitext(dest_name)
            n = 0
            while os.path.isfile(dest):
                n += 1
                dest = os.path.join(cwd, f"{base}_{n}{ext}")
            shutil.copy2(src, dest)
            rel_path = os.path.relpath(dest, cwd).replace(os.sep, "/")
            self.finish(json.dumps({"path": rel_path, "full_path": dest}))
        except Exception as e:
            self.set_status(500)
            self.finish(json.dumps({"error": str(e)}))
