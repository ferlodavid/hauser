// @ts-expect-error Vitest runs in Node; production app types intentionally exclude Node globals.
import { mkdtempSync, rmSync } from 'node:fs';
// @ts-expect-error Vitest runs in Node; production app types intentionally exclude Node globals.
import { tmpdir } from 'node:os';
// @ts-expect-error Vitest runs in Node; production app types intentionally exclude Node globals.
import { join } from 'node:path';
// @ts-expect-error Vitest runs in Node; production app types intentionally exclude Node globals.
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Native Node ESM Servermodul.
import { createNotificationRulesStore, serveNotifications, notificationAutomationSpecs, syncNotificationAutomations } from '../../server/notification-rules.mjs';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function rule(index: number) {
  return {
    id: `doors_windows_fenster_${index}`,
    category: 'doors-windows',
    name: `Fenster Nummer ${index}`,
    entityId: `binary_sensor.fenster_${index}`,
    enabled: true,
    triggers: [
      { key: 'open', label: 'Das Fenster ist schon länger offen', enabled: true, kind: 'state', to: ['on'], delayMinutes: 15 },
      { key: 'closed', label: 'Das Fenster ist wieder zu', enabled: false, kind: 'state', to: ['off'], delayMinutes: 0 },
    ],
  };
}

function put(service: unknown, body: unknown): Promise<{ status: number; payload: { ok?: boolean; rules?: unknown[] } }> {
  const req = Object.assign(Readable.from([JSON.stringify(body)]), { method: 'PUT', url: '/api/notifications/rules', headers: {} });
  return new Promise((resolve) => {
    let status = 0;
    const res = {
      writeHead(code: number) { status = code; return res; },
      end(chunk: string) { resolve({ status, payload: JSON.parse(chunk) }); },
    };
    serveNotifications(req, res, service);
  });
}

describe('Benachrichtigungsregeln am Server', () => {
  it('räumt eine Regel erst auf, wenn keiner ihrer aktiven Auslöser mehr zutrifft', () => {
    const source = rule(1);
    source.triggers[1].enabled = true;
    const specs = notificationAutomationSpecs([source]);
    const cleanup = specs.find((spec: { config: { description: string } }) => spec.config.description.endsWith('/ resolved'));
    expect(cleanup.config.use_blueprint.input.notification_id).toBe('hauser_rule_doors_windows_fenster_1');
    expect(cleanup.config.use_blueprint.input.active_triggers).toEqual(source.triggers);
    expect(notificationAutomationSpecs([{ ...source, category: 'laundry' }])).toHaveLength(2);
    expect(notificationAutomationSpecs([{ ...source, enabled: false }])).toEqual([]);
  });

  it('aktualisiert installierte Blueprints auch ohne Push und lädt die Automationen neu', async () => {
    const writes: Array<{ path: string; yaml: string; allow_override: boolean }> = [];
    const services: unknown[] = [];
    const source = rule(2);
    const specs = notificationAutomationSpecs([source]);
    const client = {
      async ws(type: string, payload: { domain?: string; service?: string }) {
        if (type === 'blueprint/list') return {
          'hauser/notify-state-v1.yaml': {}, 'hauser/notify-resolved-v1.yaml': {},
        };
        if (type === 'blueprint/save') writes.push(payload as unknown as typeof writes[number]);
        if (type === 'config/entity_registry/list') return [];
        if (type === 'call_service') services.push(payload);
        return {};
      },
      async rest(_method: string, path: string) {
        const id = path.split('/').at(-1);
        return { status: 200, body: specs.find((spec: { id: string }) => spec.id === id)?.config };
      },
    };
    const result = await syncNotificationAutomations(client, [source]);
    expect(result.unchanged).toBe(2);
    expect(writes.map((entry) => entry.path)).toEqual(['hauser/notify-state-v1.yaml', 'hauser/notify-resolved-v1.yaml']);
    expect(writes.every((entry) => entry.allow_override)).toBe(true);
    expect(writes[0].yaml).toContain("state_attr(source_entity, 'friendly_name')");
    expect(services).toEqual([{ domain: 'automation', service: 'reload' }]);
  });

  it('speichert eine Regelliste, die größer als ein Kilobyte ist (ralleur/hauser#25)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hauser-rules-'));
    dirs.push(dir);
    const store = createNotificationRulesStore(join(dir, 'notification-rules.json'));
    const rules = Array.from({ length: 12 }, (_, index) => rule(index));
    expect(JSON.stringify({ rules }).length).toBeGreaterThan(1024);
    const result = await put({ store, sync: async () => ({ created: 12, updated: 0, deleted: 0, unchanged: 0 }) }, { rules, colors: {} });
    expect(result.status).toBe(200);
    expect(result.payload.ok).toBe(true);
    expect(store.read().rules).toHaveLength(12);
  });
});
