/**
 * UI: file list, breadcrumb, preview iframe, toolbar, settings modal, loading/error states.
 */

const el = (id) => document.getElementById(id);

export const elements = {
  repoInput: () => el('repo-input'),
  repoDropdown: () => el('repo-dropdown'),
  branchInput: () => el('branch-input'),
  btnLoad: () => el('btn-load'),
  btnSettings: () => el('btn-settings'),
  breadcrumb: () => el('breadcrumb'),
  fileFilter: () => el('file-filter'),
  fileList: () => el('file-list'),
  loading: () => el('loading'),
  errorMessage: () => el('error-message'),
  settingsModal: () => el('settings-modal'),
  tokenInput: () => el('token-input'),
  btnSaveToken: () => el('btn-save-token'),
};

export function showLoading(show) {
  elements.loading().classList.toggle('hidden', !show);
}

export function showError(msg) {
  const node = elements.errorMessage();
  node.textContent = msg || '';
  node.classList.toggle('hidden', !msg);
}

export function clearError() {
  showError('');
}

export function renderBreadcrumb(segments, onSegmentClick) {
  const node = elements.breadcrumb();
  node.innerHTML = '';
  const root = document.createElement('span');
  root.textContent = 'root';
  root.className = 'breadcrumb-item';
  root.dataset.path = '';
  root.addEventListener('click', () => onSegmentClick(''));
  node.appendChild(root);
  for (let i = 0; i < segments.length; i++) {
    const span = document.createElement('span');
    span.className = 'breadcrumb-sep';
    span.textContent = ' / ';
    node.appendChild(span);
    const part = document.createElement('span');
    part.className = 'breadcrumb-item';
    part.textContent = segments[i];
    const path = segments.slice(0, i + 1).join('/');
    part.dataset.path = path;
    part.addEventListener('click', () => onSegmentClick(path));
    node.appendChild(part);
  }
}

function iconFor(type, name) {
  if (type === 'dir') return '📁';
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['html', 'htm'].includes(ext)) return '📄';
  return '📃';
}

function isHtmlFile(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return ext === 'html' || ext === 'htm';
}

/**
 * @param {Array<{ name: string, path: string, type: 'file'|'dir' }>} items
 * @param {string} filter - filter by name
 * @param {(path: string, type: string) => void} onSelect
 * @param {{ selectedPath?: string, rawUrl?: string, githubUrl?: string, onOpenNewTab?: () => void, onCopyLink?: () => void }} [fileActions]
 */
export function renderFileList(items, filter, onSelect, fileActions = {}) {
  const list = elements.fileList();
  list.innerHTML = '';
  const q = (filter || '').toLowerCase().trim();
  const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  const dirs = filtered.filter((i) => i.type === 'dir').sort((a, b) => a.name.localeCompare(b.name));
  const files = filtered.filter((i) => i.type === 'file').sort((a, b) => a.name.localeCompare(b.name));
  const { selectedPath, rawUrl, githubUrl, onOpenNewTab, onCopyLink } = fileActions;
  for (const item of [...dirs, ...files]) {
    const li = document.createElement('li');
    li.className = `file-item file-item--${item.type}`;
    const icon = document.createElement('span');
    icon.className = 'file-icon';
    icon.textContent = iconFor(item.type, item.name);
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = item.name;
    li.appendChild(icon);
    const nameCell = document.createElement('span');
    nameCell.className = 'file-item-name-cell';
    nameCell.appendChild(name);
    const isSelectedHtml = item.type === 'file' && isHtmlFile(item.name) && item.path === selectedPath;
    if (isSelectedHtml) li.classList.add('file-item--selected');
    if (isSelectedHtml && (rawUrl || onOpenNewTab || githubUrl || onCopyLink)) {
      const actions = document.createElement('span');
      actions.className = 'file-row-actions';
      if (rawUrl) {
        const a = document.createElement('a');
        a.href = rawUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'Open Raw';
        a.addEventListener('click', (e) => e.stopPropagation());
        actions.appendChild(a);
      }
      if (onOpenNewTab) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'New tab';
        btn.addEventListener('click', (e) => { e.stopPropagation(); onOpenNewTab(); });
        actions.appendChild(btn);
      }
      if (githubUrl) {
        const a = document.createElement('a');
        a.href = githubUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'GitHub';
        a.addEventListener('click', (e) => e.stopPropagation());
        actions.appendChild(a);
      }
      if (onCopyLink) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Copy link';
        btn.addEventListener('click', (e) => { e.stopPropagation(); onCopyLink(); });
        actions.appendChild(btn);
      }
      nameCell.appendChild(actions);
    }
    li.appendChild(nameCell);
    li.addEventListener('click', () => onSelect(item.path, item.type));
    list.appendChild(li);
  }
}

export function showSettingsModal(show) {
  elements.settingsModal().classList.toggle('hidden', !show);
}

export function getTokenFromSettings() {
  return (elements.tokenInput().value || '').trim();
}

export function setTokenInSettings(value) {
  elements.tokenInput().value = value || '';
}

export function bindSettingsDismiss(callback) {
  elements.settingsModal().querySelectorAll('[data-dismiss="modal"]').forEach((node) => {
    node.addEventListener('click', callback);
  });
}

export function bindSaveToken(callback) {
  elements.btnSaveToken().addEventListener('click', callback);
}

export function showRepoDropdown(visible) {
  elements.repoDropdown().classList.toggle('hidden', !visible);
}

export function setRepoDropdownLoading(loading) {
  const node = elements.repoDropdown();
  node.classList.remove('hidden');
  if (loading) {
    node.innerHTML = '<li class="repo-dropdown-loading">Loading repos…</li>';
    return;
  }
  node.innerHTML = '';
}

/**
 * @param {Array<{ name: string, full_name: string }>} repos
 * @param {string} owner
 * @param {(fullName: string) => void} onSelect
 * @param {string} [filter] - filter repo names by this string
 */
export function renderRepoDropdown(repos, owner, onSelect, filter) {
  const node = elements.repoDropdown();
  node.innerHTML = '';
  const q = (filter || '').toLowerCase();
  const list = q ? repos.filter((r) => r.name.toLowerCase().includes(q)) : repos;
  if (list.length === 0) {
    node.innerHTML = '<li class="repo-dropdown-loading">No repos found</li>';
    node.classList.remove('hidden');
    return;
  }
  for (const r of list.slice(0, 50)) {
    const li = document.createElement('li');
    li.textContent = r.name;
    li.dataset.fullName = r.full_name;
    li.addEventListener('click', (e) => {
      e.preventDefault();
      onSelect(r.full_name);
    });
    node.appendChild(li);
  }
  node.classList.remove('hidden');
}

export function bindLoadRepo(callback) {
  elements.btnLoad().addEventListener('click', () => callback());
  elements.repoInput().addEventListener('keydown', (e) => {
    if (e.key === 'Enter') callback();
  });
}

/**
 * Debounced input callback for repo field. Calls fn(value) after ms delay.
 * @param {number} ms
 * @param {(value: string) => void} fn
 */
export function bindRepoInputDebounce(ms, fn) {
  let timer = 0;
  elements.repoInput().addEventListener('input', () => {
    clearTimeout(timer);
    const value = (elements.repoInput().value || '').trim();
    if (!value) {
      showRepoDropdown(false);
      return;
    }
    timer = setTimeout(() => fn(value), ms);
  });
  elements.repoInput().addEventListener('focus', () => {
    const value = (elements.repoInput().value || '').trim();
    if (value && !value.includes('/')) fn(value);
  });
  elements.repoInput().addEventListener('blur', () => {
    setTimeout(() => showRepoDropdown(false), 200);
  });
}

export function bindSettingsOpen(callback) {
  elements.btnSettings().addEventListener('click', callback);
}

export function bindFilterInput(callback) {
  elements.fileFilter().addEventListener('input', () => callback(elements.fileFilter().value));
}

export function getRepoInput() {
  return (elements.repoInput().value || '').trim();
}

export function getBranchInput() {
  return (elements.branchInput().value || '').trim();
}

export function setRepoInput(value) {
  elements.repoInput().value = value || '';
}

export function setBranchInput(value) {
  elements.branchInput().value = value || '';
}

export function copyShareLinkToClipboard(url) {
  return navigator.clipboard.writeText(url).then(() => true).catch(() => false);
}

export function toggleSidebarCollapsed() {
  document.body.classList.toggle('sidebar-collapsed');
}
