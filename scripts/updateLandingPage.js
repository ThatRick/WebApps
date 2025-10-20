#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const landingPath = path.join(repoRoot, 'index.html');

const IGNORED_DIRS = new Set([
  '.git',
  '.github',
  'scripts',
  'node_modules'
]);

function toTitleCase(value) {
  return value
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

async function collectHtmlFiles(dir, relative) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const htmlFiles = [];

  const indexFile = entries.find(entry => entry.isFile() && entry.name === 'index.html');
  if (indexFile) {
    htmlFiles.push({
      title: toTitleCase(relative || 'home'),
      href: relative ? `${relative}/` : './'
    });
    return htmlFiles;
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.html')) {
      const name = entry.name.slice(0, -5);
      const title = toTitleCase(relative ? `${relative} ${name}` : name);
      const href = relative ? `${relative}/${entry.name}` : entry.name;
      htmlFiles.push({ title, href });
    }
  }

  return htmlFiles;
}

async function discoverPrototypes() {
  const prototypes = [];
  const entries = await fs.readdir(repoRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const childPath = path.join(repoRoot, entry.name);
      const childProtos = await collectHtmlFiles(childPath, entry.name);
      prototypes.push(...childProtos);
    } else if (entry.isFile() && entry.name.endsWith('.html') && entry.name !== 'index.html') {
      const name = entry.name.slice(0, -5);
      prototypes.push({ title: toTitleCase(name), href: entry.name });
    }
  }

  prototypes.sort((a, b) => a.title.localeCompare(b.title));
  return prototypes;
}

function renderPage(items) {
  const listItems = items.map(item => `        <li><a href="${item.href}">${item.title}</a></li>`).join('\n');
  const generated = new Date().toISOString();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Prototype Landing Page</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --bg: #f5f7fb;
      --card: #ffffff;
      --text: #111827;
      --muted: #6b7280;
      --accent: #2563eb;
      background-color: var(--bg);
      color: var(--text);
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 3rem 1.5rem;
      background: var(--bg);
    }
    main {
      width: min(720px, 100%);
      background: var(--card);
      border-radius: 18px;
      padding: 2.4rem 2rem;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.1);
      display: grid;
      gap: 2rem;
    }
    header h1 {
      margin: 0;
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    header p {
      margin: 0.35rem 0 0;
      color: var(--muted);
    }
    ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 0.75rem;
    }
    li {
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(14, 165, 233, 0.08));
      border-radius: 12px;
      padding: 0.9rem 1rem;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    li:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 24px rgba(59, 130, 246, 0.2);
    }
    a {
      color: var(--accent);
      font-weight: 600;
      text-decoration: none;
    }
    a:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 4px;
      border-radius: 8px;
    }
    footer {
      font-size: 0.85rem;
      color: var(--muted);
      text-align: center;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Prototype Launchpad</h1>
      <p>Auto-generated directory of available prototypes. Add a folder with an <code>index.html</code> (or any HTML file) and run <code>node scripts/updateLandingPage.js</code> to refresh this page.</p>
    </header>
    <section aria-labelledby="prototype-list">
      <h2 id="prototype-list" style="font-size:1.3rem; margin:0;">Prototypes</h2>
      <ul>
${listItems || '        <li>No prototypes discovered yet.</li>'}
      </ul>
    </section>
    <footer>
      <p>Last generated on ${generated}</p>
    </footer>
  </main>
</body>
</html>`;
}

async function main() {
  const prototypes = await discoverPrototypes();
  const html = renderPage(prototypes);
  await fs.writeFile(landingPath, html + '\n');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
