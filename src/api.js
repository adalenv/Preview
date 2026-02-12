/**
 * GitHub REST API client. Unauthenticated by default; optional token from localStorage.
 */

const API_BASE = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com';

/** @type {string|null} */
let token = null;
/** @type {string|null} cached login when token is set */
let currentUserLogin = null;

/**
 * Load token from localStorage (set by settings).
 */
export function setToken(t) {
  token = t || null;
  currentUserLogin = null;
}

export function getToken() {
  return token;
}

/**
 * Get authenticated user login (when token is set). Cached.
 * @returns {Promise<string|null>}
 */
export async function getCurrentUserLogin() {
  if (!token) return null;
  if (currentUserLogin !== null) return currentUserLogin;
  const res = await fetch(`${API_BASE}/user`, { headers: headers() });
  if (!res.ok) return null;
  const data = await res.json();
  currentUserLogin = data.login || null;
  return currentUserLogin;
}

/**
 * List repos for a user or org. With token: for the authenticated user use /user/repos (includes private);
 * for others use /users/:username/repos (public only). For orgs use /orgs/:org/repos (with token includes private access).
 * @param {string} username - GitHub username or org name
 * @returns {Promise<Array<{ name: string, full_name: string }>>}
 */
export async function listUserRepos(username) {
  const login = (username || '').trim().toLowerCase();
  if (!login) return [];

  const currentUser = await getCurrentUserLogin();
  if (token && currentUser && currentUser.toLowerCase() === login) {
    const url = `${API_BASE}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`;
    const res = await fetch(url, { headers: headers() });
    await checkResponse(res, url);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Expected repo list');
    return data.map((r) => ({ name: r.name, full_name: r.full_name }));
  }

  let url = `${API_BASE}/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`;
  let res = await fetch(url, { headers: headers() });
  if (res.status === 404) {
    url = `${API_BASE}/orgs/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`;
    res = await fetch(url, { headers: headers() });
  }
  await checkResponse(res, url);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Expected repo list');
  return data.map((r) => ({ name: r.name, full_name: r.full_name }));
}

/**
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<{ default_branch: string, full_name: string }>}
 */
export async function getRepoInfo(owner, repo) {
  const url = `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const res = await fetch(url, { headers: headers() });
  await checkResponse(res, url);
  const data = await res.json();
  return {
    default_branch: data.default_branch,
    full_name: data.full_name,
  };
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} path
 * @param {string} ref
 * @returns {Promise<Array<{ name: string, path: string, type: 'file'|'dir', download_url: string|null }>>}
 */
export async function listContents(owner, repo, path, ref) {
  const pathPart = path ? `/${path}` : '';
  const url = `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${pathPart}?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, { headers: headers() });
  await checkResponse(res, url);
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('Expected directory listing');
  }
  return data.map((item) => ({
    name: item.name,
    path: item.path,
    type: item.type === 'dir' ? 'dir' : 'file',
    download_url: item.download_url || null,
  }));
}

/**
 * Build raw URL for a file (no fetch). Use this for iframe src so the document loads from
 * raw.githubusercontent.com and relative assets (CSS, JS) load same-origin, avoiding ORB.
 * @param {string} owner
 * @param {string} repo
 * @param {string} path
 * @param {string} ref
 * @returns {string}
 */
export function getRawUrl(owner, repo, path, ref) {
  return `${RAW_BASE}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Fetch file content. With token: use Contents API (works for private repos). Without token: fetch raw URL (public only).
 * @param {string} owner
 * @param {string} repo
 * @param {string} path
 * @param {string} ref
 * @returns {Promise<{ text: string, rawUrl: string }>}
 */
/**
 * Decode base64 to UTF-8 string (atob gives Latin-1, so • etc. become mojibake).
 */
function base64ToUtf8(base64) {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

export async function getFileContent(owner, repo, path, ref) {
  const rawUrl = getRawUrl(owner, repo, path, ref);
  if (token) {
    const url = `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`;
    const res = await fetch(url, { headers: headers() });
    await checkResponse(res, url);
    const data = await res.json();
    if (data.content === undefined) throw new Error('Not a file');
    const text = base64ToUtf8(data.content);
    return { text, rawUrl };
  }
  const res = await fetch(rawUrl);
  await checkResponse(res, rawUrl);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buf);
  return { text, rawUrl };
}

function headers() {
  const h = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) {
    h['Authorization'] = `token ${token}`;
  }
  return h;
}

/**
 * @param {Response} res
 * @param {string} url
 */
async function checkResponse(res, url) {
  if (res.ok) return;
  const remaining = res.headers.get('X-RateLimit-Remaining');
  if (res.status === 403 && remaining === '0') {
    throw new Error('GitHub API rate limit exceeded. Try again later or add a token in Settings.');
  }
  if (res.status === 404) {
    throw new Error('Not found. Check owner/repo, branch, and path.');
  }
  let msg = `Request failed: ${res.status}`;
  try {
    const data = await res.json();
    if (data.message) msg = data.message;
  } catch (_) {}
  throw new Error(msg);
}

/**
 * Build base URL for raw files (directory): no trailing slash for "directory" of a file.
 * e.g. owner/repo/ref/folder/sub → https://raw.githubusercontent.com/owner/repo/ref/folder/sub
 */
export function rawBaseUrl(owner, repo, ref, path) {
  const pathPart = path ? `/${path.replace(/\/[^/]+$/, '')}` : '';
  const dirPath = pathPart ? pathPart.split('/').map(encodeURIComponent).join('/') : '';
  return `${RAW_BASE}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}${dirPath}`;
}
