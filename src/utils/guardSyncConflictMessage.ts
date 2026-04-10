/**
 * Maps `GuardSyncEventResult.conflict_code` and `effective_status` from gatepass-api
 * (`_apply_offline_sync_event`, `_sync_duplicate_result`) to short operator-facing copy.
 */

export function guardSyncResultUserMessage(input: {
  effective_status: string;
  conflict_code?: string | null;
  detail: string;
}): string {
  const code = (input.conflict_code || '').trim();
  const detail = (input.detail || '').trim();

  const byCode: Record<string, string> = {
    not_yet_active: 'Check-in time is before this pass was active. Ask an administrator to review the sync log.',
    cancelled_pass: 'This pass was cancelled on the server. Entry or exit was not applied.',
    expired_pass: 'The pass had already expired at the uploaded time. Entry or exit was not applied.',
    pass_exhausted: 'This pass had no uses left when the event was uploaded.',
    duplicate_check_in:
      'The guest was already checked in at the uploaded time. Duplicate check-in was rejected.',
    already_closed_session:
      'The visit was already closed before this check-out. The uploaded check-out was rejected.',
    out_of_order_check_out:
      'Check-out was uploaded without a matching check-in on the server. Ask an administrator to review.',
    exit_not_authorized:
      'This guest type requires host approval before check-out. Use online verification or ask the resident.',
    duplicate_conflict: 'This offline event matched a previous denied record on the server.',
  };

  if (code && byCode[code]) {
    return byCode[code];
  }

  if (input.effective_status === 'duplicate_accepted') {
    return 'This offline event was already applied (duplicate upload ignored).';
  }
  if (input.effective_status === 'duplicate_conflict') {
    return byCode.duplicate_conflict;
  }
  if (input.effective_status === 'accepted') {
    return detail || 'Offline event applied successfully.';
  }
  if (input.effective_status === 'conflict') {
    return detail || 'The server could not apply this offline event.';
  }

  return detail || 'Sync finished with an unknown status.';
}
