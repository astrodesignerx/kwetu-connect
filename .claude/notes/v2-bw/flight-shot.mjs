// One-off: screenshot just the flight plan at phone width, before and after a horizontal scroll.
import { chromium } from './tools/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ executablePath: 'C:/Users/ether/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
const date = '2026-11-08T08:00:00Z';
const user = { id: 'u', email: 'amina@example.test', username: 'amina', displayName: 'Amina Otieno', role: 'Admin', createdAt: date };
const company = { id: 'c', name: 'Nandi Hills Tea Room', domain: 'nandi.example.test', notes: null, projectCount: 1, threadCount: 0, createdAt: date, updatedAt: date };
const project = { id: 'p', companyId: 'c', name: 'November morning campaign', description: null, status: 'Active', threadCount: 0, createdAt: date };
const flights = [
  { id: 'f1', projectId: 'p', siteName: 'Kisumu Ndogo Road', startDate: '2026-11-14', endDate: '2026-12-11' },
  { id: 'f2', projectId: 'p', siteName: 'Eldoret Uganda Road roundabout northbound', startDate: '2026-10-20', endDate: '2026-11-20' },
  { id: 'f3', projectId: 'p', siteName: 'Westlands', startDate: '2026-12-01', endDate: '2027-01-30' },
];
for (const [theme, width] of [['light', 390], ['dark', 1440]]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
  await context.addInitScript(({ theme, user }) => { localStorage.setItem('ccos-theme', theme); localStorage.setItem('ccos-auth', JSON.stringify({ state: { token: 't', user }, version: 0 })); }, { theme, user });
  await context.routeWebSocket('**/hubs/**', () => {});
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:3024') return route.abort();
    const p = url.pathname;
    if (!p.startsWith('/api/') && !p.startsWith('/hubs/')) return route.continue();
    const json = p === '/api/auth/me' ? user : p === '/api/mail/overview' ? { mailboxes: [] } : p.endsWith('/flights') ? flights
      : p.endsWith('/insights') ? { clientId: 'c', startDate: '2026-10-01', endDate: '2026-12-31', boardsBooked: 3, firstReply: { days: 30, count: 0, medianSeconds: null }, lastContactAt: null, threadCount: 0, waitingCount: 0, recentThreads: [] }
      : p.startsWith('/api/companies/') ? { company, projects: [project], contacts: [], threads: [] } : p === '/api/companies' ? [company] : [];
    return route.fulfill({ json });
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3024/clients/detail?id=c', { waitUntil: 'networkidle' });
  const plan = page.getByRole('region', { name: /Flight plan from/ });
  await plan.scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
  await plan.screenshot({ path: `screenshots/flight-${width}-${theme}.png` });
  if (width === 390) { await plan.evaluate(el => el.scrollTo(200, 0)); await page.waitForTimeout(300); await plan.screenshot({ path: `screenshots/flight-${width}-${theme}-scrolled.png` }); }
  await context.close();
}
await browser.close();
