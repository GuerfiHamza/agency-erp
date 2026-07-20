import { relations } from 'drizzle-orm';

import { account, session, user } from './auth';
import { calendarEvents, eventAttendees } from './calendar';
import { clients, contacts } from './clients';
import { companies } from './companies';
import { activities, leads, opportunities } from './crm';
import { documents } from './documents';
import { expenses } from './expenses';
import { invitations } from './invitations';
import { invoiceItems, invoices } from './invoices';
import { notifications } from './notifications';
import { payments } from './payments';
import { proformaInvoiceItems, proformaInvoices } from './proforma-invoices';
import { projectMembers, projects } from './projects';
import { purchaseOrderItems, purchaseOrders } from './purchase-orders';
import { quoteItems, quotes } from './quotes';
import { permissions, rolePermissions, roles, userRoles } from './rbac';
import { savedReports, settings } from './settings';
import { suppliers } from './suppliers';
import { taskComments, tasks, timeEntries } from './tasks';

/**
 * Drizzle relations for the query API (`db.query.*.findMany({ with: ... })`).
 *
 * Defined centrally rather than beside each table: the graph is cyclic
 * (clients → projects → invoices → clients), and central definitions keep those
 * cycles out of the module import graph where they would be load-order bugs.
 *
 * These are a query-builder convenience only. The real integrity guarantees are
 * the foreign keys on the tables themselves.
 *
 * `relationName` is required wherever two tables are joined by more than one
 * column (for example a user is both the creator and the approver of a purchase
 * order); without it Drizzle cannot tell the two paths apart.
 */

export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(user),
  roles: many(roles),
  invitations: many(invitations),
  clients: many(clients),
  contacts: many(contacts),
  leads: many(leads),
  opportunities: many(opportunities),
  activities: many(activities),
  projects: many(projects),
  tasks: many(tasks),
  timeEntries: many(timeEntries),
  documents: many(documents),
  calendarEvents: many(calendarEvents),
  suppliers: many(suppliers),
  quotes: many(quotes),
  proformaInvoices: many(proformaInvoices),
  invoices: many(invoices),
  purchaseOrders: many(purchaseOrders),
  payments: many(payments),
  expenses: many(expenses),
  notifications: many(notifications),
  settings: many(settings),
  savedReports: many(savedReports),
}));

export const userRelations = relations(user, ({ one, many }) => ({
  company: one(companies, { fields: [user.companyId], references: [companies.id] }),
  sessions: many(session),
  accounts: many(account),
  roles: many(userRoles, { relationName: 'userRoleMember' }),
  ownedClients: many(clients),
  managedProjects: many(projects),
  projectMemberships: many(projectMembers),
  assignedTasks: many(tasks, { relationName: 'taskAssignee' }),
  timeEntries: many(timeEntries),
  expenses: many(expenses, { relationName: 'expenseOwner' }),
  notifications: many(notifications),
  sentInvitations: many(invitations),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

// ---- RBAC -------------------------------------------------------------------

export const rolesRelations = relations(roles, ({ one, many }) => ({
  company: one(companies, { fields: [roles.companyId], references: [companies.id] }),
  permissions: many(rolePermissions),
  users: many(userRoles),
  invitations: many(invitations),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  company: one(companies, { fields: [invitations.companyId], references: [companies.id] }),
  role: one(roles, { fields: [invitations.roleId], references: [roles.id] }),
  invitedByUser: one(user, { fields: [invitations.invitedBy], references: [user.id] }),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  roles: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, { fields: [rolePermissions.permissionId], references: [permissions.id] }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(user, {
    fields: [userRoles.userId],
    references: [user.id],
    relationName: 'userRoleMember',
  }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
  assignedByUser: one(user, {
    fields: [userRoles.assignedBy],
    references: [user.id],
    relationName: 'userRoleAssigner',
  }),
}));

// ---- Clients / CRM ----------------------------------------------------------

export const clientsRelations = relations(clients, ({ one, many }) => ({
  company: one(companies, { fields: [clients.companyId], references: [companies.id] }),
  owner: one(user, { fields: [clients.ownerId], references: [user.id] }),
  contacts: many(contacts),
  opportunities: many(opportunities),
  activities: many(activities),
  projects: many(projects),
  quotes: many(quotes),
  proformaInvoices: many(proformaInvoices),
  invoices: many(invoices),
  documents: many(documents),
  payments: many(payments),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  company: one(companies, { fields: [contacts.companyId], references: [companies.id] }),
  client: one(clients, { fields: [contacts.clientId], references: [clients.id] }),
  opportunities: many(opportunities),
  activities: many(activities),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  company: one(companies, { fields: [leads.companyId], references: [companies.id] }),
  owner: one(user, { fields: [leads.ownerId], references: [user.id] }),
  convertedClient: one(clients, { fields: [leads.convertedClientId], references: [clients.id] }),
  activities: many(activities),
}));

export const opportunitiesRelations = relations(opportunities, ({ one, many }) => ({
  company: one(companies, { fields: [opportunities.companyId], references: [companies.id] }),
  client: one(clients, { fields: [opportunities.clientId], references: [clients.id] }),
  contact: one(contacts, { fields: [opportunities.contactId], references: [contacts.id] }),
  owner: one(user, { fields: [opportunities.ownerId], references: [user.id] }),
  activities: many(activities),
  quotes: many(quotes),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  company: one(companies, { fields: [activities.companyId], references: [companies.id] }),
  lead: one(leads, { fields: [activities.leadId], references: [leads.id] }),
  client: one(clients, { fields: [activities.clientId], references: [clients.id] }),
  opportunity: one(opportunities, { fields: [activities.opportunityId], references: [opportunities.id] }),
  contact: one(contacts, { fields: [activities.contactId], references: [contacts.id] }),
  createdBy: one(user, { fields: [activities.createdById], references: [user.id] }),
}));

// ---- Delivery ---------------------------------------------------------------

export const projectsRelations = relations(projects, ({ one, many }) => ({
  company: one(companies, { fields: [projects.companyId], references: [companies.id] }),
  client: one(clients, { fields: [projects.clientId], references: [clients.id] }),
  manager: one(user, { fields: [projects.managerId], references: [user.id] }),
  members: many(projectMembers),
  tasks: many(tasks),
  timeEntries: many(timeEntries),
  documents: many(documents),
  calendarEvents: many(calendarEvents),
  quotes: many(quotes),
  invoices: many(invoices),
  purchaseOrders: many(purchaseOrders),
  expenses: many(expenses),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(user, { fields: [projectMembers.userId], references: [user.id] }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  company: one(companies, { fields: [tasks.companyId], references: [companies.id] }),
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  parentTask: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: 'taskHierarchy',
  }),
  subtasks: many(tasks, { relationName: 'taskHierarchy' }),
  assignee: one(user, { fields: [tasks.assigneeId], references: [user.id], relationName: 'taskAssignee' }),
  createdBy: one(user, { fields: [tasks.createdById], references: [user.id], relationName: 'taskCreator' }),
  comments: many(taskComments),
  timeEntries: many(timeEntries),
  documents: many(documents),
}));

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  company: one(companies, { fields: [taskComments.companyId], references: [companies.id] }),
  task: one(tasks, { fields: [taskComments.taskId], references: [tasks.id] }),
  author: one(user, { fields: [taskComments.authorId], references: [user.id] }),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  company: one(companies, { fields: [timeEntries.companyId], references: [companies.id] }),
  project: one(projects, { fields: [timeEntries.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [timeEntries.taskId], references: [tasks.id] }),
  user: one(user, { fields: [timeEntries.userId], references: [user.id] }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  company: one(companies, { fields: [documents.companyId], references: [companies.id] }),
  client: one(clients, { fields: [documents.clientId], references: [clients.id] }),
  project: one(projects, { fields: [documents.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [documents.taskId], references: [tasks.id] }),
  uploadedBy: one(user, { fields: [documents.uploadedById], references: [user.id] }),
}));

export const calendarEventsRelations = relations(calendarEvents, ({ one, many }) => ({
  company: one(companies, { fields: [calendarEvents.companyId], references: [companies.id] }),
  client: one(clients, { fields: [calendarEvents.clientId], references: [clients.id] }),
  project: one(projects, { fields: [calendarEvents.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [calendarEvents.taskId], references: [tasks.id] }),
  createdBy: one(user, { fields: [calendarEvents.createdById], references: [user.id] }),
  attendees: many(eventAttendees),
}));

export const eventAttendeesRelations = relations(eventAttendees, ({ one }) => ({
  event: one(calendarEvents, { fields: [eventAttendees.eventId], references: [calendarEvents.id] }),
  user: one(user, { fields: [eventAttendees.userId], references: [user.id] }),
}));

// ---- Commercial -------------------------------------------------------------

export const suppliersRelations = relations(suppliers, ({ one, many }) => ({
  company: one(companies, { fields: [suppliers.companyId], references: [companies.id] }),
  purchaseOrders: many(purchaseOrders),
  expenses: many(expenses),
  payments: many(payments),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  company: one(companies, { fields: [quotes.companyId], references: [companies.id] }),
  client: one(clients, { fields: [quotes.clientId], references: [clients.id] }),
  contact: one(contacts, { fields: [quotes.contactId], references: [contacts.id] }),
  opportunity: one(opportunities, { fields: [quotes.opportunityId], references: [opportunities.id] }),
  project: one(projects, { fields: [quotes.projectId], references: [projects.id] }),
  createdBy: one(user, { fields: [quotes.createdById], references: [user.id] }),
  items: many(quoteItems),
  proformaInvoices: many(proformaInvoices),
  invoices: many(invoices),
}));

export const quoteItemsRelations = relations(quoteItems, ({ one }) => ({
  quote: one(quotes, { fields: [quoteItems.quoteId], references: [quotes.id] }),
}));

export const proformaInvoicesRelations = relations(proformaInvoices, ({ one, many }) => ({
  company: one(companies, { fields: [proformaInvoices.companyId], references: [companies.id] }),
  client: one(clients, { fields: [proformaInvoices.clientId], references: [clients.id] }),
  contact: one(contacts, { fields: [proformaInvoices.contactId], references: [contacts.id] }),
  project: one(projects, { fields: [proformaInvoices.projectId], references: [projects.id] }),
  quote: one(quotes, { fields: [proformaInvoices.quoteId], references: [quotes.id] }),
  createdBy: one(user, { fields: [proformaInvoices.createdById], references: [user.id] }),
  items: many(proformaInvoiceItems),
  invoices: many(invoices),
}));

export const proformaInvoiceItemsRelations = relations(proformaInvoiceItems, ({ one }) => ({
  proformaInvoice: one(proformaInvoices, {
    fields: [proformaInvoiceItems.proformaInvoiceId],
    references: [proformaInvoices.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  company: one(companies, { fields: [invoices.companyId], references: [companies.id] }),
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
  contact: one(contacts, { fields: [invoices.contactId], references: [contacts.id] }),
  project: one(projects, { fields: [invoices.projectId], references: [projects.id] }),
  quote: one(quotes, { fields: [invoices.quoteId], references: [quotes.id] }),
  proformaInvoice: one(proformaInvoices, {
    fields: [invoices.proformaInvoiceId],
    references: [proformaInvoices.id],
  }),
  createdBy: one(user, { fields: [invoices.createdById], references: [user.id] }),
  items: many(invoiceItems),
  payments: many(payments),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  company: one(companies, { fields: [purchaseOrders.companyId], references: [companies.id] }),
  supplier: one(suppliers, { fields: [purchaseOrders.supplierId], references: [suppliers.id] }),
  project: one(projects, { fields: [purchaseOrders.projectId], references: [projects.id] }),
  createdBy: one(user, {
    fields: [purchaseOrders.createdById],
    references: [user.id],
    relationName: 'purchaseOrderCreator',
  }),
  approvedBy: one(user, {
    fields: [purchaseOrders.approvedById],
    references: [user.id],
    relationName: 'purchaseOrderApprover',
  }),
  items: many(purchaseOrderItems),
  payments: many(payments),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderItems.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  company: one(companies, { fields: [payments.companyId], references: [companies.id] }),
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
  client: one(clients, { fields: [payments.clientId], references: [clients.id] }),
  purchaseOrder: one(purchaseOrders, {
    fields: [payments.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  supplier: one(suppliers, { fields: [payments.supplierId], references: [suppliers.id] }),
  recordedBy: one(user, { fields: [payments.recordedById], references: [user.id] }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  company: one(companies, { fields: [expenses.companyId], references: [companies.id] }),
  project: one(projects, { fields: [expenses.projectId], references: [projects.id] }),
  supplier: one(suppliers, { fields: [expenses.supplierId], references: [suppliers.id] }),
  user: one(user, { fields: [expenses.userId], references: [user.id], relationName: 'expenseOwner' }),
  approvedBy: one(user, {
    fields: [expenses.approvedById],
    references: [user.id],
    relationName: 'expenseApprover',
  }),
}));

// ---- Platform ---------------------------------------------------------------

export const notificationsRelations = relations(notifications, ({ one }) => ({
  company: one(companies, { fields: [notifications.companyId], references: [companies.id] }),
  user: one(user, { fields: [notifications.userId], references: [user.id] }),
}));

export const settingsRelations = relations(settings, ({ one }) => ({
  company: one(companies, { fields: [settings.companyId], references: [companies.id] }),
  user: one(user, { fields: [settings.userId], references: [user.id] }),
}));

export const savedReportsRelations = relations(savedReports, ({ one }) => ({
  company: one(companies, { fields: [savedReports.companyId], references: [companies.id] }),
  owner: one(user, { fields: [savedReports.ownerId], references: [user.id] }),
}));
