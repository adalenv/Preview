/**
 * App state, routing (query params), and wiring.
 */

import * as api from './api.js';
import { rewriteHtml } from './rewrite.js';
import * as ui from './ui.js';

/** @type {Map<string, { default_branch: string }>} repo info cache */
const repoCache = new Map();
/** @type {Map<string, Array<{ name: string, path: string, type: string, download_url: string|null }>>} */
const listCache = new Map();
/** @type {Map<string, string>} file content cache (raw text) */
const fileCache = new Map();

function cacheKey(owner, repo, path, ref) {
  return `${owner}/${repo}:${ref}:${path || ''}`;
}

let state = {
  owner: '',
  repo: '',
  ref: '',
  path: '',
  previewPath: '',
  listing: [],
  fileDates: {}, // path -> formatted date string (last commit per file/dir)
  loaded: false,
};

function buildShareUrl() {
  const params = new URLSearchParams();
  if (state.owner && state.repo) params.set('repo', `${state.owner}/${state.repo}`);
  if (state.ref) params.set('ref', state.ref);
  if (state.path) params.set('path', state.path);
  const u = new URL(window.location.href);
  u.search = params.toString();
  return u.href;
}

function applyStateToUrl() {
  const url = new URL(window.location.href);
  if (state.owner && state.repo) url.searchParams.set('repo', `${state.owner}/${state.repo}`);
  else url.searchParams.delete('repo');
  if (state.ref) url.searchParams.set('ref', state.ref);
  else url.searchParams.delete('ref');
  if (state.path) url.searchParams.set('path', state.path);
  else url.searchParams.delete('path');
  window.history.replaceState(null, '', url);
}

function parseQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const repo = params.get('repo') || '';
  const ref = params.get('ref') || '';
  const path = params.get('path') || '';
  let owner = '';
  let repoName = '';
  if (repo) {
    const parts = repo.split('/').filter(Boolean);
    if (parts.length >= 2) {
      owner = parts[0];
      repoName = parts.slice(1).join('/');
    } else if (parts.length === 1) {
      owner = parts[0];
      repoName = '';
    }
  }
  return { owner, repo: repoName, ref, path };
}

function loadRepoInfo(owner, repo) {
  const key = `${owner}/${repo}`;
  if (repoCache.has(key)) return Promise.resolve(repoCache.get(key));
  return api.getRepoInfo(owner, repo).then((info) => {
    repoCache.set(key, info);
    return info;
  });
}

function loadListing(owner, repo, path, ref) {
  const key = cacheKey(owner, repo, path, ref);
  if (listCache.has(key)) return Promise.resolve(listCache.get(key));
  return api.listContents(owner, repo, path, ref).then((items) => {
    listCache.set(key, items);
    return items;
  });
}

function loadFileContent(owner, repo, path, ref) {
  const key = cacheKey(owner, repo, path, ref);
  if (fileCache.has(key)) return Promise.resolve(fileCache.get(key));
  return api.getFileContent(owner, repo, path, ref).then(({ text }) => {
    fileCache.set(key, text);
    return text;
  });
}

async function doLoadRepo() {
  const input = ui.getRepoInput();
  const branchInput = ui.getBranchInput();
  const parts = input.split('/').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) {
    ui.showError('Enter owner/repo (e.g. adalenv/some-repo)');
    return;
  }
  const owner = parts[0];
  const repo = parts.slice(1).join('/');
  ui.clearError();
  ui.showLoading(true);
  try {
    const info = await loadRepoInfo(owner, repo);
    const ref = branchInput || info.default_branch;
    state = {
      owner,
      repo,
      ref,
      path: '',
      listing: [],
      loaded: true,
    };
    ui.setBranchInput(ref);
    ui.setRepoInput(`${owner}/${repo}`);
    applyStateToUrl();
    await openPath('');
  } finally {
    ui.showLoading(false);
  }
}

async function openPath(path) {
  if (!state.loaded || !state.owner || !state.repo) return;
  state.path = path;
  applyStateToUrl();
  ui.renderBreadcrumb(path ? path.split('/') : [], (p) => openPath(p));
  ui.showLoading(true);
  ui.clearError();
  try {
    const items = await loadListing(state.owner, state.repo, path, state.ref);
    state.listing = items;
    const dateEntries = await Promise.all(
      items.map(async (item) => [item.path, await api.getLatestCommitDate(state.owner, state.repo, item.path, state.ref)])
    );
    state.fileDates = Object.fromEntries(dateEntries);
    ui.renderFileList(items, ui.elements.fileFilter().value, (p, type) => onSelect(p, type), getFileActions());
  } catch (e) {
    ui.showError(e.message || 'Failed to load');
    state.fileDates = {};
    ui.renderFileList([], '', () => {}, {});
  } finally {
    ui.showLoading(false);
  }
}

function getFileActions() {
  return {
    selectedPath: state.previewPath,
    fileDates: state.fileDates,
    onOpen: openPreviewInNewTab,
  };
}

async function onSelect(itemPath, type) {
  if (type === 'dir') {
    await openPath(itemPath);
    return;
  }
  const name = itemPath.split('/').pop() || '';
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext !== 'html' && ext !== 'htm') {
    ui.showError('Only .html / .htm files can be previewed.');
    return;
  }
  ui.clearError();
  state.previewPath = itemPath;
  ui.renderFileList(state.listing, ui.elements.fileFilter().value, (p, type) => onSelect(p, type), getFileActions());
}

async function openPreviewInNewTab() {
  if (!state.previewPath || !state.owner || !state.repo) return;
  try {
    const raw = await api.getFileContent(state.owner, state.repo, state.previewPath, state.ref);
    const baseRawDirUrl = raw.rawUrl.replace(/\/[^/]+$/, '');
    const rewritten = rewriteHtml(raw.text, baseRawDirUrl);
    const blob = new Blob([rewritten], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    ui.showError(e.message || 'Failed to open in new tab');
  }
}

async function initFromUrl() {
  const { owner, repo, ref, path } = parseQueryParams();
  if (!owner || !repo) return;
  ui.setRepoInput(`${owner}/${repo}`);
  ui.setBranchInput(ref);
  try {
    await doLoadRepo();
    if (path && (path.endsWith('.html') || path.endsWith('.htm'))) {
      const dirPath = path.includes('/') ? path.replace(/\/[^/]+$/, '') : '';
      await openPath(dirPath);
      await onSelect(path, 'file');
    } else if (path) {
      await openPath(path);
    }
  } catch (_) {
    // doLoadRepo already shows error
  }
}

function init() {
  const stored = localStorage.getItem('preview-gh-token');
  if (stored) api.setToken(stored);
  ui.setTokenInSettings(api.getToken() || '');

  ui.bindLoadRepo(doLoadRepo);
  ui.bindRepoInputDebounce(300, async (value) => {
    const parts = value.split('/').map((s) => s.trim()).filter(Boolean);
    const owner = parts[0] || '';
    const repoFilter = parts.length > 1 ? parts.slice(1).join('/') : '';
    if (!owner || owner.length < 1) {
      ui.showRepoDropdown(false);
      return;
    }
    try {
      ui.setRepoDropdownLoading(true);
      const repos = await api.listUserRepos(owner);
      ui.renderRepoDropdown(repos, owner, (fullName) => {
        ui.setRepoInput(fullName);
        ui.showRepoDropdown(false);
        const parts = fullName.split('/');
        if (parts.length >= 2) {
          const o = parts[0];
          const r = parts.slice(1).join('/');
          loadRepoInfo(o, r).then((info) => ui.setBranchInput(info.default_branch)).catch(() => {});
        }
      }, repoFilter);
    } catch (e) {
      ui.renderRepoDropdown([], owner, () => {}, '');
      ui.elements.repoDropdown().innerHTML = '<li class="repo-dropdown-loading">' + (e.message || 'Failed to load') + '</li>';
      ui.showRepoDropdown(true);
    }
  });
  ui.bindSettingsOpen(() => ui.showSettingsModal(true));
  ui.bindSettingsDismiss(() => ui.showSettingsModal(false));
  ui.bindSaveToken(() => {
    const t = ui.getTokenFromSettings();
    localStorage.setItem('preview-gh-token', t || '');
    api.setToken(t);
    ui.showSettingsModal(false);
  });
  ui.bindFilterInput((value) => {
    ui.renderFileList(state.listing, value, (p, type) => onSelect(p, type), getFileActions());
  });

  if (parseQueryParams().repo) {
    initFromUrl();
  }

  window.addEventListener('popstate', () => {
    const { owner, repo, ref, path } = parseQueryParams();
    if (!owner || !repo) return;
    state.owner = owner;
    state.repo = repo;
    state.ref = ref;
    state.path = path || '';
    state.loaded = true;
    openPath(state.path);
  });
}

init();
