/**
 * Tutorials menu: submenus por pasta; cada item cria e abre o notebook.
 * O notebook é criado na pasta atualmente aberta no navegador de ficheiros (se disponível).
 * API: /templates-menu/templates e /templates-menu/create.
 */

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { IFileBrowserFactory } from '@jupyterlab/filebrowser';
import { IMainMenu } from '@jupyterlab/mainmenu';
import { PageConfig } from '@jupyterlab/coreutils';
import { Menu } from '@lumino/widgets';

const CMD_CREATE_FROM = 'templates-menu:create-from';

interface TemplateItem {
  id: string;
  label: string;
}

function getBaseUrl(): string {
  return PageConfig.getBaseUrl().replace(/\/?$/, '/');
}

/** Lê o cookie _xsrf para enviar no POST (evita 403 por XSRF no Jupyter Server). */
function getXsrfToken(): string {
  const match = document.cookie.match(/\b_xsrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function fetchTemplates(): Promise<TemplateItem[]> {
  const base = getBaseUrl();
  const url = `${base}templates-menu/templates`;
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Failed to list templates: ${res.status}`);
  return res.json();
}

async function createFromTemplate(
  templateId: string,
  cwd: string
): Promise<{ path: string }> {
  const base = getBaseUrl();
  const token = PageConfig.getOption('token') || '';
  const url = `${base}templates-menu/create?cwd=${encodeURIComponent(cwd)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const xsrf = getXsrfToken();
  if (xsrf) headers['X-XSRFToken'] = xsrf;
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify({ template_id: templateId })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Create failed: ${res.status}`);
  }
  return res.json();
}

/** Agrupa templates por pasta (primeiro segmento do id). "" = raiz. */
function groupByFolder(templates: TemplateItem[]): Map<string, TemplateItem[]> {
  const map = new Map<string, TemplateItem[]>();
  for (const t of templates) {
    const i = t.id.indexOf('/');
    const folder = i >= 0 ? t.id.slice(0, i) : '';
    if (!map.has(folder)) map.set(folder, []);
    map.get(folder)!.push(t);
  }
  return map;
}

/** Formata nome da pasta para label do submenu (ex: "data-analysis" -> "Data analysis"). */
function folderLabel(folder: string): string {
  if (!folder) return '';
  return folder
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** Obtém o diretório atual do navegador de ficheiros (pasta aberta à esquerda), ou '' para a raiz. */
function getFileBrowserCwd(fileBrowserFactory: IFileBrowserFactory | null): string {
  if (!fileBrowserFactory?.tracker?.currentWidget?.model) return '';
  const path = fileBrowserFactory.tracker.currentWidget.model.path;
  return typeof path === 'string' ? path : '';
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'linea-tutorials-menu:plugin',
  description: 'Menu "Tutorials" com submenus por pasta; cada item cria e abre o notebook.',
  autoStart: true,
  optional: [IMainMenu, ICommandPalette, IFileBrowserFactory],
  activate: (
    app: JupyterFrontEnd,
    mainMenu: IMainMenu | null,
    palette: ICommandPalette | null,
    fileBrowserFactory: IFileBrowserFactory | null
  ) => {
    const { commands } = app;

    commands.addCommand(CMD_CREATE_FROM, {
      label: (args: { template_label?: string }) =>
        args.template_label ?? 'Novo a partir de tutorial',
      execute: async (args: { template_id?: string }) => {
        const templateId = args.template_id;
        if (!templateId) return;
        try {
          const cwd = getFileBrowserCwd(fileBrowserFactory);
          const { path } = await createFromTemplate(templateId, cwd);
          const pathToOpen = cwd ? `${cwd.replace(/\/$/, '')}/${path}` : path;
          await app.commands.execute('docmanager:open', {
            path: pathToOpen.startsWith('/') ? pathToOpen.slice(1) : pathToOpen
          });
        } catch (e) {
          console.error('Tutorials menu create:', e);
          alert(`Erro ao criar notebook: ${(e as Error).message}`);
        }
      }
    });

    if (palette) {
      palette.addItem({ command: CMD_CREATE_FROM, category: 'Tutorials' });
    }

    if (mainMenu) {
      const topMenu = new Menu({ commands });
      topMenu.title.label = 'Tutorials';
      topMenu.id = 'jp-mainmenu-tutorials-menu';

      // Menu sempre visível; itens preenchidos quando a API responder (lista vazia ou erro = menu sem itens)
      mainMenu.addMenu(topMenu, true, { rank: 80 });

      void fetchTemplates().then(
        templates => {
          if (templates.length === 0) return;
          const byFolder = groupByFolder(templates);
          const folders = Array.from(byFolder.keys()).sort((a, b) => {
            if (!a) return 1;
            if (!b) return -1;
            return a.localeCompare(b);
          });
          for (const folder of folders) {
            const items = byFolder.get(folder)!;
            if (!folder) {
              // Templates na raiz: itens directamente no menu "Templates" (sem submenu "Geral")
              for (const t of items) {
                topMenu.addItem({
                  command: CMD_CREATE_FROM,
                  args: { template_id: t.id, template_label: t.label }
                });
              }
            } else {
              const submenu = new Menu({ commands });
              submenu.title.label = folderLabel(folder);
              for (const t of items) {
                submenu.addItem({
                  command: CMD_CREATE_FROM,
                  args: { template_id: t.id, template_label: t.label }
                });
              }
              topMenu.addItem({ type: 'submenu', submenu });
            }
          }
        },
        e => console.error('Templates menu: failed to load templates', e)
      );
    }
  }
};

export default plugin;
