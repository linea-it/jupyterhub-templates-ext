# Templates menu - server extension (no jupyterlab_templates)

def _jupyter_server_extension_points():
    return [{"module": "templates_menu"}]


def _load_jupyter_server_extension(serverapp):
    from jupyter_server.utils import url_path_join
    from .handlers import TemplatesListHandler, TemplatesCreateHandler
    web_app = serverapp.web_app
    base_url = web_app.settings.setdefault("base_url", "/")
    handlers = [
        (url_path_join(base_url, "templates-menu", "templates"), TemplatesListHandler),
        (url_path_join(base_url, "templates-menu", "create"), TemplatesCreateHandler),
    ]
    web_app.add_handlers(".*$", handlers)
