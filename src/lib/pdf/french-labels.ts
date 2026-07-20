/**
 * Status values are stored as their English enum literal (`draft`, `sent`, ...)
 * across every document module — that's the schema, and it stays English since
 * changing it would touch every module's validation/service/tests for no
 * functional gain. This is only the print-time translation, covering the
 * union of every status any of the four document modules can be in.
 */
const STATUS_LABELS_FR: Record<string, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  accepted: 'Accepté',
  rejected: 'Refusé',
  expired: 'Expiré',
  cancelled: 'Annulé',
  converted: 'Converti',
  partially_paid: 'Partiellement payée',
  paid: 'Payée',
  overdue: 'En retard',
  void: 'Annulée (avoir)',
  confirmed: 'Confirmé',
  partially_received: 'Partiellement reçu',
  received: 'Reçu',
};

/** Falls back to the raw value (never throws) for a status this map doesn't know yet. */
export function translateStatus(status: string): string {
  return STATUS_LABELS_FR[status] ?? status;
}
