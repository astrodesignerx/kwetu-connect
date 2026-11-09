import { chromium } from './tools/node_modules/playwright-core/index.mjs';
import { mkdir, writeFile, statfs } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

// Run against the isolated server described in PROGRESS.md. No API request leaves Chromium.
// Beyond the v2-everywhere checks this asserts strict black and white, no text under
// 12 px and no horizontal overflow on every capture.
const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, 'screenshots');
await mkdir(output, { recursive: true });
const origin = 'http://127.0.0.1:3024';
const date = '2026-11-08T08:00:00Z';
const user = { id: 'fixture-user', email: 'amina.otieno.workspace.administration@example.test', username: 'amina.otieno', displayName: 'Amina Otieno Wanjiru', role: 'Admin', createdAt: date };
const mailbox = { id: 'fixture-mailbox', email: 'bookings.and.campaign.management@example.test', userId: user.id, ownerEmail: user.email, imapHost: 'mail.example.test', imapPort: 993, smtpHost: 'mail.example.test', smtpPort: 465, isActive: true, createdAt: date, lastVerifiedAt: date, syncState: 'Syncing', syncError: null, lastSyncCompletedAt: date, messageCount: 120, unreadCount: 3 };
const company = { id: 'fixture-client', name: 'Nandi Hills Tea Room and Community Events', domain: 'nandi.example.test', notes: 'Morning campaigns and community events.', projectCount: 2, threadCount: 3, createdAt: date, updatedAt: date };
const project = { id: 'fixture-project', companyId: company.id, name: 'November morning campaign', description: 'Campaign planning and artwork.', status: 'Active', threadCount: 3, createdAt: date };
const flight = { id: 'fixture-flight', projectId: project.id, siteName: 'Kisumu Ndogo Road', startDate: '2026-11-14', endDate: '2026-12-11' };
const threads = ['Artwork for the November morning campaign', 'December booking dates and pricing', 'Proof of play for last month', 'Community event artwork approved for the Kisumu Ndogo Road and Eldoret Uganda Road screens from mid November to the second week of December'].map((subject, i) => ({ id: `fixture-thread-${i}`, subject, snippet: 'Could you confirm the morning schedule and artwork deadline?', participants: 'Wanjiru Kiprop <wanjiru.campaign.coordinator@nandi.example.test>', messageCount: 2, firstDate: date, lastDate: date, hasUnread: i < 2, hasAttachments: false, replyState: i < 2 ? 'ToReply' : 'Awaiting', stateSince: date, needsNudge: false, clientId: company.id, clientName: company.name }));
const template = { id: 'fixture-template', name: 'Campaign booking confirmation', description: 'Confirm a client booking and the next steps.', subject: 'Your campaign, {{client_name}}', bodyHtml: '<p>Hi {{client_name}},</p><p>Your campaign booking is confirmed. Please send your artwork by Friday.</p><p>Thank you,<br>Kwetu Connect Advertising</p>', variables: ['client_name'], skipBrandWrap: false, createdAt: date, updatedAt: date };
const brand = { id: 'fixture-brand', name: 'Kwetu Connect Advertising', primaryColor: '#171717', accentColor: '#62666E', textColor: '#171717', backgroundColor: '#FFFFFF', logoUrl: null, headerHtml: '<p><strong>Kwetu Connect Advertising</strong></p>', signatureHtml: '<p>Amina Otieno<br>Campaign bookings</p>', footerHtml: '<p>Eldoret, Kenya</p>' };
const draft = { id: 'fixture-draft', mailboxConnectionId: mailbox.id, replyToMessageId: null, replyToAddress: null, references: null, toAddrs: 'wanjiru.campaign.coordinator@nandi.example.test', ccAddrs: null, bccAddrs: null, subject: 'Your November campaign booking and artwork schedule', bodyText: 'Thank you for your booking. We will confirm the schedule shortly.', bodyHtml: '<p>Thank you for your booking. We will confirm the schedule shortly.</p>', hasAttachments: false, attachmentMetaJson: null, createdAt: date, updatedAt: date, replyToThreadId: null, skipBrandWrap: false, inReplyTo: null, attachments: [], lastSend: null, rowVersion: 1 };
const routes = [
  ['clients', '/clients'], ['client-detail', '/clients/detail?id=fixture-client'], ['drafts', '/drafts'],
  ['settings', '/settings'], ['profile', '/settings/profile'], ['mailboxes', '/settings/mailboxes'],
  ['connect', '/settings/mailboxes/connect'], ['brand-kit', '/settings/brand-kit'], ['templates', '/settings/templates'],
  ['template-new', '/settings/templates/new'], ['template-edit', '/settings/templates/edit?id=fixture-template'],
  ['admin-users', '/settings/admin/users'], ['admin-audit', '/settings/admin/audit'],
  ['login', '/login'], ['register', '/register'], ['mail', '/mail?m=fixture-mailbox'],
  // The development fixture only exists under next dev. CHECK_DEV=1 adds it.
  ...(process.env.CHECK_DEV ? [['dev-mail', '/dev/mail']] : []),
];
const results = { captures: [], failures: [], requests: [], unknown: [], forbiddenRequests: [], consoleErrors: [], contrast: [], colour: [], smallText: [] };
const selection = process.env.CHECK_ROUTES?.split(',');
const scenarios = process.env.CHECK_SCENARIOS?.split(',') ?? ['populated', 'empty', 'error', 'loading'];
const widths = process.env.CHECK_WIDTHS?.split(',').map(Number) ?? [1440, 1280, 390];
const themes = process.env.CHECK_THEMES?.split(',') ?? ['light', 'dark'];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Users/ether/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-default-browser-check'] });

function fixture(url, request, scenario) {
  const p = url.pathname;
  const empty = scenario === 'empty';
  const list = (items) => empty ? [] : items;
  const input = request.postDataJSON?.() ?? {};
  if (p === '/api/auth/registration-mode') return { mode: 'invite' };
  if (p === '/api/auth/me') return user;
  if (p === '/api/auth/login' || p === '/api/auth/register') return { error: 'Fixture sign-in could not complete. Please try again.' };
  if (p === '/api/mail/overview') return { mailboxes: list([mailbox]) };
  if (p === '/api/mailboxes' || p === '/api/admin/mailboxes') return request.method() === 'POST' ? mailbox : list([mailbox]);
  if (p.endsWith('/reverify')) return mailbox;
  if (p.endsWith('/sync-stats')) return { mailboxId: mailbox.id, syncState: 'Syncing', syncError: null, lastSyncCompletedAt: date, conversationCount: 26, messagesSynced: 120, hourly: [{ hour: date, count: 10 }], errorCount24Hours: 0 };
  if (p === '/api/mail/thread-counts') return { inbox: empty ? 0 : 4, unread: empty ? 0 : 2, mine: 1, sent: 2, archive: 0, all: 6 };
  if (p === '/api/mail/threads') return { items: list(threads), total: empty ? 0 : threads.length };
  if (p === '/api/mail/insights') return list(threads);
  if (/\/api\/mail\/threads\/[^/]+$/.test(p)) return { ...threads[0], id: p.split('/').at(-1), messages: [{ id: 1, messageId: 'fixture-message@example.test', folderName: 'INBOX', folderSpecialUse: 'Inbox', fromName: 'Wanjiru Kiprop', fromAddr: 'wanjiru.campaign.coordinator@nandi.example.test', toAddrs: mailbox.email, ccAddrs: null, date, subject: threads[0].subject, snippet: threads[0].snippet, bodyText: 'Hi Amina,\n\nPlease find our artwork details below. Could you confirm the morning schedule for our November campaign?\n\nThank you,\nWanjiru', bodyHtml: null, flags: [], hasAttachments: false, attachments: [] }] };
  if (p.endsWith('/read') || p.endsWith('/sync')) return null;
  if (p.endsWith('/associations')) return { company: empty ? null : company, projects: list([project]), contacts: [] };
  if (p.endsWith('/assignment')) return null;
  if (p.endsWith('/notes')) return [];
  if (p === '/api/org/members') return list([user]);
  if (p === '/api/mail/brief') return { unreadCount: empty ? 0 : 2, waitingOnMe: list(threads.slice(0, 2).map(t => ({ ...t, waitingSeconds: 86400 }))), awaitingCount: 2, upcomingFlights: list([{ ...flight, clientId: company.id, client: company.name }]), firstReply: { medianSeconds: empty ? null : 3600, count: empty ? 0 : 12, workingDays: 7, daily: [{ date: '2026-11-08', count: 3, medianSeconds: 3600 }] } };
  if (p === '/api/mail/drafts') return request.method() === 'POST' ? { ...draft, ...input } : list([draft]);
  if (p.startsWith('/api/mail/drafts/')) return draft;
  if (p === '/api/companies/activity') return list([company, { ...company, id: 'fixture-client-2', name: 'Ziwa Bakery', domain: 'ziwa.example.test' }].map((c, i) => ({ ...c, boardsBooked: 3, waitingCount: i === 0 ? 2 : 0, status: i === 0 ? 'WaitingOnUs' : 'AllReplied', weeks: Array.from({ length: 8 }, (_, j) => ({ startDate: `2026-10-${String(j + 1).padStart(2, '0')}`, conversations: j % 4 + 1 })) })));
  if (p === '/api/companies') return list([company]);
  if (p.endsWith('/insights')) return { clientId: company.id, startDate: '2026-10-01', endDate: '2026-12-31', boardsBooked: empty ? 0 : 3, firstReply: { days: 30, count: empty ? 0 : 12, medianSeconds: empty ? null : 3600 }, lastContactAt: empty ? null : date, threadCount: empty ? 0 : 3, waitingCount: empty ? 0 : 2, recentThreads: list(threads) };
  if (p.startsWith('/api/companies/')) return { company, projects: list([project]), contacts: list([{ id: 'fixture-contact', name: 'Wanjiru Kiprop Community Campaign Coordination', email: 'wanjiru.campaign.coordinator@nandi.example.test', messageCount: 12 }]), threads: list(threads) };
  if (p.endsWith('/flights')) return list([flight]);
  if (p === '/api/brand-kit') return empty ? { ...brand, name: '', headerHtml: '', signatureHtml: '', footerHtml: '' } : brand;
  if (p === '/api/templates') return list([template]);
  if (p === '/api/templates/previews') return list([{ ...template, bodyHtml: '<html><body><p>Campaign booking confirmation</p><p>Thank you for your booking.</p></body></html>', lists: [], subject: template.subject }]);
  if (p === '/api/templates/preview') return { bodyHtml: (input.bodyHtml ?? template.bodyHtml).replaceAll('{{client_name}}', input.values?.client_name || 'Nandi Hills Tea Room'), subject: (input.subject ?? template.subject).replaceAll('{{client_name}}', 'Nandi Hills Tea Room') };
  if (p.startsWith('/api/templates/')) return empty ? { ...template, name: 'Untitled template', description: '', subject: '', bodyHtml: '', variables: [] } : template;
  if (p === '/api/ai/status') return { configured: true };
  if (p === '/api/admin/users') return list([{ ...user, mailboxCount: 1, lastLoginAt: date }, { ...user, id: 'fixture-member', email: 'peter.otieno.campaign.operations@example.test', displayName: 'Peter Otieno', role: 'Member', mailboxCount: 1, lastLoginAt: date }]);
  if (p === '/api/admin/invitations') return list([{ id: 'fixture-invite', email: 'new.colleague.workspace.operations@example.test', role: 'Member', createdAt: date, expiresAt: '2026-11-14T08:00:00Z', acceptedAt: null, revokedAt: null, status: 'pending' }]);
  if (p === '/api/admin/audit-log/daily') return { today: '2026-11-08', weeks: 12, days: empty ? [] : [{ date: '2026-11-07', count: 8 }, { date: '2026-11-08', count: 4 }] };
  if (p === '/api/admin/audit-log') return list([{ id: 1, actorEmail: user.email, action: 'admin.invitation.create', targetEmail: 'new.colleague.workspace.operations@example.test', details: 'Member invitation created.', createdAt: date }, { id: 2, actorEmail: user.email, action: 'template.update', targetEmail: null, details: 'Campaign confirmation template updated.', createdAt: date }]);
  if (p === '/api/workspace/overview') return { workspaceName: brand.name, memberCount: empty ? 0 : 8, mailboxCount: empty ? 0 : 2, templateCount: empty ? 0 : 4, sendsLast30Days: empty ? 0 : 126, pendingInvitations: empty ? 0 : 1, mailboxHealth: { healthy: empty ? 0 : 1, pending: 0, backfilling: 0, needsAttention: empty ? 0 : 1 } };
  return undefined;
}

async function makePage({ theme, width, scenario, anonymous = false, reducedMotion = 'no-preference' }) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion, serviceWorkers: 'block' });
  await context.addInitScript(({ theme, anonymous, user }) => {
    if (window.top !== window) return;
    localStorage.setItem('ccos-theme', theme);
    if (!anonymous) localStorage.setItem('ccos-auth', JSON.stringify({ state: { token: 'local-fixture-only', user }, version: 0 }));
  }, { theme, anonymous, user });
  await context.routeWebSocket('**/hubs/**', socket => {
    socket.onMessage(message => {
      for (const packet of String(message).split('\x1e').filter(Boolean)) {
        const value = JSON.parse(packet);
        if (value.protocol) socket.send('{}\x1e');
        if (value.invocationId) socket.send(JSON.stringify({ type: 3, invocationId: value.invocationId, result: [] }) + '\x1e');
      }
    });
  });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (['5280', '5432', '3014'].includes(url.port)) { results.forbiddenRequests.push(request.url()); return route.abort(); }
    if (url.origin !== origin && ['http:', 'https:'].includes(url.protocol)) { results.forbiddenRequests.push(request.url()); return route.abort(); }
    if (url.pathname.startsWith('/hubs/')) return route.fulfill({ json: { negotiateVersion: 1, connectionId: 'fixture', connectionToken: 'fixture', availableTransports: [{ transport: 'WebSockets', transferFormats: ['Text', 'Binary'] }] } });
    if (!url.pathname.startsWith('/api/')) return route.continue();
    results.requests.push({ path: url.pathname, scenario, method: request.method() });
    if (scenario === 'loading') {
      await new Promise(resolve => setTimeout(resolve, 6000));
      if (request.failure()) return;
    }
    const response = fixture(url, request, scenario);
    if (response === undefined) { results.unknown.push(url.pathname); return route.fulfill({ status: 501, json: { error: `Missing fixture for ${url.pathname}` } }); }
    const fail = scenario === 'error' || url.pathname === '/api/auth/login' || url.pathname === '/api/auth/register';
    const noContent = response === null && request.method() !== 'GET' && !fail;
    return route.fulfill({ status: fail ? 503 : noContent ? 204 : 200, ...(noContent ? {} : { json: fail ? { error: 'This could not load. Please try again.' } : response }) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => results.failures.push({ kind: 'uncaught', message: error.message, url: page.url() }));
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource.*50[13]/.test(message.text())) results.consoleErrors.push({ message: message.text(), url: page.url() });
  });
  return { context, page };
}

// Allowed colour exceptions: rendered email in iframes, attachment and image thumbnails,
// colour pickers and swatches that show a user's own chosen colours.
const EXEMPT = 'iframe, img, video, canvas, input[type=color], [data-user-colour]';
function inspect(exempt) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  const rgba = value => {
    if (cache.has(value)) return cache.get(value);
    const m = value.match(/^rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\)$/);
    let out;
    if (m) out = [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
    else { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; out = [d[0], d[1], d[2], d[3] / 255]; }
    cache.set(value, out); return out;
  };
  const colour = [], small = [];
  const describe = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest(exempt) || el.closest('nextjs-portal, script, style')) continue;
    if (!el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const props = ['color', 'background-color'];
    for (const side of ['top', 'right', 'bottom', 'left']) if (parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0 && cs.getPropertyValue(`border-${side}-style`) !== 'none') props.push(`border-${side}-color`);
    if (el instanceof SVGElement) props.push('fill', 'stroke');
    for (const prop of props) {
      const value = cs.getPropertyValue(prop);
      if (!value || value === 'none' || value.startsWith('url')) continue;
      const [r, g, b, a] = rgba(value);
      if (a === 0) continue;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 2) colour.push({ el: describe(el), prop, value });
    }
    const hasText = [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim());
    if (hasText && parseFloat(cs.fontSize) < 12) small.push({ el: describe(el), size: cs.fontSize, text: el.textContent.trim().slice(0, 40) });
  }
  return { colour: colour.slice(0, 20), small: small.slice(0, 20) };
}

async function capture(page, name) {
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' });
  const metrics = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
    overflows: [...document.querySelectorAll('main, .v2-scroll, .v2-content, dialog[open]')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => ({ tag: el.tagName, className: el.className, width: el.clientWidth, scrollWidth: el.scrollWidth })) }));
  if (metrics.scrollWidth > metrics.width + 1 || metrics.overflows.length) results.failures.push({ kind: 'overflow', name, ...metrics });
  const found = await page.evaluate(inspect, EXEMPT);
  if (found.colour.length) { results.colour.push({ name, items: found.colour }); results.failures.push({ kind: 'colour', name, first: found.colour[0] }); }
  if (found.small.length) { results.smallText.push({ name, items: found.small }); results.failures.push({ kind: 'small-text', name, first: found.small[0] }); }
  results.captures.push(name);
}

try {
  for (const [name, route] of routes.filter(([name]) => !selection || selection.includes(name))) {
    for (const width of widths) for (const theme of themes) for (const scenario of scenarios) {
      const disk = await statfs(root);
      assert(disk.bavail * disk.bsize >= 1_500_000_000, 'STOP: C: free space is below 1.5 GB');
      const { context, page } = await makePage({ theme, width, scenario, anonymous: ['login', 'register', 'dev-mail'].includes(name) });
      try {
        const routeUrl = route + (name === 'dev-mail' ? `?scenario=${scenario}` : '');
        await page.goto(origin + routeUrl, { waitUntil: scenario === 'loading' ? 'domcontentloaded' : 'networkidle', timeout: 60000 });
        await page.locator('main, .signal-auth').first().waitFor({ timeout: 15000 });
        await page.waitForTimeout(scenario === 'error' ? 1250 : 400);
        await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
        if (!['login', 'register'].includes(name)) {
          const current = await page.locator('.mail-rail a[aria-current=page]').allTextContents();
          const expected = ['mail', 'dev-mail'].includes(name) ? 'Inbox' : name.includes('template') ? 'Templates'
            : name.includes('client') ? 'Clients' : name === 'drafts' ? 'Drafts' : 'Settings';
          const labels = await page.locator('.mail-rail a[aria-current=page]').evaluateAll(links => links.map(link => link.getAttribute('aria-label')));
          assert.equal(current.length, 1, `${name}: exactly one rail destination should be active`);
          assert.deepEqual(labels, [expected], `${name}: wrong active rail destination`);
        }
        if (['profile', 'connect', 'template-new'].includes(name) && scenario !== 'empty') {
          if (name === 'profile') await page.getByLabel('Display name', { exact: true }).fill('Amina Otieno Wanjiru');
          if (name === 'connect') {
            await page.getByLabel('Email address', { exact: true }).fill(mailbox.email);
            await page.getByLabel('Password', { exact: true }).fill('Fixture-only-123');
          }
          if (name === 'template-new') await page.getByRole('textbox').first().fill('Campaign booking confirmation');
          if (scenario === 'error' || scenario === 'loading') {
            const submit = name === 'profile' ? page.getByRole('button', { name: 'Save details', exact: true })
              : name === 'connect' ? page.getByRole('button', { name: 'Connect', exact: true }) : page.getByRole('button', { name: 'Create and start writing', exact: true });
            await submit.click();
            if (scenario === 'error') await page.getByText('This could not load. Please try again.', { exact: true }).waitFor();
            else await page.waitForTimeout(150);
          }
        }
        // Auth and mutation-only forms have no data-driven empty/loading state.
        if (['login', 'register'].includes(name) && scenario !== 'empty' && scenario !== 'loading') {
          const fields = page.locator('input:not([type=checkbox]):not([type=hidden])');
          for (const field of await fields.all()) {
            const id = await field.getAttribute('id');
            await field.fill(id === 'email' ? user.email : id === 'displayName' ? user.displayName : id === 'invite' ? 'fixture-invitation' : id === 'password' ? 'Fixture-only-123' : 'amina.otieno');
          }
          if (scenario === 'error') { await page.locator('button[type=submit]').click(); await page.getByText('This could not load. Please try again.', { exact: true }).waitFor(); }
        }
        await capture(page, `${name}-${width}-${theme}-${scenario}`);
        const scroller = page.locator('.v2-scroll');
        if (await scroller.count() && await scroller.evaluate(el => el.scrollHeight > el.clientHeight + 200)) {
          await scroller.evaluate(el => el.scrollTo(0, el.scrollHeight));
          await capture(page, `${name}-${width}-${theme}-${scenario}-bottom`);
        }
      } catch (error) { results.failures.push({ kind: 'capture', name, width, theme, scenario, message: error.message }); }
      finally { await context.close(); }
    }
    console.log(`Captured ${name}. ${results.failures.length} failures so far.`);
  }

  if (!selection || selection.includes('overlays')) for (const width of widths) for (const theme of themes) {
    const { context, page } = await makePage({ width, theme, scenario: 'populated' });
    try {
      await page.goto(origin + '/mail?m=fixture-mailbox&id=fixture-thread-0', { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      await capture(page, `mail-reader-${width}-${theme}`);
      await page.getByRole('button', { name: width === 390 ? 'Open navigation' : 'Mail folders and mailboxes', exact: true }).click();
      await capture(page, `more-${width}-${theme}`);
      await page.getByRole('button', { name: 'Close navigation', exact: true }).click();
      await page.locator('#signal-drawer').waitFor({ state: 'hidden' });
      await page.keyboard.press('Control+k');
      await page.getByRole('combobox').waitFor();
      await capture(page, `palette-${width}-${theme}`);
      await page.keyboard.press('Escape');
      await page.getByRole('combobox').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'New email', exact: true }).click();
      await page.locator('.compose-backdrop').waitFor();
      await capture(page, `compose-${width}-${theme}`);
      await page.keyboard.press('Escape');
      await page.locator('.compose-backdrop').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'New email', exact: true }).click();
      await page.locator('.compose-backdrop').waitFor();
      await page.getByRole('button', { name: 'Insert field', exact: true }).click();
      await page.getByRole('menu').waitFor();
      await capture(page, `popover-${width}-${theme}`);
      await page.getByRole('button', { name: 'Insert field', exact: true }).click();
      await page.getByRole('menu').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Use a template', exact: true }).click();
      await page.getByRole('dialog', { name: 'Pick a template', exact: true }).waitFor();
      await capture(page, `template-picker-${width}-${theme}`);
      await page.getByRole('dialog', { name: 'Pick a template', exact: true }).getByRole('button', { name: 'Use this template', exact: true }).click();
      await page.getByRole('dialog', { name: 'Fill in Campaign booking confirmation', exact: true }).waitFor();
      await capture(page, `template-fill-${width}-${theme}`);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('button', { name: 'Close compose', exact: true }).click();
      await page.locator('.compose-backdrop').waitFor({ state: 'hidden' });
      if (width !== 390) { await page.getByRole('button', { name: 'Notifications', exact: true }).click(); await capture(page, `toast-${width}-${theme}`); }
    } catch (error) { results.failures.push({ kind: 'overlays', width, theme, message: error.message }); }
    finally { await context.close(); }
  }
  if (!selection || selection.includes('reduced-motion')) {
    const { context, page } = await makePage({ width: 390, theme: 'dark', scenario: 'populated', reducedMotion: 'reduce' });
    try {
      await page.goto(origin + '/clients', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.getByRole('button', { name: 'Close navigation' }).click();
      await page.locator('#signal-drawer').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'New email', exact: true }).click();
      await page.locator('.compose-backdrop').waitFor();
      await page.getByRole('button', { name: 'Insert field', exact: true }).click();
      await page.getByRole('menu').waitFor();
      await page.getByRole('button', { name: 'Insert field', exact: true }).click();
      await page.getByRole('menu').waitFor({ state: 'hidden' });
      await page.keyboard.press('Escape');
      await page.locator('.compose-backdrop').waitFor({ state: 'hidden' });
      await capture(page, 'reduced-motion-390-dark');
    } catch (error) { results.failures.push({ kind: 'reduced-motion', message: error.message }); }
    finally { await context.close(); }
  }
  // Motion: the main content enters once per app load, not again on navigation, and
  // nothing loops except busy spinners.
  if (!selection || selection.includes('motion')) {
    const { context, page } = await makePage({ width: 1440, theme: 'light', scenario: 'populated' });
    try {
      await page.goto(origin + '/clients', { waitUntil: 'networkidle' });
      assert.equal(await page.locator('main[data-enter=true]').count(), 1, 'first load should play the entrance');
      await page.locator('.mail-rail a[aria-label=Settings]').click();
      await page.waitForURL('**/settings');
      await page.locator('main').waitFor();
      await page.waitForTimeout(400);
      assert.equal(await page.locator('main[data-enter=true]').count(), 0, 'navigation should not replay the entrance');
      const loops = await page.evaluate(() => document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations === Infinity).map(a => a.animationName ?? 'animation'));
      assert.deepEqual(loops, [], 'no looping animation on an idle page');
      results.captures.push('motion-check');
    } catch (error) { results.failures.push({ kind: 'motion', message: error.message }); }
    finally { await context.close(); }
  }
  if (!selection || selection.includes('contrast')) for (const theme of ['light', 'dark']) {
    const { context, page } = await makePage({ width: 1440, theme, scenario: 'populated' });
    try {
      await page.goto(origin + '/clients', { waitUntil: 'networkidle' });
      const pairs = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        const probe = document.createElement('span'); document.body.append(probe);
        const colour = token => {
          probe.style.color = `var(${token})`;
          ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = getComputedStyle(probe).color; ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        const luminance = rgb => rgb.map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((v, c, i) => v + c * [.2126, .7152, .0722][i], 0);
        const values = [];
        for (const ink of ['--fg', '--muted']) for (const paper of ['--surface', '--raise', '--bg']) {
          const a = luminance(colour(ink)), b = luminance(colour(paper));
          values.push({ ink, paper, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) });
        }
        probe.remove(); return values;
      });
      results.contrast.push({ theme, pairs });
      for (const pair of pairs) assert(pair.ratio >= 4.5, `${theme}: ${pair.ink} on ${pair.paper} contrast ${pair.ratio}`);
    } catch (error) { results.failures.push({ kind: 'contrast', theme, message: error.message }); }
    finally { await context.close(); }
  }
} finally {
  await browser.close();
  await writeFile(path.join(root, process.env.CHECK_REPORT ?? 'browser-results.json'), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify({ captures: results.captures.length, failures: results.failures, unknown: [...new Set(results.unknown)], forbiddenRequests: results.forbiddenRequests, consoleErrors: results.consoleErrors }, null, 2));
assert.equal(results.failures.length, 0, 'Browser assertions failed');
assert.equal(results.unknown.length, 0, 'Uncovered API fixture');
assert.equal(results.forbiddenRequests.length, 0, 'Unexpected network request');
assert.equal(results.consoleErrors.length, 0, 'Unexpected browser console error');
