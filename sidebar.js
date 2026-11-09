(function () {
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    if (!localStorage.getItem('userEmail')) return;

    const page = location.pathname.split('/').pop() || 'index.html';

    const NAV = [
        { href: 'index.html', label: 'HOME', svg: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 15 22"/>' },
        { href: 'profilo.html', label: 'PROFILO', svg: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' },
    ];

    const css = `
        .ls-sidebar {
            position: fixed; left: 0; top: 0; bottom: 0; width: 240px;
            background: #fff; border-right: 2px solid #f2f2f7;
            display: flex; flex-direction: column;
            padding: 28px 12px 24px; z-index: 150;
            overflow-y: auto; box-sizing: border-box;
        }
        .ls-logo {
            font-weight: 900; font-size: 20px; letter-spacing: -0.8px;
            color: #0fba8d; padding: 0 8px 28px; flex-shrink: 0;
        }
        .ls-item {
            display: flex; align-items: center; gap: 12px;
            padding: 13px 16px; font-size: 13px; font-weight: 700;
            border-radius: 14px; text-decoration: none; color: #333;
            border: none; background: none; cursor: pointer;
            font-family: inherit; width: 100%; text-align: left;
            margin-bottom: 2px; letter-spacing: 0;
        }
        .ls-item:hover { background: rgba(0,0,0,0.04); }
        .ls-item.active { background: rgba(15,186,141,0.1); color: #0fba8d; }
        .ls-item svg { width: 20px; height: 20px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        .ls-spacer { flex: 1; min-height: 20px; }
        @media (prefers-color-scheme: dark) {
            .ls-sidebar { background: #1c1c1e; border-color: #48484a; }
            .ls-item { color: #e8e8ec; }
            .ls-item:hover { background: rgba(255,255,255,0.08); }
        }
        @media (min-width: 1024px) {
            body { padding-left: 240px !important; }
            .tab-bar { display: none !important; }
            .hdr { left: 240px !important; right: 0 !important; }
            .upload-bar { left: 240px !important; }
        }
        @media (min-width: 1280px) {
            body { padding-left: 260px !important; }
            .ls-sidebar { width: 260px; }
            .hdr { left: 260px !important; }
            .upload-bar { left: 260px !important; }
        }
    `;

    const sidebar = document.createElement('div');
    sidebar.className = 'ls-sidebar';
    sidebar.innerHTML =
        `<a href="index.html" class="ls-logo" style="text-decoration:none">LISTANDO</a>` +
        NAV.map(n =>
            `<a href="${n.href}" class="ls-item${page === n.href ? ' active' : ''}">` +
            `<svg viewBox="0 0 24 24">${n.svg}</svg>${n.label}</a>`
        ).join('') +
        `<div class="ls-spacer"></div>` +
        `<button class="ls-item" onclick="localStorage.clear();location.href='login.html'" style="color:#0fba8d">` +
        `<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>ESCI</button>`;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    document.body.prepend(sidebar);
})();
