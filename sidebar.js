(function () {
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    if (!localStorage.getItem('userEmail')) return;

    const page = location.pathname.split('/').pop() || 'index.html';

    const NAV = [
        { href: 'index.html',              label: 'HOME',         svg: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 15 22"/>' },
        { href: 'profilo.html',            label: 'PROFILO',      svg: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' },
        { href: 'index.html?open=promo',   label: 'PROMO',        svg: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>' },
        { href: 'index.html?open=impostazioni', label: 'IMPOSTAZIONI', svg: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' },
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
        .ls-esci { position: sticky; bottom: 0; background: #fff; padding-top: 8px; }
        @media (prefers-color-scheme: dark) { .ls-esci { background: #1c1c1e; } }
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
            .modal-overlay { align-items: center !important; padding: 20px !important; }
            .modal-box { border-radius: 24px !important; padding-bottom: 24px !important; }
            .modal-handle { display: none !important; }
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
        `<div class="ls-esci"><button class="ls-item" onclick="localStorage.clear();location.href='login.html'" style="color:#0fba8d">` +
        `<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>ESCI</button></div>`;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    document.body.prepend(sidebar);
})();
