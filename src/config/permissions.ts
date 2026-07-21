/**
 * The permission catalogue — the single source of truth for what the software
 * can do.
 *
 * Lives in config rather than the seeder because two consumers need the same
 * list: the seeder writes it into `permissions`, and the Phase 3 authorization
 * service checks against it. Defining it twice would guarantee drift.
 *
 * A permission slug is `resource:action` and is a stable contract — code
 * references these strings, so rename with care.
 */

export const ACTIONS = ['create', 'read', 'update', 'delete'] as const;
export type Action = (typeof ACTIONS)[number];

/** Actions beyond CRUD that carry real authority and must be grantable separately. */
export const EXTRA_ACTIONS = ['approve', 'send', 'export', 'assign'] as const;
export type ExtraAction = (typeof EXTRA_ACTIONS)[number];

export type AnyAction = Action | ExtraAction;

/**
 * Resource → the actions that make sense for it.
 *
 * Not every resource gets every action: there is no "delete a report", and
 * approving an invoice is not a thing — you send it.
 */
export const RESOURCE_ACTIONS = {
  companies: ['read', 'update', 'delete'],
  users: ['create', 'read', 'update', 'delete'],
  roles: ['create', 'read', 'update', 'delete', 'assign'],
  permissions: ['read'],
  clients: ['create', 'read', 'update', 'delete', 'export'],
  contacts: ['create', 'read', 'update', 'delete'],
  leads: ['create', 'read', 'update', 'delete'],
  opportunities: ['create', 'read', 'update', 'delete'],
  activities: ['create', 'read', 'update', 'delete'],
  projects: ['create', 'read', 'update', 'delete', 'export'],
  tasks: ['create', 'read', 'update', 'delete', 'assign'],
  time_entries: ['create', 'read', 'update', 'delete', 'approve'],
  documents: ['create', 'read', 'update', 'delete'],
  calendar: ['create', 'read', 'update', 'delete'],
  quotes: ['create', 'read', 'update', 'delete', 'send', 'export'],
  proforma_invoices: ['create', 'read', 'update', 'delete', 'send', 'export'],
  invoices: ['create', 'read', 'update', 'delete', 'send', 'export'],
  purchase_orders: ['create', 'read', 'update', 'delete', 'send', 'approve'],
  suppliers: ['create', 'read', 'update', 'delete'],
  payments: ['create', 'read', 'update', 'delete', 'export'],
  expenses: ['create', 'read', 'update', 'delete', 'approve'],
  reports: ['read', 'export'],
  notifications: ['read', 'update'],
  settings: ['read', 'update'],
  /** The public-website portfolio: projects, their technology/category catalogues, and the API key. */
  portfolio: ['create', 'read', 'update', 'delete'],
} as const satisfies Record<string, readonly AnyAction[]>;

export type Resource = keyof typeof RESOURCE_ACTIONS;

export const RESOURCES = Object.keys(RESOURCE_ACTIONS) as Resource[];

/**
 * The union of every valid `resource:action` string, derived from the table
 * above rather than declared separately.
 *
 * This is why the checks are typed rather than stringly: `requirePermission`
 * only accepts a real slug, so a typo like `'invoices:delte'` fails to compile
 * instead of silently denying access forever — a bug that is invisible in review
 * and only shows up as a confused user.
 */
export type PermissionSlug = {
  [R in Resource]: `${R}:${(typeof RESOURCE_ACTIONS)[R][number]}`;
}[Resource];

export interface PermissionDefinition {
  slug: string;
  resource: string;
  action: string;
  description: string;
}

/** Flattened catalogue: one entry per resource/action pair. */
export const PERMISSIONS: PermissionDefinition[] = Object.entries(RESOURCE_ACTIONS).flatMap(
  ([resource, actions]) =>
    actions.map((action) => ({
      slug: `${resource}:${action}`,
      resource,
      action,
      description: `${action} ${resource.replace(/_/g, ' ')}`,
    })),
);

export const PERMISSION_SLUGS = PERMISSIONS.map((permission) => permission.slug) as PermissionSlug[];

/** Slugs for every action on a resource. */
const all = (resource: Resource): string[] =>
  RESOURCE_ACTIONS[resource].map((action) => `${resource}:${action}`);

/** Slugs for a chosen subset of actions on a resource. */
const only = (resource: Resource, actions: readonly AnyAction[]): string[] =>
  actions
    .filter((action) => (RESOURCE_ACTIONS[resource] as readonly AnyAction[]).includes(action))
    .map((action) => `${resource}:${action}`);

/**
 * System roles seeded into every company.
 *
 * `isSystem` roles cannot be renamed or deleted through the UI — the role
 * service refuses — because losing the owner role would lock a tenant out of
 * its own account.
 */
export interface SystemRoleDefinition {
  slug: string;
  name: string;
  description: string;
  /** `null` means every permission, including ones added in future releases. */
  permissions: string[] | null;
}

export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    slug: 'owner',
    name: 'Owner',
    description: 'Full control of the company, including billing and deletion.',
    // Deliberately null rather than a snapshot: an owner must automatically gain
    // permissions introduced by later releases.
    permissions: null,
  },
  {
    slug: 'admin',
    name: 'Administrator',
    description: 'Manages people, clients, and finances. Cannot delete the company.',
    permissions: PERMISSION_SLUGS.filter((slug) => slug !== 'companies:delete'),
  },
  {
    slug: 'manager',
    name: 'Manager',
    description: 'Runs delivery and client work; reads financials without issuing them.',
    permissions: [
      ...only('companies', ['read']),
      ...only('users', ['read']),
      ...all('clients'),
      ...all('contacts'),
      ...all('leads'),
      ...all('opportunities'),
      ...all('activities'),
      ...all('projects'),
      ...all('tasks'),
      ...all('time_entries'),
      ...all('documents'),
      ...all('calendar'),
      ...all('quotes'),
      ...only('proforma_invoices', ['create', 'read', 'update', 'send']),
      ...only('invoices', ['read', 'export']),
      ...only('purchase_orders', ['create', 'read', 'update']),
      ...only('suppliers', ['read']),
      ...only('payments', ['read']),
      ...only('expenses', ['create', 'read', 'update', 'approve']),
      ...all('reports'),
      ...all('notifications'),
      ...only('settings', ['read']),
      ...all('portfolio'),
    ],
  },
  {
    slug: 'member',
    name: 'Member',
    description: 'Does the work: own tasks, time, and expenses; read-only elsewhere.',
    permissions: [
      ...only('companies', ['read']),
      ...only('users', ['read']),
      ...only('clients', ['read']),
      ...only('contacts', ['read']),
      ...only('activities', ['create', 'read', 'update']),
      ...only('projects', ['read']),
      ...only('tasks', ['create', 'read', 'update']),
      ...only('time_entries', ['create', 'read', 'update', 'delete']),
      ...only('documents', ['create', 'read', 'update']),
      ...all('calendar'),
      ...only('expenses', ['create', 'read', 'update']),
      ...all('notifications'),
      ...only('settings', ['read']),
      ...only('portfolio', ['read']),
    ],
  },
];
